import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.database import gamedata, find_local_asset, resolve_section_title

router = APIRouter(tags=["items"])


@router.get('/api/items')
def get_items(page: int = None, limit: int = 24, search: str = ""):
    """Retrieve items database with optional pagination."""
    item_db = gamedata.get("items", {})
    items = item_db.get("itemSet", [])

    q = search.lower().strip()
    filtered_indexed = []
    for idx, item in enumerate(items):
        if q:
            name_en = item.get("NameString", {}).get("en", "").lower()
            desc_en = item.get("DescString", {}).get("en", "").lower()
            if not (q in name_en or q in desc_en or q in str(idx + 1)):
                continue
        filtered_indexed.append((idx, item))

    total = len(filtered_indexed)
    if page is not None:
        start_idx = (page - 1) * limit
        target = filtered_indexed[start_idx:start_idx + limit]
    else:
        target = filtered_indexed

    result = []
    for idx, item in target:
        sort_order = item.get("sortOrder", 0)
        piece_path = find_local_asset("Pieces", sort_order, "img") if sort_order else None

        item_copy = dict(item)
        item_copy["image_id"] = sort_order
        item_copy["piece_file"] = piece_path
        item_copy["icon_url"] = f"/api/assets/item/item_{idx + 1:02d}.png"
        item_copy["item_index"] = idx + 1
        result.append(item_copy)

    if page is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result


@router.get('/api/assets/item/{filename}')
def serve_item_icon(filename: str):
    """Serve cropped item icon from user-data/extracted-gamedata/item_icons/"""
    path = os.path.join("user-data", "extracted-gamedata", "item_icons", filename)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Item icon not found")


