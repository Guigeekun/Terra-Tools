import os
from fastapi import APIRouter
from backend.database import gamedata
from backend.config import EXTRACTED_DIR

router = APIRouter(tags=["system"])


@router.get('/api/strings')
def get_strings():
    """Retrieve string sets for UI and narrative text."""
    string_db = gamedata.get("strings", {})
    return string_db


@router.get('/api/stats')
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

