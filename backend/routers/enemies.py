from fastapi import APIRouter, HTTPException

from backend.database import gamedata, find_local_asset, resolve_section_title
from backend.routers.stages import iter_chapter_fixed_spawns, iter_section_pools

router = APIRouter(tags=["bestiary"])

# FrameType enum (dump.cs): NormalEnemy=0, Boss1=1, Boss2=2 — anything >= 1
# uses a boss battle frame.
BOSS_FRAME_MIN = 1

# EnemyData avoid* fields worth surfacing, with display labels. Values are
# 0..1 resistance chances (1 = fully immune); zero entries are omitted.
_RESIST_FIELDS = [
    ("avoidSleep", "Sleep"),
    ("avoidPoison", "Poison"),
    ("avoidParalyze", "Paralysis"),
    ("avoidConfuse", "Confusion"),
    ("avoidLoseHeart", "Lose Heart"),
    ("avoidStone", "Petrifaction"),
    ("avoidDeath", "Instant Death"),
    ("avoidGravity", "Gravity"),
    ("avoidIced", "Freeze"),
    ("avoidAddWait", "Add Wait"),
    ("avoidRatioDamage", "Ratio Damage"),
    ("avoidMove", "Forced Move"),
    ("avoidATKDown", "ATK Down"),
    ("avoidDEFDown", "DEF Down"),
    ("avoidSATKDown", "MATK Down"),
    ("avoidSDEFDown", "MDEF Down"),
    ("avoidATKDown2", "ATK Down II"),
    ("avoidDEFDown2", "DEF Down II"),
    ("avoidSATKDown2", "MATK Down II"),
    ("avoidSDEFDown2", "MDEF Down II"),
]

# Lazy caches, built on first use:
#   _GROUPS: game-ordered list of foe groups (one per distinct English name)
#   _GROUP_BY_ID: enemy ID -> its group's member list
#   _SPAWN_INDEX / _POSSIBLE_INDEX: enemy ID -> occurrence maps from stage data
#   _STAGE_DROP_INDEX: enemy ID -> [(chapter, section, drop record)] from the
#     runtime-configured event drops (StageDrops.json) — most event bosses carry
#     no EnemyData item slots, their loot lives only in this config
#   _SECTION_TITLES: (chapter, section) -> resolved title payload
_GROUPS: list | None = None
_GROUP_BY_ID: dict[int, list] = {}
_SPAWN_INDEX: dict[int, dict] | None = None
_POSSIBLE_INDEX: dict[int, dict] | None = None
_STAGE_DROP_INDEX: dict[int, list] | None = None
_SECTION_TITLES: dict[tuple, dict] = {}


def _common_value(members, field: str):
    """The field's value shared by every member, else None.

    Same-name variants can differ (33 groups span several elements — Orbling
    alone covers all five — and 4 groups even mix species), so a group may
    only claim an attribute that holds for all of its variants; the cards omit
    the rest and the variant tabs show each record's own values."""
    values = {m.get(field, 0) for m in members}
    return next(iter(values)) if len(values) == 1 else None


def _enemy_groups() -> list:
    """One bestiary group per distinct enemy name, members sorted by ID.

    EnemyData carries one record per (foe, level/variant) pairing — e.g. 28
    'Metal Orbling Mage' records — and the bestiary lists each foe once with
    all of its variants in the detail modal."""
    global _GROUPS, _GROUP_BY_ID
    if _GROUPS is not None:
        return _GROUPS

    by_name: dict[str, list] = {}
    for enemy in gamedata.get("enemies", {}).get("data", []):
        name = (enemy.get("NameString") or {}).get("en") or f"Enemy {enemy['ID']}"
        by_name.setdefault(name, []).append(enemy)

    groups = []
    for name, members in by_name.items():
        members.sort(key=lambda e: e["ID"])
        _GROUP_BY_ID.update({m["ID"]: members for m in members})
        image_file = next(
            (
                find_local_asset("Pieces", m.get("ImageID"), "img")
                for m in members
                if find_local_asset("Pieces", m.get("ImageID"), "img")
            ),
            None,
        )
        first = members[0]
        groups.append({
            "first_id": first["ID"],
            "enemy_ids": [m["ID"] for m in members],
            "name": name,
            "NameString": first.get("NameString"),
            "image_file": image_file,
            "species": _common_value(members, "Species"),
            "attrib": _common_value(members, "Attrib"),
            "boss": any((m.get("FrameType") or 0) >= BOSS_FRAME_MIN for m in members),
            "variant_count": len(members),
            "min_lv": min(m.get("LV", 0) for m in members),
            "max_lv": max(m.get("LV", 0) for m in members),
        })

    groups.sort(key=lambda g: g["first_id"])
    _GROUPS = groups
    return groups


