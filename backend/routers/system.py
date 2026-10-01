import os
from fastapi import APIRouter
from backend.database import gamedata
from backend.config import AUDIO_EXTENSIONS, EXTRACTED_DIR

router = APIRouter(tags=["system"])


def _count_audio_tracks(directory: str) -> int:
    """Count tracks in an audio directory, in either serving format.

    Deduplicates by stem so a track present as both .mp3 and .wav (stale
    user-data over a transcoded one) is still one track.
    """
    try:
        entries = os.listdir(directory)
    except OSError:
        return 0
    stems = {os.path.splitext(f)[0] for f in entries if f.endswith(AUDIO_EXTENSIONS)}
    return len(stems)


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
    enemy_count = len(gamedata.get("enemies", {}).get("data", []))

    bgm_count = _count_audio_tracks(os.path.join(EXTRACTED_DIR, "BGM"))
    se_count = _count_audio_tracks(os.path.join(EXTRACTED_DIR, "SE"))

    return {
        "characters": char_count,
        "buddies": buddy_count,
        "items": item_count,
        "skills": skill_count,
        "stages": stage_count,
        "enemies": enemy_count,
        "audio": {
            "BGM": list(range(bgm_count)),
            "SE": list(range(se_count))
        },
        "bgm_count": bgm_count,
        "se_count": se_count
    }

