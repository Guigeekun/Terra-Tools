import os
import re as _re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.database import (
    gamedata,
    BG_MAP,
    BGM_MAP,
    find_local_asset,
    resolve_section_title,
    get_chapter_stories_by_section
)

router = APIRouter(tags=["stages"])


@router.get('/api/chapters')
def get_chapters():
    """Retrieve main story chapters (Chapters 1 to 42) with resolved narrative text."""
    book_data = gamedata.get("book", {}).get("data", [])
    scenario_lookup = gamedata.get("scenario_lookup", {})

    result = []
    for chapter in book_data:
        ch_key = chapter.get("key", "")
        # Strictly limit to main story chapters Chapter1 through Chapter42
        m = _re.match(r"^Chapter(\d+)$", ch_key, _re.IGNORECASE)
        if not m:
            continue
        ch_num = int(m.group(1))
        if not (1 <= ch_num <= 42):
            continue

        stories = []
        for s in chapter.get("stories", []):
            sid = s.get("scenarioID")
            if sid:
                story_data = dict(scenario_lookup.get(sid, {"scenarioID": sid}))
                bg_id = story_data.get("bgID", 0)
                bgm_id = story_data.get("bgmID", 0)
                story_data["bg_url"] = f"/api/bg/{bg_id}" if bg_id in BG_MAP else None
                story_data["bgm_url"] = f"/api/play/BGM/{BGM_MAP[bgm_id]}" if bgm_id in BGM_MAP else None
                stories.append(story_data)

        result.append({
            "key": ch_key,
            "chapterNo": ch_num,
            "title": chapter.get("title", ""),
            "icon": chapter.get("icon", ""),
            "unlockType": chapter.get("unlockType", 0),
            "unlockValue": chapter.get("unlockValue", 0),
            "stories": stories,
        })

    result.sort(key=lambda x: x["chapterNo"])
    return result