def _group_for(enemy_id: int) -> list | None:
    _enemy_groups()
    return _GROUP_BY_ID.get(enemy_id)


def _build_occurrence_indexes():
    """Fixed-spawn and possible-pool occurrence maps from the stage data.

    Fixed spawns come from the stage layouts (placeholder filler stripped);
    possible occurrences come from the same random-pool derivation the stages
    endpoint serves, keyed per section."""
    global _SPAWN_INDEX, _POSSIBLE_INDEX, _STAGE_DROP_INDEX
    if _SPAWN_INDEX is not None:
        return

    _enemy_groups()  # populate _GROUP_BY_ID for the StageDrops filter below

    spawn: dict[int, dict] = {}
    for ch_no, sec_num, enemies in iter_chapter_fixed_spawns(_stage_ctx()):
        for enemy in enemies:
            eid = enemy.get("enemy_id")
            if eid is None:
                continue
            entry = spawn.setdefault(eid, {"sections": {}, "vars": set()})
            entry["sections"][(ch_no, sec_num)] = entry["sections"].get((ch_no, sec_num), 0) + 1
            if enemy.get("enemy_var"):
                entry["vars"].add(enemy["enemy_var"])

    possible: dict[int, dict] = {}
    for ch_no, sec_num, reason, pool in iter_section_pools(_stage_ctx()):
        for pool_enemy in pool:
            eid = pool_enemy.get("enemy_id")
            if eid is None:
                continue
            possible.setdefault(eid, {}).setdefault((ch_no, sec_num), reason)

    _SPAWN_INDEX = spawn
    _POSSIBLE_INDEX = possible

    drops: dict[int, list] = {}
    for drop_ch, sections in gamedata.get("stage_drops", {}).items():
        for drop_sec, records in sections.items():
            for rec in records:
                eid = rec.get("enemy_id")
                if eid in _GROUP_BY_ID:
                    drops.setdefault(eid, []).append((int(drop_ch), int(drop_sec), rec))
    _STAGE_DROP_INDEX = drops


def _stage_ctx() -> dict:
    """Minimal context for the stages module's shared iterators."""
    return {
        "chapters": gamedata.get("stages", {}).get("chapters", []),
        "layout_db": gamedata.get("stages_layout", {}),
        "enemies_by_id": {e["ID"]: e for e in gamedata.get("enemies", {}).get("data", [])},
    }


def _section_title(ch_no: int, sec_num: int) -> dict:
    """Localized 'Stage ch-sec: name' payload, memoized."""
    key = (ch_no, sec_num)
    if key not in _SECTION_TITLES:
        raw_title = ""
        for ch in gamedata.get("stages", {}).get("chapters", []):
            if ch.get("chapterNo") == ch_no:
                sections = ch.get("sections", [])
                if 1 <= sec_num <= len(sections):
                    raw_title = sections[sec_num - 1].get("title", "")
                break
        _SECTION_TITLES[key] = resolve_section_title(ch_no, sec_num, raw_title)
    return _SECTION_TITLES[key]


def _decode_loot(enemy, item_set):
    """Enemy item slots: packed code = item ID * 256 + drop rate (%)."""
    loot = []
    for entry in enemy.get("items", []):
        code = entry.get("code", 0)
        if code <= 0:
            continue
        item_id, rate = code // 256, code % 256
        idx = item_id - 1
        item = item_set[idx] if 0 <= idx < len(item_set) else None
        loot.append({
            "item_id": item_id,
            "name": item.get("NameString") if item else {"en": f"Unknown Item (ID {item_id})"},
            "icon_url": f"/api/assets/item/item_{item_id:02d}.png" if item else None,
            "rate": rate,
        })
    return loot


