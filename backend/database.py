import os
import re as _re
import json
from backend.config import DATA_DIR, EXTRACTED_DIR, STORY_SCENARIO_OFFSET

# Cached Databases
gamedata: dict = {}

BG_MAP: dict[int, str] = {}
BGM_MAP: dict[int, str] = {}
ASSET_INDEX: dict = {}


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


def get_main_story_section_scenario_index(chapter_no: int | str, sec_idx: int | str) -> int | None:
    """Return the 0-based scenarioSet index for a main story chapter (1-42) and section (1-indexed)."""
    try:
        ch = int(chapter_no)
        sec = int(sec_idx)
    except (ValueError, TypeError):
        return None
    if not (1 <= ch <= 42):
        return None
    if ch == 1:
        base = 57
    elif ch == 2:
        base = 62
    elif ch == 3:
        base = 67
    else:
        base = 72 + (ch - 4) * 10
    return base + (sec - 1)


def resolve_section_title(chapter_no: int | str, sec_idx: int | str, raw_title: str = "") -> dict:
    """Resolve a localized section title dictionary and subtitle dictionary."""
    sc_idx = get_main_story_section_scenario_index(chapter_no, sec_idx)
    scenario_set = gamedata.get("strings", {}).get("scenarioSet", [])
    langs = ["en", "ja", "fr", "de", "es", "zh_tw"]

    if sc_idx is not None and sc_idx < len(scenario_set):
        entry = scenario_set[sc_idx]
        sub_dict = {
            lang: entry.get(lang, "").strip()
            for lang in langs
            if entry.get(lang, "").strip()
        }
        title_loc = {}
        for lang in langs:
            sub = sub_dict.get(lang) or sub_dict.get("en") or ""
            if sub:
                title_loc[lang] = f"Stage {chapter_no}-{sec_idx}: {sub}"
            else:
                title_loc[lang] = f"Stage {chapter_no}-{sec_idx}"

        return {
            "subtitle": sub_dict,
            "title_loc": title_loc,
            "title": title_loc.get("en", f"Stage {chapter_no}-{sec_idx}")
        }

    # Non-main story chapters or stages without scenarioSet entry
    fallback_title = raw_title.strip() if raw_title else f"Stage {chapter_no}-{sec_idx}"
    return {
        "subtitle": {},
        "title_loc": {lang: fallback_title for lang in langs},
        "title": fallback_title
    }


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


def build_asset_indices():
    """Build in-memory fast index for character pieces, illustrations, buddy thumbs/images."""
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

