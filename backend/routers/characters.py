from fastapi import APIRouter, HTTPException
from backend.database import gamedata, find_local_asset, resolve_section_title

router = APIRouter(tags=["characters"])

# Lazy index: chrID -> sorted [(chapter, section)] where a droppable enemy of
# that character appears in the stage layouts.
_RECRUIT_INDEX: dict[int, list] | None = None
_RECRUIT_TITLES: dict[tuple[int, int], dict] = {}


def _get_recruit_index() -> dict[int, list]:
    """Map each character to the chapter sections where its droppable enemy spawns.

    An enemy "drops" (recruits) a character when DropRatio > 0 and its DropJobID
    resolves to a job; the enemy is the character itself.
    """
    global _RECRUIT_INDEX
    if _RECRUIT_INDEX is not None:
        return _RECRUIT_INDEX

    enemies = gamedata.get("enemies", {}).get("data", [])
    jobs_by_id = {job["ID"]: job for job in gamedata.get("characters", {}).get("data", [])}
    infos_by_id = {info["ID"]: info for info in gamedata.get("characters", {}).get("infos", [])}

    droppers: dict[int, int] = {}
    for enemy in enemies:
        if enemy.get("DropRatio", 0) <= 0:
            continue
        job = jobs_by_id.get(enemy.get("DropJobID"))
        chr_id = job.get("chrID") if job else None
        if chr_id in infos_by_id:
            droppers[enemy["ID"]] = chr_id

    sites: dict[int, set] = {}
    for ch, sections in gamedata.get("stages_layout", {}).items():
        if not isinstance(sections, dict):
            continue
        for sec, items in sections.items():
            if not isinstance(items, list):
                continue
            for item in items:
                for enemy in item.get("enemies", []):
                    chr_id = droppers.get(enemy.get("enemy_id"))
                    if chr_id:
                        sites.setdefault(chr_id, set()).add((int(ch), int(sec)))

    _RECRUIT_INDEX = {
        chr_id: sorted(pairs) for chr_id, pairs in sites.items()
    }
    return _RECRUIT_INDEX


def _recruitment_site_title(chapter: int, section: int) -> dict:
    """Localized display title for a chapter section, memoized."""
    key = (chapter, section)
    if key not in _RECRUIT_TITLES:
        chapters = gamedata.get("stages", {}).get("chapters", [])
        raw_title = ""
        for ch in chapters:
            if ch.get("chapterNo") == chapter:
                sections = ch.get("sections", [])
                if 1 <= section <= len(sections):
                    raw_title = sections[section - 1].get("title", "")
                break
        _RECRUIT_TITLES[key] = resolve_section_title(chapter, section, raw_title)
    return _RECRUIT_TITLES[key]


def _resolve_recruitment(chr_id):
    """List of chapter sections where this character can be recruited (dropped)."""
    sites = _get_recruit_index().get(chr_id, [])
    return [
        {
            "chapter": ch,
            "section": sec,
            "title": _recruitment_site_title(ch, sec)["title"],
        }
        for ch, sec in sites
    ]


def _resolve_recode_materials(rebirth, item_set):
    """Decode the packed item codes of a rebirth entry into named materials."""
    materials = []
    for item_entry in rebirth.get("items", []):
        code = item_entry.get("code", 0)
        if code <= 0:
            continue
        item_id = code // 256
        count = code % 256
        idx = item_id - 1
        if 0 <= idx < len(item_set):
            item = item_set[idx]
            materials.append({
                "item_id": item_id,
                "count": count,
                "name": item.get("NameString", {}),
                "icon_url": f"/api/assets/item/item_{item_id:02d}.png"
            })
        else:
            materials.append({
                "item_id": item_id,
                "count": count,
                "name": {"en": f"Unknown Item (ID {item_id})"},
                "icon_url": None
            })
    return materials


def _is_active_rebirth(rebirth):
    """A rebirth entry with no coins, items, or companions is an unused
    placeholder in the game data (e.g. Dagus -> Ella Λ, Xaepha -> Shin'en Λ /
    Mutoh Λ) that the game itself never offers, so skip it."""
    if rebirth.get("coins", 0) > 0:
        return True
    if any(item.get("code", 0) > 0 for item in rebirth.get("items", [])):
        return True
    return any(mon.get("chrID", 0) > 0 for mon in rebirth.get("mons", []))


def _unit_brief(info, jobs_by_id):
    """Name/piece summary for a character referenced by the recode system."""
    first_job = next((jobs_by_id[jid] for jid in info.get("Jobs", []) if jid in jobs_by_id), None)
    image_id = first_job.get("ImageID") if first_job else None
    return {
        "ID": info.get("ID"),
        "name": info.get("NameString", {}),
        "rarity": info.get("rarity"),
        "piece_file": find_local_asset("Pieces", image_id, "img") if image_id else None,
    }


def _resolve_recode(rebirth, jobs_by_id, item_set, infos_by_id):
    """Build the full recode payload shown on the source character."""
    units = []
    for mon in rebirth.get("mons", []):
        mon_info = infos_by_id.get(mon.get("chrID"))
        if not mon_info:
            continue
        units.append({**_unit_brief(mon_info, jobs_by_id), "level": mon.get("level", 1)})

    dst_info = infos_by_id.get(rebirth.get("dstChrID"))
    return {
        "coins": rebirth.get("coins", 0),
        "items": _resolve_recode_materials(rebirth, item_set),
        "units": units,
        "result": _unit_brief(dst_info, jobs_by_id) if dst_info else None,
    }