def _resolve_drop_buddy(enemy):
    buddy_id = enemy.get("DropBuddyID", 0)
    if buddy_id <= 0:
        return None
    buddy = next(
        (b for b in gamedata.get("buddies", {}).get("data", []) if b.get("ID") == buddy_id),
        None,
    )
    return {
        "id": buddy_id,
        "name": buddy.get("NameString") if buddy else {"en": f"Companion #{buddy_id}"},
        "thumb_file": find_local_asset("BuddyThumbs", buddy.get("ImageID"), "img") if buddy else None,
        "rate": enemy.get("DropBuddyRatio", 0),
    }


def _resolve_recruit(enemy, jobs_by_id, infos_by_id):
    """Character obtainable by defeating this enemy (DropJobID -> job -> character)."""
    if enemy.get("DropRatio", 0) <= 0:
        return None
    job = jobs_by_id.get(enemy.get("DropJobID"))
    chr_id = job.get("chrID") if job else None
    info = infos_by_id.get(chr_id) if chr_id else None
    if not info:
        return None
    return {
        "character_id": chr_id,
        "name": info.get("NameString"),
        "rarity": info.get("rarity", 0),
    }


def _resistances(enemy):
    rows = [
        {"status": label, "value": enemy.get(field, 0)}
        for field, label in _RESIST_FIELDS
        if enemy.get(field, 0)
    ]
    rows.sort(key=lambda r: -r["value"])  # full immunities first
    return rows


def _variant_detail(enemy, jobs_by_id, infos_by_id, buddies_by_id, item_set):
    """One EnemyData record as a selectable variant of its bestiary group."""
    eid = enemy["ID"]
    spawn = (_SPAWN_INDEX or {}).get(eid, {})
    possible = (_POSSIBLE_INDEX or {}).get(eid, {})
    configured_drops = (_STAGE_DROP_INDEX or {}).get(eid, [])

    loot = _decode_loot(enemy, item_set)
    configured_loot_keys = {(row["item_id"], row["rate"]) for row in loot}
    for _, _, rec in configured_drops:
        item_id, rate = rec.get("item_id"), rec.get("ratio")
        if (item_id, rate) in configured_loot_keys:
            continue
        configured_loot_keys.add((item_id, rate))
        idx = (item_id or 0) - 1
        item = item_set[idx] if 0 <= idx < len(item_set) else None
        loot.append({
            "item_id": item_id,
            "name": item.get("NameString") if item else {"en": f"Unknown Item (ID {item_id})"},
            "icon_url": f"/api/assets/item/item_{item_id:02d}.png" if item else None,
            "rate": rate,
        })

    occurrences = [
        {
            "chapter_no": ch,
            "section_index": sec,
            "count": count,
            **_section_title(ch, sec),
        }
        for (ch, sec), count in sorted(spawn.get("sections", {}).items())
    ]
    seen_sections = {(o["chapter_no"], o["section_index"]) for o in occurrences}
    for ch, sec, _rec in configured_drops:
        if (ch, sec) in seen_sections:
            continue
        seen_sections.add((ch, sec))
        occurrences.append({
            "chapter_no": ch,
            "section_index": sec,
            "count": None,
            "configured": True,
            **_section_title(ch, sec),
        })
    occurrences.sort(key=lambda o: (o["chapter_no"], o["section_index"]))
    possible_occurrences = [
        {
            "chapter_no": ch,
            "section_index": sec,
            "reason": reason,
            **_section_title(ch, sec),
        }
        for (ch, sec), reason in sorted(possible.items())
    ]

    return {
        "enemy_id": eid,
        "LV": enemy.get("LV", 0),
        "HP": enemy.get("HP", 0),
        "ATK": enemy.get("ATK", 0),
        "DEF": enemy.get("DEF", 0),
        "SATK": enemy.get("SATK", 0),
        "SDEF": enemy.get("SDEF", 0),
        "WAIT": enemy.get("WAIT", 0),
        "RANGE": enemy.get("RANGE", 0),
        "EXP": enemy.get("EXP", 0),
        "com_EXP": enemy.get("com_EXP", 0),
        "COIN": enemy.get("COIN", 0),
        "FrameType": enemy.get("FrameType", 0),
        "Attrib": enemy.get("Attrib", 0),
        "SkillAttrib": enemy.get("SkillAttrib", 0),
        "Species": enemy.get("Species", 0),
        "ImageID": enemy.get("ImageID", 0),
        "image_file": find_local_asset("Pieces", enemy.get("ImageID"), "img"),
        "skills": [s for s in (enemy.get("SkillSlot") or []) if isinstance(s, int) and s > 0],
        "loot": loot,
        "drop_buddy": _resolve_drop_buddy(enemy),
        "recruits": _resolve_recruit(enemy, jobs_by_id, infos_by_id),
        "resistances": _resistances(enemy),
        "enemy_vars": sorted(spawn.get("vars", set())),
        "occurrences": occurrences,
        "possible_occurrences": possible_occurrences,
    }


