from fastapi import APIRouter
from backend.database import gamedata, find_local_asset

router = APIRouter(tags=["characters"])


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
        result.append(char_copy)
        
    if page is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result

