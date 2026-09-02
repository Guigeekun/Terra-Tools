import os
import sys
import json
import webbrowser
from threading import Timer
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import io

# Initialize FastAPI App using lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load databases before launching web server
    print("Loading game data databases...")
    load_databases()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folders

os.makedirs("frontend/dist/assets", exist_ok=True)
app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

@app.get('/TerraToolbox.png')
@app.get('/favicon.ico')
def serve_app_icon():
    pub_path = os.path.join("frontend", "public", "TerraToolbox.png")
    if os.path.exists(pub_path):
        return FileResponse(pub_path, media_type="image/png")
    dist_path = os.path.join("frontend", "dist", "TerraToolbox.png")
    if os.path.exists(dist_path):
        return FileResponse(dist_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Icon not found")

# Paths
DATA_DIR = os.path.join("user-data", "extracted-gamedata", "game_data")
EXTRACTED_DIR = os.path.join("user-data", "extracted-gamedata")
LOCAL_INPUT_DIR = os.path.join("local-input", "gdresources", "data_u2017", "android")

# Cached Databases
gamedata = {}


import re as _re

STORY_SCENARIO_OFFSET = 485
"""Index in StringSet.scenarioSet where actual story narrative text begins.

The first 485 entries in scenarioSet are short UI labels (chapter names, location
names, etc.). From index 485 onward the entries correspond 1-to-1 with the ordered
flat list of stories defined in BookData (all chapters concatenated in order)."""

BG_MAP: dict[int, str] = {}
BGM_MAP: dict[int, str] = {}


def build_media_indices():
    """Build fast lookup tables for background images and BGM track files."""
    global BG_MAP, BGM_MAP
    BG_MAP = {}
    BGM_MAP = {}

    bg_dir = os.path.join(EXTRACTED_DIR, "BG")
    if os.path.exists(bg_dir):
        for f in os.listdir(bg_dir):
            if f.endswith(".png"):
                m = _re.search(r"stage_back_(\d+)\.png", f, _re.IGNORECASE)
                if m:
                    BG_MAP[int(m.group(1))] = f"{EXTRACTED_DIR}/BG/{f}".replace("\\", "/")

    bgm_dir = os.path.join(EXTRACTED_DIR, "BGM")
    if os.path.exists(bgm_dir):
        for f in os.listdir(bgm_dir):
            if f.endswith(".wav"):
                m = _re.search(r"bgm_?(\d+)", f, _re.IGNORECASE)
                if m:
                    BGM_MAP[int(m.group(1))] = f


def strip_story_markup(text: str) -> str:
    """Strip game engine markup tags from a story string, returning plain readable text."""
    if not text:
        return ""
    # Remove all angle-bracket tags: <anim=...>, <fstyle=...>, <s>, </s>, <p>, etc.
    text = _re.sub(r"<[^>]+>", "", text)
    # Collapse multiple spaces/tabs to a single space
    text = _re.sub(r"[ \t]+", " ", text)
    # Collapse excessive newlines (>2) to double newline
    text = _re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_scenario_lookup() -> dict:
    """Build a dict mapping scenarioID -> resolved story data.

    Uses the positional offset mapping between BookData (ordered story list)
    and StringSet.scenarioSet (narrative text entries starting at index 485).
    """
    book_data = gamedata.get("book", {}).get("data", [])
    scenario_set = gamedata.get("strings", {}).get("scenarioSet", [])

    if not book_data or not scenario_set:
        return {}

    langs = ["en", "ja", "fr", "de", "es", "zh_tw"]
    lookup: dict[str, dict] = {}

    n = 0
    for chapter in book_data:
        for story_ref in chapter.get("stories", []):
            sid = story_ref.get("scenarioID", "")
            idx = STORY_SCENARIO_OFFSET + n
            n += 1
            if not sid:
                continue
            if idx < len(scenario_set):
                entry = scenario_set[idx]
                lookup[sid] = {
                    "scenarioID": sid,
                    "bgID": entry.get("bgID", 0),
                    "bgmID": entry.get("bgmID", 0),
                    "flag": entry.get("flag", 0),
                    "text_clean": {lang: strip_story_markup(entry.get(lang, "")) for lang in langs},
                    "text_raw": {lang: entry.get(lang, "") for lang in langs},
                }
            else:
                lookup[sid] = {
                    "scenarioID": sid,
                    "bgID": 0, "bgmID": 0, "flag": 0,
                    "text_clean": {}, "text_raw": {},
                }

    return lookup


def get_chapter_stories_by_section(chapter_no: int | str) -> dict[int, list[dict]]:
    """Map chapter_no -> dict[sec_index, list of resolved story dicts]."""
    book_data = gamedata.get("book", {}).get("data", [])
    scenario_lookup = gamedata.get("scenario_lookup", {})

    target_key = f"Chapter{chapter_no}"
    ch_book = next((b for b in book_data if b.get("key") == target_key), None)
    if not ch_book:
        return {}

    stories_by_sec: dict[int, list[dict]] = {}
    for story_ref in ch_book.get("stories", []):
        sid = story_ref.get("scenarioID", "")
        if not sid:
            continue

        m = _re.search(r"CH_\d+_(\d+)", sid)
        sec_idx = int(m.group(1)) if m else 1

        if sec_idx not in stories_by_sec:
            stories_by_sec[sec_idx] = []

        story_data = dict(scenario_lookup.get(sid, {
            "scenarioID": sid, "bgID": 0, "bgmID": 0,
            "text_clean": {}, "text_raw": {}
        }))
        bg_id = story_data.get("bgID", 0)
        bgm_id = story_data.get("bgmID", 0)
        story_data["bg_url"] = f"/api/bg/{bg_id}" if bg_id in BG_MAP else None
        story_data["bgm_url"] = f"/api/play/BGM/{BGM_MAP[bgm_id]}" if bgm_id in BGM_MAP else None
        stories_by_sec[sec_idx].append({"type": "story", **story_data})

    return stories_by_sec


def load_databases():
    """Load all game databases from JSON files."""
    db_files = {
        "characters": "ChrDatabase.json",
        "buddies": "BuddyDatabase.json",
        "items": "ItemSet.json",
        "skills": "SkillData.json",
        "stages": "BattleData.json",
        "strings": "StringSet.json",
        "enemies": "EnemyData.json",
        "stages_layout": "StagesLayout.json",
        "book": "BookData.json",
    }
    
    for key, filename in db_files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    gamedata[key] = json.load(f)
                print(f"Loaded database: {filename}")
            except Exception as e:
                print(f"Error loading {filename}: {e}")
                gamedata[key] = {}
        else:
            print(f"Warning: database file not found: {path}")
            gamedata[key] = {}

    # Pre-build scenario story lookup after all data is loaded
    gamedata["scenario_lookup"] = build_scenario_lookup()
    print(f"Built scenario story lookup: {len(gamedata['scenario_lookup'])} scenarios")

    # Build BG and BGM media indices
    build_media_indices()
    print(f"Built media indices: {len(BG_MAP)} BGs, {len(BGM_MAP)} BGMs")


ASSET_INDEX = {}

def build_asset_indices():
    global ASSET_INDEX
    ASSET_INDEX = {}
    categories = ["Pieces", "Illust", "BuddyThumbs", "BuddyImages"]
    for category in categories:
        directory = os.path.join(EXTRACTED_DIR, category)
        if os.path.exists(directory):
            try:
                for f in os.listdir(directory):
                    if f.endswith(".png"):
                        full_path = f"{EXTRACTED_DIR}/{category}/{f}".replace("\\", "/")
                        name_no_ext = f[:-4]
                        if "_" in name_no_ext:
                            prefix_part, num_part = name_no_ext.rsplit("_", 1)
                            prefix = "illust" if prefix_part.endswith("illust") else "img"
                            try:
                                num = int(num_part)
                                ASSET_INDEX[(category, prefix, num)] = full_path
                            except ValueError:
                                pass
            except Exception as e:
                print(f"Error indexing {category}: {e}")

def find_local_asset(category, image_id, prefix="img"):
    """Search pre-extracted assets by ImageID using instant in-memory lookup."""
    if not ASSET_INDEX:
        build_asset_indices()
    if image_id is None:
        return None
    try:
        return ASSET_INDEX.get((category, prefix, int(image_id)))
    except (ValueError, TypeError):
        return None

# API Endpoints
@app.get('/api/characters')
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

@app.get('/api/buddies')
def get_buddies(page: int = None, limit: int = 20, search: str = "", rarity: str = ""):
    """Retrieve buddies/companions with optional pagination and filters."""
    buddy_db = gamedata.get("buddies", {})
    data = buddy_db.get("data", [])
    
    q = search.lower().strip()
    filtered = []
    for buddy in data:
        if rarity and str(buddy.get("rarity", "")) != str(rarity):
            continue
        if q:
            name_en = buddy.get("NameString", {}).get("en", "").lower()
            name_ja = buddy.get("NameString", {}).get("ja", "").lower()
            desc_en = buddy.get("DescString", {}).get("en", "").lower()
            if not (q in name_en or q in name_ja or q in desc_en):
                continue
        filtered.append(buddy)

    total = len(filtered)
    if page is not None:
        start_idx = (page - 1) * limit
        target = filtered[start_idx:start_idx + limit]
    else:
        target = filtered

    result = []
    for buddy in target:
        image_id = buddy.get("ImageID", 0)
        thumb_path = find_local_asset("BuddyThumbs", image_id, "img")
        image_path = find_local_asset("BuddyImages", image_id, "img")
        
        buddy_copy = dict(buddy)
        buddy_copy["thumb_file"] = thumb_path
        buddy_copy["image_file"] = image_path
        result.append(buddy_copy)
        
    if page is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result

@app.get('/api/items')
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

@app.get('/api/assets/item/{filename}')
def serve_item_icon(filename: str):
    """Serve cropped item icon from user-data/extracted-gamedata/item_icons/"""
    path = os.path.join("user-data", "extracted-gamedata", "item_icons", filename)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Item icon not found")

@app.get('/api/skills')
def get_skills(page: int = None, limit: int = 30, search: str = ""):
    """Retrieve skills database with optional pagination."""
    skill_db = gamedata.get("skills", {})
    types = skill_db.get("types", [])

    q = search.lower().strip()
    filtered = []
    for skill in types:
        if q:
            name_en = skill.get("nameString", {}).get("en", "").lower()
            desc_en = skill.get("descString", {}).get("en", "").lower()
            icon_no = str(skill.get("iconNo", ""))
            if not (q in name_en or q in desc_en or q in icon_no):
                continue
        filtered.append(skill)

    total = len(filtered)
    if page is not None:
        start_idx = (page - 1) * limit
        target = filtered[start_idx:start_idx + limit]
        return {
            "items": target,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return types

@app.get('/api/chapters')
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


@app.get('/api/stages')
def get_stages(page: int = None, limit: int = 20, search: str = ""):
    """Retrieve chapters and stages with their wave, enemy layout, and story narrative details."""
    chapters = gamedata.get("stages", {}).get("chapters", [])
    layout_db = gamedata.get("stages_layout", {})
    enemy_db = gamedata.get("enemies", {}).get("data", [])
    strings_db = gamedata.get("strings", {})
    scenario_lookup = gamedata.get("scenario_lookup", {})

    enemies_by_id = {e["ID"]: e for e in enemy_db}

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

@app.get('/api/strings')
def get_strings():
    """Retrieve string sets for UI and narrative text."""
    string_db = gamedata.get("strings", {})
    return string_db

@app.get('/api/stats')
def get_stats():
    """Retrieve fast summary counts for the dashboard."""
    char_count = len(gamedata.get("characters", {}).get("infos", []))
    buddy_count = len(gamedata.get("buddies", {}).get("data", []))
    item_count = len(gamedata.get("items", {}).get("itemSet", []))
    skill_count = len(gamedata.get("skills", {}).get("types", []))
    stage_count = len(gamedata.get("stages", {}).get("chapters", []))
    
    bgm_count = 0
    se_count = 0
    bgm_dir = os.path.join(EXTRACTED_DIR, "BGM")
    if os.path.exists(bgm_dir):
        bgm_count = len([f for f in os.listdir(bgm_dir) if f.endswith(".wav")])
    se_dir = os.path.join(EXTRACTED_DIR, "SE")
    if os.path.exists(se_dir):
        se_count = len([f for f in os.listdir(se_dir) if f.endswith(".wav")])

    return {
        "characters": char_count,
        "buddies": buddy_count,
        "items": item_count,
        "skills": skill_count,
        "stages": stage_count,
        "audio": {
            "BGM": list(range(bgm_count)),
            "SE": list(range(se_count))
        },
        "bgm_count": bgm_count,
        "se_count": se_count
    }

@app.get('/api/audio')
def get_audio_list(category: str = "BGM", page: int = None, limit: int = 30, search: str = ""):
    """Scan extracted-gamedata directories and return lists of pre-extracted BGM and SE files with pagination."""
    category = category.upper()
    if category not in ["BGM", "SE"]:
        category = "BGM"
        
    directory = os.path.join(EXTRACTED_DIR, category)
    audio_list = []
    if os.path.exists(directory):
        try:
            q = search.lower().strip()
            for f in os.listdir(directory):
                if f.endswith(".wav"):
                    display_name = f[32:-4] if len(f) > 36 else f[:-4]
                    if q and not (q in display_name.lower() or q in f.lower()):
                        continue
                    path = os.path.join(directory, f)
                    audio_list.append({
                        "filename": f,
                        "name": display_name,
                        "path": f"{EXTRACTED_DIR}/{category}/{f}".replace("\\", "/"),
                        "size_bytes": os.path.getsize(path)
                    })
            audio_list.sort(key=lambda x: x["name"])
        except Exception as e:
            print(f"Error scanning {category}: {e}")

    total = len(audio_list)
    if page is not None:
        start_idx = (page - 1) * limit
        target = audio_list[start_idx:start_idx + limit]
        return {
            "items": target,
            "total": total,
            "page": page,
            "category": category,
            "has_more": (page * limit) < total
        }

    return {"BGM": audio_list if category == "BGM" else [], "SE": audio_list if category == "SE" else []}

@app.get('/api/bg/{bg_id}')
def serve_bg_image(bg_id: int):
    """Serve stage background image by bgID."""
    bg_path = BG_MAP.get(bg_id)
    if not bg_path or not os.path.exists(bg_path):
        raise HTTPException(status_code=404, detail=f"Background image for bgID {bg_id} not found")
    return FileResponse(bg_path, media_type="image/png")


@app.get('/api/play/{category}/{filename}')
def play_audio(category: str, filename: str):
    """Serve WAV audio file directly."""
    category = category.upper()
    if category not in ["BGM", "SE"]:
        return Response(content="Invalid category", status_code=400)
        
    safe_filename = os.path.basename(filename)
    path = os.path.join(EXTRACTED_DIR, category, safe_filename)
    if not os.path.exists(path):
        return Response(content="Audio file not found", status_code=404)
        
    return FileResponse(path, media_type="audio/wav")

@app.get('/api/assets')
def get_assets_inventory(page: int = None, limit: int = 30, search: str = "", category: str = "", signature: str = ""):
    """List all assets present in local-input with pagination."""
    inventory = []
    categories = ["BG", "BGM", "Banner", "BuddyImages", "BuddyThumbs", "Illust", "Pieces", "SE", "Scenario"]
    
    q = search.lower().strip()
    for cat in categories:
        if category and cat.lower() != category.lower():
            continue
            
        directory = os.path.join(LOCAL_INPUT_DIR, cat)
        if os.path.exists(directory):
            try:
                for f in os.listdir(directory):
                    if f.endswith(".bin"):
                        if q and not (q in f.lower() or q in cat.lower()):
                            continue
                            
                        path = os.path.join(directory, f)
                        size = os.path.getsize(path)
                        sig = "Unknown"
                        try:
                            with open(path, "rb") as test_f:
                                head = test_f.read(7)
                                if head.startswith(b"ENCA"):
                                    sig = "ENCA (Encrypted)"
                                elif head.startswith(b"UnityFS"):
                                    sig = "UnityFS (AssetBundle)"
                        except Exception:
                            pass
                            
                        if signature and signature.lower() not in sig.lower():
                            continue
                            
                        inventory.append({
                            "category": cat,
                            "filename": f,
                            "path": f"{LOCAL_INPUT_DIR}/{cat}/{f}".replace("\\", "/"),
                            "size_bytes": size,
                            "signature": sig
                        })
            except Exception:
                pass

    total = len(inventory)
    if page is not None:
        start_idx = (page - 1) * limit
        target = inventory[start_idx:start_idx + limit]
        return {
            "items": target,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }

    return inventory

@app.get('/api/assets/image')
def serve_image(path: str):
    """
    Serve pre-extracted images from user-data/extracted-gamedata.
    """
    normalized_path = os.path.normpath(path).replace("\\", "/")
    
    # Validation to prevent path traversal outside user-data/extracted-gamedata
    if not normalized_path.startswith("user-data/extracted-gamedata/"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(normalized_path, media_type="image/png")

@app.get('/api/item/{item_id}')
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
                dropped_in_stages.append({
                    "chapter_no": ch.get("chapterNo"),
                    "section_index": s_idx + 1,
                    "section_title": sec.get("title"),
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

# Web App Page Router
@app.get('/')
def index_page():
    """Serve the React single-page application."""
    if os.path.exists('frontend/dist/index.html'):
        return FileResponse('frontend/dist/index.html')
    return HTMLResponse("React frontend not found. Please run 'npm run build' in the 'frontend' directory.", status_code=404)

def open_browser():
    """Open user's default browser to local server port."""
    webbrowser.open_new("http://127.0.0.1:5001/")

if __name__ == "__main__":
    # Automatically open browser in 1.5 seconds
    Timer(1.5, open_browser).start()
    
    # Run local web server
    print("Starting FastAPI web server...")
    uvicorn.run(app, host="127.0.0.1", port=5001)
