from fastapi import APIRouter
from backend.database import gamedata, find_local_asset

router = APIRouter(tags=["characters"])


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
        if not r:
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

        result.append(char_copy)
        
    if page is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result

