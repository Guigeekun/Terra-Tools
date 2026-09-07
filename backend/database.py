import os
import re as _re
import json
from backend.config import DATA_DIR, EXTRACTED_DIR, STORY_SCENARIO_OFFSET

# Cached Databases
gamedata: dict = {}

BG_MAP: dict[int, str] = {}
BGM_MAP: dict[int, str] = {}
CHAPTER_BANNER_MAP: dict[int, str] = {}
SECTION_BANNER_MAP: dict[tuple[int, int], str] = {}
ASSET_INDEX: dict = {}


def build_media_indices():
    """Build fast lookup tables for background images, BGM track files, and stage banners."""
    global BG_MAP, BGM_MAP, CHAPTER_BANNER_MAP, SECTION_BANNER_MAP
    BG_MAP.clear()
    BGM_MAP.clear()
    CHAPTER_BANNER_MAP.clear()
    SECTION_BANNER_MAP.clear()

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

    banner_dir = os.path.join(EXTRACTED_DIR, "Banner")
    if os.path.exists(banner_dir):
        for f in os.listdir(banner_dir):
            if f.endswith(".png"):
                clean = _re.sub(r"^[0-9a-f]{32}", "", f)
                base = clean[:-4]
                img_url = f"/api/assets/image?path={EXTRACTED_DIR}/Banner/{f}".replace("\\", "/")

                # Match section banners: sp{ch}-{sec}, mp{ch}-{sec}
                m_sec = _re.match(r"^(?:sp|mp)(\d+)-(\d+)(?:_.*)?$", base)
                if m_sec:
                    cno, sno = int(m_sec.group(1)), int(m_sec.group(2))
                    SECTION_BANNER_MAP[(cno, sno)] = img_url
                    continue

                # Match chapter banners: sp{ch}, mp{ch}
                m_ch = _re.match(r"^(?:sp|mp)(\d+)(?:_.*)?$", base)
                if m_ch:
                    cno = int(m_ch.group(1))
                    CHAPTER_BANNER_MAP[cno] = img_url
                    continue


def get_chapter_banner(chapter_no: int | str) -> str | None:
    """Return the banner image URL for event/special chapters, or fallback to section 1 banner if available."""
    try:
        cno = int(chapter_no)
    except (ValueError, TypeError):
        return None
    # Main story chapters (1-42, 100-119) are on the world map and have no banners
    if (1 <= cno <= 42) or (100 <= cno <= 119):
        return None
    if cno in CHAPTER_BANNER_MAP:
        return CHAPTER_BANNER_MAP[cno]
    return SECTION_BANNER_MAP.get((cno, 1))


def get_section_banner(chapter_no: int | str, sec_idx: int | str) -> str | None:
    """Return the banner image URL for a specific chapter section."""
    try:
        cno = int(chapter_no)
        sno = int(sec_idx)
    except (ValueError, TypeError):
        return None
    # Main story chapters (1-42, 100-119) have no stage banners
    if (1 <= cno <= 42) or (100 <= cno <= 119):
        return None
    return SECTION_BANNER_MAP.get((cno, sno))



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


from backend.stage_translations import (
    translate_stage_title,
    build_dynamic_translation_lookup,
)


def get_main_story_section_scenario_index(chapter_no: int | str, sec_idx: int | str) -> int | None:
    """Return the 0-based scenarioSet index for a main story chapter (1-42 or 100-119) and section (1-indexed)."""
    try:
        ch = int(chapter_no)
        sec = int(sec_idx)
    except (ValueError, TypeError):
        return None

    # Chapters 1-42
    if 1 <= ch <= 42:
        if ch == 1:
            base = 57
        elif ch == 2:
            base = 62
        elif ch == 3:
            base = 67
        else:
            base = 72 + (ch - 4) * 10
        return base + (sec - 1)

    # Chapters 100-104 (New Chapters 1-5)
    if 100 <= ch <= 104:
        ch_offsets = {100: 455, 101: 459, 102: 464, 103: 469, 104: 474}
        base = ch_offsets.get(ch, 455)
        return base + (sec - 1)

    # Chapters 110-114 (Descent of the Five)
    if 110 <= ch <= 114:
        return 475 + (ch - 110)

    # Chapters 115-119 (Descent of the Five Hard)
    if 115 <= ch <= 119:
        return 480 + (ch - 115)

    return None


def resolve_section_title(chapter_no: int | str, sec_idx: int | str, raw_title: str = "") -> dict:
    """Resolve a localized section title dictionary and subtitle dictionary with full dynamic English translation."""
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

    # Non-scenario chapters: translate Japanese raw_title dynamically from game database terms
    lookup = gamedata.get("translation_lookup", {})
    en_title = translate_stage_title(raw_title, lookup) if raw_title else f"Stage {chapter_no}-{sec_idx}"
    ja_title = raw_title.strip() if raw_title else f"Stage {chapter_no}-{sec_idx}"

    title_loc = {
        "en": en_title,
        "ja": ja_title,
        "fr": en_title,
        "de": en_title,
        "es": en_title,
        "zh_tw": ja_title,
    }

    return {
        "subtitle": {"en": en_title, "ja": ja_title},
        "title_loc": title_loc,
        "title": en_title
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

    # Build dynamic translation lookup
    gamedata["translation_lookup"] = build_dynamic_translation_lookup(gamedata)
    print(f"Built dynamic translation lookup: {len(gamedata['translation_lookup'])} terms")


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