@router.get('/api/stages')
def get_stages(page: int = None, limit: int = 20, search: str = ""):
    """Retrieve chapters and stages with their wave, enemy layout, and story narrative details."""
    chapters = gamedata.get("stages", {}).get("chapters", [])
    layout_db = gamedata.get("stages_layout", {})
    enemy_db = gamedata.get("enemies", {}).get("data", [])
    strings_db = gamedata.get("strings", {})
    scenario_lookup = gamedata.get("scenario_lookup", {})

    enemies_by_id = {e["ID"]: e for e in enemy_db}
    buddy_db = gamedata.get("buddies", {}).get("data", [])
    buddies_by_id = {b["ID"]: b for b in buddy_db}

    q = search.lower().strip()
    filtered_chapters = []
    for ch in chapters:
        ch_no = ch.get("chapterNo", 0)
        title = f"Chapter {ch_no}"
        if strings_db.get("scenarioSet") and ch_no - 1 < len(strings_db["scenarioSet"]):
            title = strings_db["scenarioSet"][ch_no - 1].get("en", title)

        if q and not (q in str(ch_no) or q in title.lower()):
            continue

        filtered_chapters.append(ch)

    total = len(filtered_chapters)
    if page is not None:
        start_idx = (page - 1) * limit
        target_chapters = filtered_chapters[start_idx:start_idx + limit]
    else:
        target_chapters = filtered_chapters

    result_chapters = []
    for ch in target_chapters:
        chapter_no = str(ch.get("chapterNo", ""))
        ch_layout = layout_db.get(chapter_no, {})
        book_sec_stories = get_chapter_stories_by_section(chapter_no)

        result_sections = []
        for idx, sec in enumerate(ch.get("sections", [])):
            sec_copy = dict(sec)
            sec_id = str(idx + 1)
            sec_num = idx + 1
            sec_copy["section_index"] = sec_num

            title_info = resolve_section_title(ch.get("chapterNo", chapter_no), sec_num, sec.get("title", ""))
            sec_copy["title"] = title_info["title"]
            sec_copy["title_loc"] = title_info["title_loc"]
            sec_copy["subtitle"] = title_info["subtitle"]

            # Resolve companion drops (dropBuddies)
            raw_drop_buddies = sec.get("dropBuddies", [])
            resolved_buddies = []
            for b_entry in raw_drop_buddies:
                if isinstance(b_entry, dict):
                    code = b_entry.get("code", 0)
                    b_id = b_entry.get("id") or (code // 256 if code > 0 else 0)
                    count = b_entry.get("count") or (code % 256 if code > 0 else 1)
                elif isinstance(b_entry, int):
                    b_id = b_entry // 256 if b_entry > 256 else b_entry
                    count = b_entry % 256 if b_entry > 256 else 1
                else:
                    b_id = 0
                    count = 1

                if b_id > 0:
                    buddy_info = buddies_by_id.get(b_id)
                    if buddy_info:
                        image_id = buddy_info.get("ImageID", 0)
                        resolved_buddies.append({
                            "id": b_id,
                            "ID": b_id,
                            "NameString": buddy_info.get("NameString", {}),
                            "name": buddy_info.get("NameString", {}),
                            "DescString": buddy_info.get("DescString", {}),
                            "desc": buddy_info.get("DescString", {}),
                            "count": count,
                            "rarity": buddy_info.get("rarity", 0),
                            "ImageID": image_id,
                            "image_id": image_id,
                            "thumb_file": find_local_asset("BuddyThumbs", image_id, "img"),
                            "image_file": find_local_asset("BuddyImages", image_id, "img"),
                            "skill": buddy_info.get("skill"),
                            "ATKmax": buddy_info.get("ATKmax", 0),
                            "DEFmax": buddy_info.get("DEFmax", 0),
                            "SATKmax": buddy_info.get("SATKmax", 0),
                            "SDEFmax": buddy_info.get("SDEFmax", 0),
                            "MaxLevel": buddy_info.get("MaxLevel", 0),
                            "evolveID": buddy_info.get("evolveID", 0),
                        })
                    else:
                        resolved_buddies.append({
                            "id": b_id,
                            "ID": b_id,
                            "NameString": {"en": f"Companion #{b_id}"},
                            "name": {"en": f"Companion #{b_id}"},
                            "count": count,
                            "rarity": 0,
                            "ImageID": 0,
                            "image_id": 0,
                            "thumb_file": None
                        })
            sec_copy["dropBuddies"] = resolved_buddies

            sec_layout = ch_layout.get(sec_id)  # list of {type:'story'|'wave', ...}

            if sec_layout:
                # Use exact parsed Lua sequence (Chapters 1-7, 6000-6006)
                sequence = []
                for item in sec_layout:
                    item_type = item.get("type", "wave")
                    if item_type == "story":
                        sid = item.get("scenarioID", "")
                        story_data = dict(scenario_lookup.get(sid, {
                            "scenarioID": sid, "bgID": 0, "bgmID": 0,
                            "text_clean": {}, "text_raw": {}
                        }))
                        bg_id = story_data.get("bgID", 0)
                        bgm_id = story_data.get("bgmID", 0)
                        story_data["bg_url"] = f"/api/bg/{bg_id}" if bg_id in BG_MAP else None
                        story_data["bgm_url"] = f"/api/play/BGM/{BGM_MAP[bgm_id]}" if bgm_id in BGM_MAP else None
                        sequence.append({"type": "story", **story_data})
                    else:
                        # Wave item — resolve enemy details, BG, and BGM
                        w_bg = item.get("bgID", 0)
                        w_bgm = item.get("bgmID", 0)
                        enemies_list = []
                        for enemy in item.get("enemies", []):
                            enemy_id = enemy.get("enemy_id")
                            enemy_info = enemies_by_id.get(enemy_id) if enemy_id else None
                            enemy_detail = {
                                "enemy_var": enemy.get("enemy_var"),
                                "enemy_id": enemy_id,
                                "x": enemy.get("x"),
                                "y": enemy.get("y"),
                                "vid": enemy.get("vid")
                            }
                            if enemy_info:
                                enemy_detail["NameString"] = enemy_info.get("NameString")
                                enemy_detail["HP"] = enemy_info.get("HP")
                                enemy_detail["ATK"] = enemy_info.get("ATK")
                                enemy_detail["DEF"] = enemy_info.get("DEF")
                                enemy_detail["LV"] = enemy_info.get("LV")
                                enemy_detail["ImageID"] = enemy_info.get("ImageID")
                            enemies_list.append(enemy_detail)
                        sequence.append({
                            "type": "wave",
                            "wave_index": item.get("wave_index"),
                            "battle_name": item.get("battle_name"),
                            "bgID": w_bg,
                            "bgmID": w_bgm,
                            "bg_url": f"/api/bg/{w_bg}" if w_bg in BG_MAP else None,
                            "bgm_url": f"/api/play/BGM/{BGM_MAP[w_bgm]}" if w_bgm in BGM_MAP else None,
                            "enemies": enemies_list
                        })
                sec_copy["sequence"] = sequence
            else:
                # Synthesize section sequence from BattleData + BookData (Chapters 8-42, 100+, etc.)
                sequence = []
                sec_stories = book_sec_stories.get(sec_num, [])
                sequence.extend(sec_stories)

                default_bg = sec_stories[0].get("bgID", 0) if sec_stories else 0
                default_bgm = sec_stories[0].get("bgmID", 10) if sec_stories else 10

                battle_cnt = sec.get("battleCnt", 0)
                for w in range(1, battle_cnt + 1):
                    sequence.append({
                        "type": "wave",
                        "wave_index": w,
                        "battle_name": f"Wave {w}",
                        "bgID": default_bg,
                        "bgmID": default_bgm,
                        "bg_url": f"/api/bg/{default_bg}" if default_bg in BG_MAP else None,
                        "bgm_url": f"/api/play/BGM/{BGM_MAP[default_bgm]}" if default_bgm in BGM_MAP else None,
                        "enemies": []
                    })
                sec_copy["sequence"] = sequence

            if sec.get("battleCnt", 0) > 0 or sec_layout or sec_copy.get("sequence"):
                result_sections.append(sec_copy)

        ch_copy = dict(ch)
        ch_copy["sections"] = result_sections
        result_chapters.append(ch_copy)

    if page is not None:
        return {
            "items": result_chapters,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result_chapters


@router.get('/api/bg/{bg_id}')
def serve_bg_image(bg_id: int):
    """Serve stage background image by bgID."""
    bg_path = BG_MAP.get(bg_id)
    if not bg_path or not os.path.exists(bg_path):
        raise HTTPException(status_code=404, detail=f"Background image for bgID {bg_id} not found")
    return FileResponse(bg_path, media_type="image/png")

