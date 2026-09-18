import copy
import hashlib
import json
import secrets
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/saves", tags=["saves"])

# Job levels are packed on the client wire as (totalEXP << 12) | level; the
# ReTB `characters.job_levels` column stores the decoded level (int, cap 90).
JOB_LEVEL_MASK = (1 << 12) - 1
JOB_LEVEL_MAX = 90


def generate_hex_token() -> str:
    """Generate a random 16-hex-digit token."""
    return secrets.token_hex(8).upper()


def decode_job_level(packed: Any) -> int:
    """Decode one packed wire job-level slot to a plain level int (0-90)."""
    try:
        level = int(packed) & JOB_LEVEL_MASK
    except (TypeError, ValueError):
        return 0
    return max(0, min(JOB_LEVEL_MAX, level))


def _as_float(value: Any) -> Any:
    """Coerce to float, returning the input unchanged when not numeric."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def apply_client_float_traps(session_data: dict) -> None:
    """Coerce the client's LitJson double fields to JSON decimals, in place.

    The game client reads these through LitJson's double accessor: an integer
    is a parse failure, not a rounding difference (see project-liminal-gate
    save_validation.py FLOAT_FIELDS). reTB coerces its typed session fields at
    serve time, but chrdata ``date`` is an untyped extra that reaches the
    client verbatim -- an int ``0`` there hangs the boot on the loading screen.
    """
    for entry in session_data.get("chrdata", []) or []:
        if not isinstance(entry, dict):
            continue
        if "date" in entry:
            entry["date"] = _as_float(entry["date"])
        for key in ("jobLevels", "jobSlots"):
            levels = entry.get(key)
            if isinstance(levels, list):
                entry[key] = [_as_float(v) for v in levels]
    for key in ("lastupdate", "refillStartTime"):
        if key in session_data:
            session_data[key] = _as_float(session_data[key])
    quest_clears = session_data.get("questClearDate")
    if isinstance(quest_clears, dict):
        session_data["questClearDate"] = {
            stage: _as_float(stamp) for stage, stamp in quest_clears.items()
        }


def compendium_species_level(entry: Any) -> "tuple[int, int] | None":
    """Return ``(species_id, level)`` for a companion entry, or None if unreadable.

    The ReTB Companion Compendium (``_buddy_compendium``) is keyed by the buddy
    SPECIES id (``bid``): reTB serves it back as ``buddyInfo.record`` and the
    game client looks each id up in its BuddyData table. Entries without a
    positive ``bid`` are skipped rather than keyed by the per-copy inventory id
    (``iid``) -- inventory ids grow without bound and point past the end of
    BuddyData, which crashes the client at boot.
    """
    if isinstance(entry, bool):
        return None
    if isinstance(entry, (int, float, str)):
        try:
            species = int(entry)
        except (TypeError, ValueError):
            return None
        return (species, 1) if species > 0 else None
    if not isinstance(entry, dict):
        return None
    try:
        species = int(entry.get("bid") or 0)
        level = int(entry.get("lv") or 1)
    except (TypeError, ValueError):
        return None
    if species <= 0:
        return None
    return species, max(1, level)


def fold_buddy_compendium(compendium: Dict[str, int], entries: Any) -> None:
    """Fold companion entries into the ever-owned compendium (bid -> max level)."""
    if not isinstance(entries, (list, tuple)):
        return
    for entry in entries:
        parsed = compendium_species_level(entry)
        if parsed is None:
            continue
        species, level = parsed
        key = str(species)
        if level > compendium.get(key, 0):
            compendium[key] = level


def liminal_record_entries(buddy_list: Any, compendium: Any) -> List[dict]:
    """Build the Liminal Gate ``buddyInfo.record`` list: best copy per species.

    Liminal Gate derives ``record`` from the owned list (one entry per distinct
    companion, the best copy held) and persists it as a LIST of entries -- a
    bare ``{bid: level}`` map is not the shape its save tooling expects.
    """
    best: Dict[int, dict] = {}
    if isinstance(buddy_list, list):
        for entry in buddy_list:
            parsed = compendium_species_level(entry)
            if parsed is None:
                continue
            species, level = parsed
            if species not in best or level > int(best[species].get("lv", 1)):
                best[species] = entry if isinstance(entry, dict) else {"bid": species, "lv": level}

    def _record_entry(species: int, template: dict) -> dict:
        return {
            "bid": species,
            "chrID": 0,
            "date": 0.0,
            "exp": 0,
            "flag": 1,
            "iid": template.get("iid", species) if isinstance(template, dict) else species,
            "lv": template.get("lv", 1) if isinstance(template, dict) else 1,
        }

    record = [_record_entry(species, best[species]) for species in sorted(best)]
    # Ever-owned species that only live in the compendium (sold / consumed).
    if isinstance(compendium, dict):
        extras = []
        for key, value in compendium.items():
            parsed = compendium_species_level({"bid": key, "lv": value})
            if parsed is None or parsed[0] in best:
                continue
            extras.append(_record_entry(parsed[0], {"bid": parsed[0], "lv": parsed[1]}))
        extras.sort(key=lambda item: item["bid"])
        record.extend(extras)
    return record


def detect_save_format(data: Any) -> str:
    """Detect whether a JSON dictionary is ReTB or Project Liminal Gate format."""
    if not isinstance(data, dict):
        return "unknown"
    if data.get("format") == "retb-save/1" or (
        "tables" in data and isinstance(data.get("tables"), dict) and "session" in data["tables"]
    ):
        return "retb"
    if "accounts" in data and isinstance(data.get("accounts"), dict):
        return "liminal"
    if "active_account_id" in data:
        return "liminal"
    return "unknown"


def parse_account_summary_liminal(account_id: str, acc: dict) -> dict:
    """Generate a high-level summary of an account from Liminal Gate save."""
    ud = acc.get("userdata", {})
    username = acc.get("username") or ud.get("username") or "Player"
    chrdata = ud.get("chrdata", [])
    buddy_info = ud.get("buddyInfo", {})
    buddy_count = 0
    if isinstance(buddy_info, dict):
        buddy_list = buddy_info.get("list", buddy_info.get("user_companions", []))
        buddy_count = len(buddy_list) if isinstance(buddy_list, list) else 0
    elif isinstance(buddy_info, list):
        buddy_count = len(buddy_info)

    item_list = ud.get("itemList", [])
    item_count = sum(1 for it in item_list if it and it > 0)
    quest_clears = len(ud.get("questClearDate", {}))

    return {
        "account_id": account_id,
        "username": username,
        "character_count": len(chrdata),
        "buddy_count": buddy_count,
        "coins": ud.get("coins", 0),
        "energy_free": ud.get("freeEnergy", 0),
        "energy_paid": ud.get("energy", 0),
        "item_count": item_count,
        # itemList[slot - 1] holds the count of 1-based item `slot`.
        "items": [
            {"id": idx + 1, "count": int(v)}
            for idx, v in enumerate(item_list)
            if isinstance(v, (int, float)) and v and v > 0
        ],
        "quest_clears": quest_clears,
        "progress_code": ud.get("progressCode", 0),
        "tutorial_phase": acc.get("tutorial_phase", "unknown"),
        "top_characters": [
            {
                "id": c.get("id"),
                "job_id": c.get("jobID", 0),
                "luck": c.get("luck", 0) or 0,
                "sb": c.get("skillBoost", 0) or 0,
                "job_levels": c.get("jobLevels", [1, 0, 0]),
            }
            for c in chrdata
        ],
    }


def parse_account_summary_retb(retb_data: dict) -> dict:
    """Generate a high-level summary from ReTB save."""
    userid = retb_data.get("userid") or ""
    username = retb_data.get("username") or "Player"
    tables = retb_data.get("tables", {})
    
    session_row = tables.get("session", {}).get("rows", [])
    session_data = {}
    if session_row and len(session_row[0]) > 1:
        try:
            session_data = json.loads(session_row[0][1])
        except Exception:
            session_data = {}
            
    if not userid and "users" in tables and tables["users"].get("rows"):
        userid = str(tables["users"]["rows"][0][0])
        
    chr_rows = tables.get("characters", {}).get("rows", [])
    session_chrs = session_data.get("chrdata", [])
    char_count = max(len(chr_rows), len(session_chrs))

    # Coins and energy
    coins = session_data.get("valuables", {}).get("coins", 0)
    free_energy = session_data.get("valuables", {}).get("freeEnergy", 0)
    paid_energy = session_data.get("valuables", {}).get("energy", 0)
    stamina = session_data.get("current_stamina", 20)

    if "user_valuables" in tables and tables["user_valuables"].get("rows"):
        vrow = tables["user_valuables"]["rows"][0]
        vcols = tables["user_valuables"].get("cols", [])
        vdict = dict(zip(vcols, vrow))
        if not coins and "coins" in vdict:
            coins = vdict.get("coins", 0)
        if not free_energy and "max_free_energy" in vdict:
            free_energy = vdict.get("max_free_energy", 0)
        if "stamina" in vdict:
            stamina = vdict.get("stamina", stamina)

    buddy_info = session_data.get("buddyInfo", [])
    buddy_count = len(buddy_info) if isinstance(buddy_info, list) else len(buddy_info.get("user_companions", []))
    item_list = session_data.get("itemList", [])
    item_count = sum(1 for it in item_list if it and it > 0)
    quest_clears = len(session_data.get("extra_quest_clears", {}))

    top_chrs = []
    if session_chrs:
        top_chrs = [
            {
                "id": c.get("id"),
                "job_id": c.get("jobID", 0),
                "luck": c.get("luck", 0) or 0,
                "sb": c.get("skillBoost", 0) or 0,
                "job_levels": c.get("jobLevels", [1, 0, 0]),
            }
            for c in session_chrs
        ]
    elif chr_rows:
        for r in chr_rows:
            jl = r[5]
            if isinstance(jl, str):
                try:
                    jl = json.loads(jl)
                except Exception:
                    pass
            top_chrs.append({
                "id": r[1],
                "luck": r[2],
                "sb": r[3],
                "job_id": r[4],
                "job_levels": jl,
            })

    return {
        "account_id": userid,
        "username": username,
        "character_count": char_count,
        "buddy_count": buddy_count,
        "coins": coins,
        "energy_free": free_energy,
        "energy_paid": paid_energy,
        "stamina": stamina,
        "item_count": item_count,
        # itemList[slot - 1] holds the count of 1-based item `slot`.
        "items": [
            {"id": idx + 1, "count": int(v)}
            for idx, v in enumerate(item_list)
            if isinstance(v, (int, float)) and v and v > 0
        ],
        "quest_clears": quest_clears,
        "progress_code": session_data.get("progressCode", 0),
        "tutorial_phase": "free_roam",
        "top_characters": top_chrs,
    }


def liminal_to_retb(liminal_data: dict, account_id: Optional[str] = None) -> dict:
    """Convert Project Liminal Gate bootstrap state to ReTB save file."""
    if not isinstance(liminal_data, dict):
        raise ValueError("Invalid Liminal Gate save data: expected JSON dictionary.")

    accounts = liminal_data.get("accounts", {})
    if not accounts:
        raise ValueError("No accounts found in Liminal Gate save.")

    target_acc_id = account_id or liminal_data.get("active_account_id") or list(accounts.keys())[0]
    if target_acc_id not in accounts:
        raise ValueError(f"Selected account '{target_acc_id}' not found in save.")

    acc = accounts[target_acc_id]
    ud = acc.get("userdata", {})
    now = int(time.time())

    username = acc.get("username") or ud.get("username") or "Player"
    userid = target_acc_id
    coins = ud.get("coins", 0)
    free_energy = ud.get("freeEnergy", 0)
    paid_energy = ud.get("energy", 0)

    # Extract characters (job_levels column holds DECODED plain level ints)
    chrdata = ud.get("chrdata", [])
    char_rows = []
    for c in chrdata:
        cid = c.get("id", 0)
        luck = c.get("luck", 0) or 0
        sb = c.get("skillBoost", 0) or 0
        job_id = c.get("jobID", 0) or 0
        jl = c.get("jobLevels", [1, 0, 0])
        if isinstance(jl, list) and jl:
            levels = [decode_job_level(v) for v in jl]
        else:
            levels = [1, 0, 0]
        char_rows.append([userid, cid, luck, sb, job_id, json.dumps(levels), now])

    # Process buddyInfo
    lim_buddy_info = ud.get("buddyInfo")
    retb_buddy_list = []
    buddy_compendium: Dict[str, int] = {}
    if isinstance(lim_buddy_info, dict):
        if "list" in lim_buddy_info and isinstance(lim_buddy_info["list"], list):
            retb_buddy_list = copy.deepcopy(lim_buddy_info["list"])
        elif "user_companions" in lim_buddy_info and isinstance(lim_buddy_info["user_companions"], list):
            retb_buddy_list = copy.deepcopy(lim_buddy_info["user_companions"])

        rec = lim_buddy_info.get("record")
        if isinstance(rec, list):
            fold_buddy_compendium(buddy_compendium, rec)
        elif isinstance(rec, dict):
            # A map-shaped record is already keyed by species id.
            fold_buddy_compendium(
                buddy_compendium,
                [
                    {"bid": k, "lv": v.get("lv", 1)} if isinstance(v, dict) else {"bid": k, "lv": v}
                    for k, v in rec.items()
                ],
            )
        # Every owned companion is "ever owned" too (mirrors reTB's
        # sync_buddy_compendium), so the live inventory folds into the ledger.
        fold_buddy_compendium(buddy_compendium, retb_buddy_list)
    elif isinstance(lim_buddy_info, list):
        retb_buddy_list = copy.deepcopy(lim_buddy_info)
        fold_buddy_compendium(buddy_compendium, retb_buddy_list)

    # Build session data dictionary
    session_data = copy.deepcopy(ud)
    apply_client_float_traps(session_data)
    session_data["username"] = username
    session_data["buddyInfo"] = retb_buddy_list
    session_data["_buddy_compendium"] = buddy_compendium
    session_data["_buddy_inventory_seq"] = ud.get("nextCompanionInventoryId", len(retb_buddy_list) + 1)

    if "current_stamina" not in session_data:
        session_data["current_stamina"] = 20.0
    if "bonus_stamina" not in session_data:
        session_data["bonus_stamina"] = 0
    if "countryId" not in session_data:
        session_data["countryId"] = 1
    if "countryCode" not in session_data:
        session_data["countryCode"] = "us"
    if "lastUpdate" not in session_data:
        session_data["lastUpdate"] = float(now)
    if "stamina_updated_at" not in session_data:
        session_data["stamina_updated_at"] = float(now)
    if "worldProgressCode" not in session_data:
        prog_code = ud.get("progressCode", 16777216)
        session_data["worldProgressCode"] = {"0": prog_code}
    if "extra_quest_clears" not in session_data:
        session_data["extra_quest_clears"] = ud.get("questClearDate", {})
    if "multipleFlags" not in session_data:
        session_data["multipleFlags"] = {}
    if "_vanquish_counts" not in session_data:
        session_data["_vanquish_counts"] = {}
    if "_pending_luckup" not in session_data:
        session_data["_pending_luckup"] = {}
    if "_pending_ltc" not in session_data:
        session_data["_pending_ltc"] = []
    if "_pending_animata" not in session_data:
        session_data["_pending_animata"] = 0
    if "achivementReadFlags" not in session_data:
        session_data["achivementReadFlags"] = ud.get("achivementReadFlags", [])
    if "_achievement_granted" not in session_data:
        session_data["_achievement_granted"] = []
    if "exchange_remain" not in session_data:
        session_data["exchange_remain"] = {}
    if "_tutorial_env1_chr" not in session_data:
        session_data["_tutorial_env1_chr"] = chrdata[0].get("id", 3) if chrdata else 3
    if "_last_quest_chapter" not in session_data:
        session_data["_last_quest_chapter"] = 3000
    if "_last_quest_section" not in session_data:
        session_data["_last_quest_section"] = 1
    if "_energy_chapters_granted" not in session_data:
        session_data["_energy_chapters_granted"] = 0
    if "_event_chapters_granted" not in session_data:
        session_data["_event_chapters_granted"] = 0
    if "_ticket_chapters_granted" not in session_data:
        session_data["_ticket_chapters_granted"] = 0
    if "_energy_daily_quest_date" not in session_data:
        session_data["_energy_daily_quest_date"] = ""
    if "_daily_quest_play_date" not in session_data:
        session_data["_daily_quest_play_date"] = ""
    if "_daily_quest_play_times" not in session_data:
        session_data["_daily_quest_play_times"] = {}
    if "_daily_quest_clear_ids" not in session_data:
        session_data["_daily_quest_clear_ids"] = []
    if "_ad_view_times" not in session_data:
        session_data["_ad_view_times"] = {}
    if "_compensation_gift_date" not in session_data:
        session_data["_compensation_gift_date"] = time.strftime("%Y-%m-%d")
    if "userNumber" not in session_data:
        # Deterministic 9-digit id (hash() is randomized per interpreter run and
        # can yield fewer than the 9 digits the client's User Info expects).
        digest = hashlib.sha1(userid.encode("utf-8")).digest()
        session_data["userNumber"] = str(int.from_bytes(digest[:4], "big") % 900000000 + 100000000)
    if "migrationID" not in session_data:
        session_data["migrationID"] = ""
    if "migrationPassword" not in session_data:
        session_data["migrationPassword"] = ""
    if "changeUsernameDate" not in session_data:
        session_data["changeUsernameDate"] = float(now)

    # Convert Liminal messages to ReTB pending_messages format
    pending_msgs = []
    for mid, mval in acc.get("messages", {}).items():
        if isinstance(mval, dict):
            m_entry = {
                "id": str(mval.get("id", mid)),
                "date": mval.get("date", now),
                "read": mval.get("read", False),
                "daysLast": mval.get("days_last", 30),
                "gifts": {},
                "messages": mval.get("messages", {"default": "Gift", "en": "Gift", "ja": "Gift"}),
            }
            if mval.get("coins"):
                m_entry["gifts"]["coins"] = mval["coins"]
            if mval.get("free_energy"):
                m_entry["gifts"]["energy"] = mval["free_energy"]
            if mval.get("items"):
                m_entry["gifts"]["item"] = [{"id": int(k), "num": v} for k, v in mval["items"].items()]
            pending_msgs.append(m_entry)

    session_data["pending_messages"] = pending_msgs
    session_data["_message_id_seq"] = len(pending_msgs)

    tables = {
        "users": {
            "keycol": "userid",
            "cols": [
                "userid",
                "username",
                "level",
                "country_id",
                "country_code",
                "created_at",
                "last_login",
                "last_login_date",
                "login_days",
                "consecutive_login_days",
                "np_bonus_day",
                "updated",
            ],
            "rows": [
                [
                    userid,
                    username,
                    1,
                    1,
                    "US",
                    int(ud.get("lastupdate", now)),
                    now,
                    time.strftime("%Y-%m-%d"),
                    acc.get("login_bonus_total_days", 1),
                    acc.get("login_bonus_consecutive_days", 1),
                    7,
                    now,
                ]
            ],
        },
        "user_valuables": {
            "keycol": "userid",
            "cols": [
                "userid",
                "coins",
                "stamina",
                "max_stamina",
                "max_free_energy",
                "energy_art_time",
                "refill_interval",
                "refill_cost",
                "valuables_raw",
                "updated",
            ],
            "rows": [
                [
                    userid,
                    coins,
                    20,
                    20,
                    free_energy if free_energy > 0 else 999,
                    0,
                    60,
                    1,
                    "0",
                    now,
                ]
            ],
        },
        "user_progression": {
            "keycol": "userid",
            "cols": [
                "userid",
                "chapter",
                "section",
                "max_parties",
                "record_json",
                "achievement_json",
                "quest_clear_date_json",
                "updated",
            ],
            "rows": [
                [
                    userid,
                    0,
                    0,
                    15,
                    "[]",
                    json.dumps(ud.get("achievement", {}) if isinstance(ud.get("achievement"), dict) else {}),
                    json.dumps(ud.get("questClearDate", {}) if isinstance(ud.get("questClearDate"), dict) else {}),
                    now,
                ]
            ],
        },
        "user_misc": {
            "keycol": "userid",
            "cols": [
                "userid",
                "messages_json",
                "multiple_flags_json",
                "extra_json",
                "updated",
            ],
            "rows": [[userid, json.dumps(pending_msgs), "{}", "{}", now]],
        },
        "session": {
            "keycol": "key",
            "cols": ["key", "data", "updated"],
            "rows": [[userid, json.dumps(session_data), now]],
        },
        "characters": {
            "keycol": "userid",
            "cols": ["userid", "chr_id", "luck", "sb", "job_id", "job_levels", "updated"],
            "rows": char_rows,
        },
    }

    total_rows = sum(len(t["rows"]) for t in tables.values())

    return {
        "format": "retb-save/1",
        # Identifies the converter version that produced the file (a stale
        # frontend bundle otherwise produces output indistinguishable from an
        # old buggy build). reTB's importers only read known keys/tables.
        "generator": "terra-tools/2",
        "userid": userid,
        "username": username,
        "label": username,
        "created": now,
        "tables": tables,
        "rows": total_rows,
    }


def retb_to_liminal(retb_data: dict) -> dict:
    """Convert ReTB save file to Project Liminal Gate bootstrap state format."""
    if not isinstance(retb_data, dict):
        raise ValueError("Invalid ReTB save data: expected JSON dictionary.")

    userid = retb_data.get("userid")
    username = retb_data.get("username") or "Player"
    tables = retb_data.get("tables", {})
    now = int(time.time())

    session_row = tables.get("session", {}).get("rows", [])
    session_data = {}
    if session_row and len(session_row[0]) > 1:
        try:
            session_data = json.loads(session_row[0][1])
        except Exception:
            session_data = {}

    if not userid and "users" in tables and tables["users"].get("rows"):
        userid = str(tables["users"]["rows"][0][0])
    if not userid:
        userid = secrets.token_hex(16).upper()

    # Reconstruct userdata
    ud = {}
    if session_data:
        ud = copy.deepcopy(session_data)

    # Liminal Gate reads the LOWERCASE lastupdate key as a JSON decimal; the
    # ReTB session only carries the camelCase lastUpdate spelling.
    if "lastupdate" not in ud:
        ud["lastupdate"] = float(ud.get("lastUpdate") or 0) or 1.0

    # Sync valuables and top-level currencies
    val_dict = ud.get("valuables", {}) if isinstance(ud.get("valuables"), dict) else {}
    if "coins" in val_dict and ("coins" not in ud or ud["coins"] is None):
        ud["coins"] = val_dict["coins"]
    if "freeEnergy" in val_dict and ("freeEnergy" not in ud or ud["freeEnergy"] is None):
        ud["freeEnergy"] = val_dict["freeEnergy"]
    if "energy" in val_dict and ("energy" not in ud or ud["energy"] is None):
        ud["energy"] = val_dict["energy"]

    # Reconstruct characters if needed
    if "chrdata" not in ud or not ud["chrdata"]:
        chrdata = []
        for r in tables.get("characters", {}).get("rows", []):
            cid = r[1]
            luck = r[2] or 0
            sb = r[3] or 0
            job_id = r[4] or 0
            jl = r[5]
            if isinstance(jl, str):
                try:
                    jl = json.loads(jl)
                except Exception:
                    jl = [1, 0, 0]
            chrdata.append({
                "buddy": 0,
                "date": 0.0,
                "flags": 1,
                "id": cid,
                "jobID": job_id,
                "jobLevels": jl if isinstance(jl, list) else [1.0, 0.0, 0.0],
                "jobSlots": [0.0, 0.0, 0.0],
                "luck": luck,
                "skillBoost": sb,
            })
        ud["chrdata"] = chrdata

    # Extract valuables
    if "user_valuables" in tables and tables["user_valuables"].get("rows"):
        vrow = tables["user_valuables"]["rows"][0]
        vcols = tables["user_valuables"].get("cols", [])
        vdict = dict(zip(vcols, vrow))
        if "coins" not in ud:
            ud["coins"] = vdict.get("coins", 0)
        if "freeEnergy" not in ud:
            ud["freeEnergy"] = vdict.get("max_free_energy", 0)

    # Extract progression / quest clears
    if "user_progression" in tables and tables["user_progression"].get("rows"):
        prow = tables["user_progression"]["rows"][0]
        pcols = tables["user_progression"].get("cols", [])
        pdict = dict(zip(pcols, prow))
        if "questClearDate" not in ud:
            try:
                ud["questClearDate"] = json.loads(pdict.get("quest_clear_date_json", "{}"))
            except Exception:
                ud["questClearDate"] = {}

    # Format buddyInfo for Liminal Gate emulator: record is a LIST of
    # best-copy entries (liminal derives it from the owned list; a bare
    # {bid: level} map is not the persisted shape).
    retb_buddy = ud.get("buddyInfo")
    if isinstance(retb_buddy, list):
        ud["buddyInfo"] = {
            "list": retb_buddy,
            "record": liminal_record_entries(retb_buddy, ud.get("_buddy_compendium")),
        }
    elif isinstance(retb_buddy, dict):
        ud["buddyInfo"] = retb_buddy
    else:
        ud["buddyInfo"] = {"list": [], "record": []}

    # Defaults for all required client/emulator fields
    coins = ud.get("coins", 0)
    free_energy = ud.get("freeEnergy", 0)
    defaults = {
        "achivementFlags": [],
        "achivementReadFlags": [],
        "buddyInfo": ud["buddyInfo"],
        "coins": coins,
        "energy": ud.get("energy", 0),
        "freeEnergy": free_energy,
        "itemList": ud.get("itemList", [0] * 181),
        "lastupdate": 1.0,
        "multiplayData": {
            "roomHistory": [],
            "teamData": {"teamBuddies": [0] * 18, "teamMembers": [0] * 90, "teamNo": 1},
        },
        "nextCompanionInventoryId": ud.get("_buddy_inventory_seq", len(retb_buddy) + 1 if isinstance(retb_buddy, list) else 1) or 1,
        "progressCode": ud.get("progressCode", 16777216),
        "questClearDate": ud.get("questClearDate", {}),
        "refillStartTime": 0.0,
        "summonId": 1,
        "summonList": ud.get("summonList", [1, 1] + [0] * 14),
        "teamBuddies_VS": ud.get("teamBuddies_VS", [0] * 18),
        "teamMembers": ud.get("teamMembers", [0] * 90),
        "teamMembers_VS": ud.get("teamMembers_VS", [0] * 18),
        "teamNo": ud.get("teamNo", 1),
        "teamNo_VS": ud.get("teamNo_VS", 1),
        "valuables": ud.get(
            "valuables",
            {
                "coins": coins,
                "energy": 0,
                "freeEnergy": free_energy,
                "energyAppStore": 0,
                "energyGooglePlay": 0,
                "energyAndApp": 0,
            },
        ),
        "worldMapNo": ud.get("worldMapNo", 0),
    }
    for k, v in defaults.items():
        if k not in ud:
            ud[k] = v

    # Extract messages if any
    messages = {}
    pending_msgs = ud.get("pending_messages", [])
    if isinstance(pending_msgs, list):
        for m in pending_msgs:
            if isinstance(m, dict):
                mid = str(m.get("id", len(messages) + 1))
                messages[mid] = {
                    "character_id": 0,
                    "coins": m.get("gifts", {}).get("coins", 0),
                    "companion_id": 0,
                    "companion_level": 1,
                    "date": m.get("date", now),
                    "days_last": m.get("daysLast", 30),
                    "free_energy": m.get("gifts", {}).get("energy", 0),
                    "id": mid,
                    "items": {
                        str(it.get("id")): it.get("num", 1)
                        for it in m.get("gifts", {}).get("item", [])
                        if isinstance(it, dict)
                    },
                    "messages": m.get("messages", {"default": "Gift"}),
                    "read": m.get("read", False),
                }

    # Extract login bonus days
    login_days = 1
    consecutive_days = 1
    if "users" in tables and tables["users"].get("rows"):
        urow = tables["users"]["rows"][0]
        ucols = tables["users"].get("cols", [])
        udict = dict(zip(ucols, urow))
        login_days = udict.get("login_days", 1)
        consecutive_days = udict.get("consecutive_login_days", 1)

    token = generate_hex_token()

    # Side-world progression carried over from the reTB per-world map
    # (key "0" is the main story, which travels via progressCode).
    world_progress = {
        str(key): int(value)
        for key, value in (ud.get("worldProgressCode") or {}).items()
        if str(key) != "0" and isinstance(value, (int, float))
    } or {"1": 50338049}

    account_obj = {
        "achievement_requests": {},
        "active_battle_continue_coins": 0,
        "active_generic_story": None,
        "active_hunt": None,
        "active_hunt_ticket_spent": None,
        "active_luck_result": [],
        "active_luck_up": [],
        "active_world_map_special": None,
        "chapter_energy_granted": [],
        "chapter_milestones_issued": [],
        "claimed_achievements": [],
        "daily_quest_clears": {},
        "daily_quest_energy_granted": {},
        "daily_quest_play_times": {},
        "exchange_remaining": {},
        "exchange_requests": {},
        "exchange_total": 0,
        "exchange_week": 0,
        "initial_userdata_served": True,
        "login_bonus_consecutive_days": consecutive_days,
        "login_bonus_last_utc_day": 0,
        "login_bonus_total_days": login_days,
        "message_requests": {},
        "messages": messages,
        "rebirth_used_material_ids": [],
        "released_generic_story": None,
        "stage_energy_history": [],
        "tutorial_phase": "free_roam",
        "tutorial_requests": {},
        "userdata": ud,
        "username": ud.get("username") or username,
        "username_changed_at": 0.0,
        "world_progress": world_progress,
    }

    return {
        "account_aliases": {},
        "accounts": {userid: account_obj},
        "active_account_id": userid,
        "client_hosts": {"127.0.0.1": userid},
        "tokens": {token: userid},
    }


class ConvertRequest(BaseModel):
    data: dict
    target_format: Optional[str] = None  # 'retb' or 'liminal'
    account_id: Optional[str] = None


@router.post("/inspect")
async def inspect_save_endpoint(request_data: dict):
    """Inspect an uploaded savefile payload and return metadata and accounts."""
    fmt = detect_save_format(request_data)
    if fmt == "unknown":
        raise HTTPException(
            status_code=400,
            detail="Unrecognized savefile format. Expected Project Liminal Gate or ReTB JSON.",
        )

    if fmt == "liminal":
        accounts = request_data.get("accounts", {})
        active_id = request_data.get("active_account_id") or (list(accounts.keys())[0] if accounts else "")
        summaries = [parse_account_summary_liminal(aid, acc) for aid, acc in accounts.items()]
        return {
            "format": "liminal",
            "format_label": "Project Liminal Gate (bootstrap-state)",
            "active_account_id": active_id,
            "account_count": len(accounts),
            "accounts": summaries,
        }
    else:  # retb
        summary = parse_account_summary_retb(request_data)
        return {
            "format": "retb",
            "format_label": "ReTB Save (tb-save)",
            "active_account_id": summary["account_id"],
            "account_count": 1,
            "accounts": [summary],
        }


@router.post("/convert")
async def convert_save_endpoint(req: ConvertRequest):
    """Convert a savefile between Project Liminal Gate and ReTB formats."""
    source_fmt = detect_save_format(req.data)
    if source_fmt == "unknown":
        raise HTTPException(
            status_code=400,
            detail="Unrecognized savefile format. Expected Project Liminal Gate or ReTB JSON.",
        )

    target_fmt = req.target_format
    if not target_fmt:
        target_fmt = "liminal" if source_fmt == "retb" else "retb"

    try:
        if source_fmt == "liminal" and target_fmt == "retb":
            converted = liminal_to_retb(req.data, account_id=req.account_id)
            suggested_filename = f"tb-save-{converted['username']}-{int(time.time())}.json"
        elif source_fmt == "retb" and target_fmt == "liminal":
            converted = retb_to_liminal(req.data)
            active_acc = converted["accounts"][converted["active_account_id"]]
            suggested_filename = f"bootstrap-state-{active_acc['username']}-{int(time.time())}.json"
        elif source_fmt == target_fmt:
            converted = req.data
            suggested_filename = f"save-{source_fmt}-{int(time.time())}.json"
        else:
            raise ValueError(f"Unsupported conversion from {source_fmt} to {target_fmt}")

        return {
            "source_format": source_fmt,
            "target_format": target_fmt,
            "suggested_filename": suggested_filename,
            "data": converted,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