def _build_character_lookups():
    """Shared lookups (jobs, infos, recode indexes, items) for character enrichment."""
    char_db = gamedata.get("characters", {})
    infos = char_db.get("infos", [])
    jobs_by_id = {job["ID"]: job for job in char_db.get("data", [])}
    infos_by_id = {info["ID"]: info for info in infos}

    rebirth_by_src: dict[int, list] = {}
    rebirth_by_dst = {}
    for r in char_db.get("rebirthInfo", []):
        if not r or not _is_active_rebirth(r):
            continue
        rebirth_by_src.setdefault(r["srcChrID"], []).append(r)
        rebirth_by_dst[r["dstChrID"]] = r

    item_set = gamedata.get("items", {}).get("itemSet", [])
    return infos, jobs_by_id, infos_by_id, rebirth_by_src, rebirth_by_dst, item_set


def _enrich_character(info, jobs_by_id, infos_by_id, rebirth_by_src, rebirth_by_dst, item_set):
    """Attach job details and recode payloads to a character info entry."""
    char_jobs = []
    for job_id in info.get("Jobs", []):
        job = jobs_by_id.get(job_id)
        if job:
            image_id = job.get("ImageID", 0)
            piece_path = find_local_asset("Pieces", image_id, "img")
            illust_path = find_local_asset("Illust", image_id, "illust")

            job_copy = dict(job)
            job_copy["piece_file"] = piece_path
            job_copy["illust_file"] = illust_path

            unlock_materials = []
            for item_entry in job.get("items", []):
                code = item_entry.get("code", 0)
                if code > 0:
                    item_id = code // 256
                    count = code % 256
                    idx = item_id - 1
                    if 0 <= idx < len(item_set):
                        item = item_set[idx]
                        unlock_materials.append({
                            "item_id": item_id,
                            "count": count,
                            "name": item.get("NameString", {}),
                            "icon_url": f"/api/assets/item/item_{item_id:02d}.png"
                        })
                    else:
                        unlock_materials.append({
                            "item_id": item_id,
                            "count": count,
                            "name": {"en": f"Unknown Item (ID {item_id})"},
                            "icon_url": None
                        })
            job_copy["unlock_materials"] = unlock_materials
            job_copy["unlock_coin"] = job.get("COIN", 0)
            char_jobs.append(job_copy)

    char_copy = dict(info)
    char_copy["JobsInfo"] = char_jobs

    rebirth_options = rebirth_by_src.get(info.get("ID"))
    if rebirth_options:
        char_copy["recode"] = [
            _resolve_recode(rebirth, jobs_by_id, item_set, infos_by_id)
            for rebirth in rebirth_options
        ]
    source_rebirth = rebirth_by_dst.get(info.get("ID"))
    if source_rebirth:
        src_info = infos_by_id.get(source_rebirth.get("srcChrID"))
        if src_info:
            char_copy["recode_source"] = _unit_brief(src_info, jobs_by_id)

    recruitment = _resolve_recruitment(info.get("ID"))
    if recruitment:
        char_copy["recruitment"] = recruitment

    return char_copy


@router.get('/api/characters')
def get_characters(
    page: int = None,
    limit: int = 20,
    search: str = "",
    species: str = "",
    rarity: str = "",
    weapon: str = "",
    element: str = ""
):
    """Retrieve characters with server-side pagination and filter parameters."""
    char_db = gamedata.get("characters", {})
    infos = char_db.get("infos", [])
    jobs_data = char_db.get("data", [])
    jobs_by_id = {job["ID"]: job for job in jobs_data}
    infos_by_id = {info["ID"]: info for info in infos}

    rebirth_by_src: dict[int, list] = {}
    rebirth_by_dst = {}
    for r in char_db.get("rebirthInfo", []):
        if not r or not _is_active_rebirth(r):
            continue
        rebirth_by_src.setdefault(r["srcChrID"], []).append(r)
        rebirth_by_dst[r["dstChrID"]] = r

    item_db = gamedata.get("items", {})
    item_set = item_db.get("itemSet", [])

    q = search.lower().strip()
    filtered_infos = []
    for info in infos:
        if species and str(info.get("Species", "")) != str(species):
            continue
        if rarity and str(info.get("rarity", "")) != str(rarity):
            continue
            
        char_jobs = [jobs_by_id.get(jid) for jid in info.get("Jobs", []) if jobs_by_id.get(jid)]
        if weapon and not any(str(j.get("Attrib", "")) == str(weapon) for j in char_jobs):
            continue
        if element and not any(str(j.get("SkillAttrib", "")) == str(element) for j in char_jobs):
            continue
            
        if q:
            name_en = info.get("NameString", {}).get("en", "").lower()
            name_ja = info.get("NameString", {}).get("ja", "").lower()
            cid_str = str(info.get("ID", ""))
            job_names = " ".join(j.get("NameString", {}).get("en", "").lower() for j in char_jobs)
            if not (q in name_en or q in name_ja or q in cid_str or q in job_names):
                continue
                
        filtered_infos.append(info)

    total = len(filtered_infos)

    if page is not None:
        start_idx = (page - 1) * limit
        target_infos = filtered_infos[start_idx:start_idx + limit]
    else:
        target_infos = filtered_infos

    result = []
    for info in target_infos:
        result.append(_enrich_character(info, jobs_by_id, infos_by_id, rebirth_by_src, rebirth_by_dst, item_set))

    if page is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result


@router.get('/api/characters/{char_id}')
def get_character(char_id: int):
    """Retrieve a single fully-enriched character (jobs, recode, recode source)."""
    infos, jobs_by_id, infos_by_id, rebirth_by_src, rebirth_by_dst, item_set = _build_character_lookups()
    info = infos_by_id.get(char_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Character {char_id} not found")
    return _enrich_character(info, jobs_by_id, infos_by_id, rebirth_by_src, rebirth_by_dst, item_set)