@router.get('/api/item/{item_id}')
def get_item_details(item_id: int):
    """Retrieve details for a specific item, including obtain sources (loot) and usage requirements."""
    item_db = gamedata.get("items", {})
    item_set = item_db.get("itemSet", [])
    
    idx = item_id - 1
    if idx < 0 or idx >= len(item_set):
        raise HTTPException(status_code=404, detail="Item not found")
        
    item = item_set[idx]
    
    # 1. Used For: Character Job Unlocks
    used_in_jobs = []
    char_db = gamedata.get("characters", {})
    char_infos = char_db.get("infos", [])
    jobs_data = char_db.get("data", [])
    jobs_by_id = {job["ID"]: job for job in jobs_data}
    
    for char in char_infos:
        for job_id in char.get("Jobs", []):
            job = jobs_by_id.get(job_id)
            if job:
                for item_entry in job.get("items", []):
                    code = item_entry.get("code", 0)
                    if code > 0 and (code // 256) == item_id:
                        count = code % 256
                        used_in_jobs.append({
                            "character_id": char["ID"],
                            "character_name": char["NameString"],
                            "job_name": job["NameString"],
                            "count": count
                        })
                        
    # 2. Used For: Rebirth/Reconstruction
    used_in_rebirth = []
    rebirth_infos = char_db.get("rebirthInfo", [])
    char_infos_by_id = {c["ID"]: c for c in char_infos}
    
    for rb in rebirth_infos:
        for item_entry in rb.get("items", []):
            code = item_entry.get("code", 0)
            if code > 0 and (code // 256) == item_id:
                count = code % 256
                src_char = char_infos_by_id.get(rb.get("srcChrID", 0))
                dst_char = char_infos_by_id.get(rb.get("dstChrID", 0))
                used_in_rebirth.append({
                    "src_character_id": rb.get("srcChrID"),
                    "src_character_name": src_char["NameString"] if src_char else None,
                    "dst_character_id": rb.get("dstChrID"),
                    "dst_character_name": dst_char["NameString"] if dst_char else None,
                    "count": count
                })
                
    # 3. Used For: Buddy Evolution
    used_in_buddies = []
    buddy_db = gamedata.get("buddies", {})
    buddy_data = buddy_db.get("data", [])
    
    for buddy in buddy_data:
        for item_entry in buddy.get("items", []):
            code = item_entry.get("code", 0)
            if code > 0 and (code // 256) == item_id:
                count = code % 256
                used_in_buddies.append({
                    "buddy_id": buddy.get("ID"),
                    "buddy_name": buddy.get("NameString"),
                    "count": count
                })
                
    # 4. Where to Obtain: Enemy Drops
    dropped_by_enemies = []
    enemy_db = gamedata.get("enemies", {})
    enemy_data = enemy_db.get("data", [])
    
    enemy_id_to_drops = {}
    for enemy in enemy_data:
        for item_entry in enemy.get("items", []):
            code = item_entry.get("code", 0)
            if code > 0 and (code // 256) == item_id:
                rate = code % 256
                enemy_id_to_drops[enemy["ID"]] = rate
                dropped_by_enemies.append({
                    "enemy_id": enemy["ID"],
                    "enemy_name": enemy.get("NameString"),
                    "rate": rate
                })
                
    # 5. Where to Obtain: Stages/Chapters
    dropped_in_stages = []
    stages_db = gamedata.get("stages", {})
    chapters = stages_db.get("chapters", [])
    layout_db = gamedata.get("stages_layout", {})
    enemies_by_id = {e["ID"]: e for e in enemy_data}
    
    for ch in chapters:
        chapter_no = str(ch.get("chapterNo", ""))
        ch_layout = layout_db.get(chapter_no, {})
        
        for s_idx, sec in enumerate(ch.get("sections", [])):
            sec_id = str(s_idx + 1)
            sec_layout = ch_layout.get(sec_id)
            
            is_section_drop = (sec.get("itemID") == item_id)
            section_drop_count = sec.get("itemCount", 0) if is_section_drop else 0
            
            spawning_enemies = {}
            if sec_layout:
                for wave in sec_layout:
                    for enemy in wave.get("enemies", []):
                        eid = enemy.get("enemy_id")
                        if eid in enemy_id_to_drops:
                            spawning_enemies[eid] = enemy_id_to_drops[eid]
            
            if is_section_drop or spawning_enemies:
                ch_num = ch.get("chapterNo")
                sec_num = s_idx + 1
                title_info = resolve_section_title(ch_num, sec_num, sec.get("title", ""))
                dropped_in_stages.append({
                    "chapter_no": ch_num,
                    "section_index": sec_num,
                    "section_title": title_info["title"],
                    "section_title_loc": title_info["title_loc"],
                    "subtitle": title_info["subtitle"],
                    "is_section_drop": is_section_drop,
                    "section_drop_count": section_drop_count,
                    "spawning_enemies": [
                        {
                            "enemy_id": eid,
                            "enemy_name": enemies_by_id[eid].get("NameString") if eid in enemies_by_id else None,
                            "rate": rate
                        } for eid, rate in spawning_enemies.items()
                    ]
                })
                
    dropped_in_stages.sort(key=lambda x: (x["chapter_no"], x["section_index"]))

    # 6. Where to Obtain: runtime-configured event boss drops (StageDrops.json)
    stage_drops = gamedata.get("stage_drops", {})
    native_by_stage = {}
    for drop_chapter, sections in stage_drops.items():
        for drop_section, records in sections.items():
            for rec in records:
                if rec.get("item_id") == item_id and rec.get("enemy_id") in enemies_by_id:
                    native_by_stage.setdefault((int(drop_chapter), int(drop_section)), []).append(rec)

    chapters_by_no = {ch["chapterNo"]: ch for ch in chapters}
    for (chapter_no, sec_num), records in native_by_stage.items():
        ch = chapters_by_no.get(chapter_no)
        if not ch or sec_num > len(ch.get("sections", [])):
            continue
        spawning = {}
        for rec in records:
            eid = rec["enemy_id"]
            if eid not in spawning:
                spawning[eid] = {
                    "enemy_id": eid,
                    "enemy_name": enemies_by_id[eid].get("NameString"),
                    "rate": rec.get("ratio"),
                }
        existing = next(
            (e for e in dropped_in_stages
             if e["chapter_no"] == chapter_no and e["section_index"] == sec_num),
            None,
        )
        if existing:
            # Regular EnemyData loot wins over a configured slot for the same enemy.
            for row in spawning.values():
                if all(row["enemy_id"] != e.get("enemy_id") for e in existing["spawning_enemies"]):
                    existing["spawning_enemies"].append(row)
        else:
            title_info = resolve_section_title(chapter_no, sec_num, ch["sections"][sec_num - 1].get("title", ""))
            dropped_in_stages.append({
                "chapter_no": chapter_no,
                "section_index": sec_num,
                "section_title": title_info["title"],
                "section_title_loc": title_info["title_loc"],
                "subtitle": title_info["subtitle"],
                "is_section_drop": False,
                "section_drop_count": 0,
                "spawning_enemies": list(spawning.values()),
            })
    dropped_in_stages.sort(key=lambda x: (x["chapter_no"], x["section_index"]))
    
    return {
        "item_id": item_id,
        "name": item.get("NameString"),
        "desc": item.get("DescString"),
        "sort_order": item.get("sortOrder"),
        "icon_url": f"/api/assets/item/item_{item_id:02d}.png",
        "dropped_by_enemies": dropped_by_enemies,
        "dropped_in_stages": dropped_in_stages,
        "used_in_jobs": used_in_jobs,
        "used_in_rebirth": used_in_rebirth,
        "used_in_buddies": used_in_buddies
    }