@router.get('/api/enemies')
def get_enemies(
    page: int = None,
    limit: int = 35,
    search: str = "",
    species: str = "",
    element: str = "",
    frame: str = "",
    sort: str = "id",
    order: str = "asc",
):
    """Retrieve bestiary groups (one entry per foe name) with server-side
    filtering, sorting and pagination."""
    groups = _enemy_groups()

    q = search.lower().strip()
    filtered = []
    for group in groups:
        # Species/element filters match a group when ANY of its variants has
        # the value — mixed-element foes (e.g. Orbling) stay discoverable even
        # though the card itself only shows attributes common to all variants.
        members = _GROUP_BY_ID.get(group["first_id"], [])
        if species and not any(str(m.get("Species", 0)) == str(species) for m in members):
            continue
        if element and not any(str(m.get("Attrib", 0)) == str(element) for m in members):
            continue
        if frame == "boss" and not group["boss"]:
            continue
        if frame == "normal" and group["boss"]:
            continue
        if q:
            name_en = group["name"].lower()
            name_ja = (group["NameString"] or {}).get("ja", "").lower()
            id_hit = any(q in str(eid) for eid in group["enemy_ids"])
            if not (q in name_en or q in name_ja or id_hit):
                continue
        filtered.append(group)

    reverse = order == "desc"
    if sort == "name":
        filtered.sort(key=lambda g: g["name"].lower(), reverse=reverse)
    elif sort == "variants":
        filtered.sort(key=lambda g: (g["variant_count"], g["first_id"]), reverse=reverse)
    elif sort == "level":
        filtered.sort(key=lambda g: (g["max_lv"], g["min_lv"], g["first_id"]), reverse=reverse)
    else:  # default: game order (first enemy ID)
        filtered.sort(key=lambda g: g["first_id"], reverse=reverse)

    total = len(filtered)
    if page is not None:
        start_idx = (page - 1) * limit
        filtered = filtered[start_idx:start_idx + limit]

    if page is not None:
        return {
            "items": filtered,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total,
        }
    return filtered


@router.get('/api/enemies/{enemy_id}')
def get_enemy(enemy_id: int):
    """Retrieve one bestiary group with every variant fully enriched:
    stats, skills, loot, resistances and stage occurrences."""
    _build_occurrence_indexes()
    members = _group_for(enemy_id)
    if not members:
        raise HTTPException(status_code=404, detail=f"Enemy {enemy_id} not found")

    jobs_by_id = {job["ID"]: job for job in gamedata.get("characters", {}).get("data", [])}
    infos_by_id = {info["ID"]: info for info in gamedata.get("characters", {}).get("infos", [])}
    buddies_by_id = {b["ID"]: b for b in gamedata.get("buddies", {}).get("data", [])}
    item_set = gamedata.get("items", {}).get("itemSet", [])

    first = members[0]
    return {
        "first_id": first["ID"],
        "name": first.get("NameString"),
        "species": _common_value(members, "Species"),
        "attrib": _common_value(members, "Attrib"),
        "boss": any((m.get("FrameType") or 0) >= BOSS_FRAME_MIN for m in members),
        "image_file": find_local_asset("Pieces", first.get("ImageID"), "img"),
        "variant_count": len(members),
        "variants": [
            _variant_detail(m, jobs_by_id, infos_by_id, buddies_by_id, item_set)
            for m in members
        ],
    }
