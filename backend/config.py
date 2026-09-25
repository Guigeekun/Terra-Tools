import glob
import os

# Base paths
DATA_DIR = os.path.join("user-data", "extracted-gamedata", "game_data")
EXTRACTED_DIR = os.path.join("user-data", "extracted-gamedata")
LOCAL_INPUT_ROOT = "local-input"
# Tagged markdown documents served on the Docs tab
DOCS_DIR = os.path.join("docs")

# Index in StringSet.scenarioSet where actual story narrative text begins.
STORY_SCENARIO_OFFSET = 485

# Asset category folders that identify a usable gdresources platform directory.
ASSET_CATEGORIES = (
    "BG", "BGM", "Banner", "BuddyImages", "BuddyThumbs",
    "Illust", "Pieces", "SE", "Scenario",
)

# Fallback used when no gdresources* folder can be located (previous behaviour).
LEGACY_LOCAL_INPUT_DIR = os.path.join(
    LOCAL_INPUT_ROOT, "gdresources", "data_u2017", "android"
)

# How deep to search inside a gdresources* folder for the platform directory
# (e.g. gdresources/data_u2017/android or gdresources-light/android).
GDRESOURCES_MAX_DEPTH = 4


def find_gdresources_dirs(root=LOCAL_INPUT_ROOT):
    """List gdresources* candidate folders directly under `root` (e.g. local-input)."""
    try:
        entries = os.listdir(root)
    except OSError:
        return []
    candidates = []
    for name in sorted(entries):
        if name.lower().startswith("gdresources"):
            full = os.path.join(root, name)
            if os.path.isdir(full):
                candidates.append(full)
    return candidates


def _score_platform_dir(path):
    """Score a directory by how many known asset categories it contains."""
    try:
        entries = set(os.listdir(path))
    except OSError:
        return -1
    return sum(1 for cat in ASSET_CATEGORIES if cat in entries)


def find_gdresources_dir(root=LOCAL_INPUT_ROOT):
    """Locate the platform asset directory inside any gdresources* folder.

    Scans every `gdresources*` folder under `root` for the deepest directory
    that holds the known asset categories (BG, BGM, ...), preferring folders
    with the most categories, then 'android' layouts under a 'data_u2017' CDN
    revision (the revision the extraction pipeline reads from), then the
    shallower path. Returns the legacy hardcoded path when nothing is found so
    callers keep a stable value.
    """
    best_path = None
    best_rank = None

    for base in find_gdresources_dirs(root):
        for dirpath, dirnames, _ in os.walk(base):
            rel = os.path.relpath(dirpath, base)
            depth = 0 if rel == "." else rel.count(os.sep) + 1
            if depth > GDRESOURCES_MAX_DEPTH:
                dirnames[:] = []
                continue

            score = _score_platform_dir(dirpath)
            if score <= 0:
                continue
            # Rank by category count, then prefer the pipeline's CDN revision
            # and platform, then the shallower path on remaining ties.
            lowered = dirpath.lower()
            rank = (
                score,
                1 if "data_u2017" in lowered else 0,
                1 if os.path.basename(lowered) == "android" else 0,
                -depth,
            )
            if best_path is None or rank > best_rank:
                best_path = dirpath
                best_rank = rank

    return best_path if best_path is not None else LEGACY_LOCAL_INPUT_DIR


def get_local_input_dir():
    """Resolve the active gdresources* asset directory on each call."""
    return find_gdresources_dir(LOCAL_INPUT_ROOT)


# Resolved once at import for backward-compatible imports (app.py, scripts).
LOCAL_INPUT_DIR = get_local_input_dir()
