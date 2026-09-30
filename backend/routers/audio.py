import hashlib
import os
from email.utils import formatdate

from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse
from backend.config import EXTRACTED_DIR

router = APIRouter(tags=["audio"])

# Preferred extension first; the same stem is accepted in either format so
# pre-MP3 user-data (WAV only) and stale client URLs keep working.
AUDIO_EXTENSIONS = (".mp3", ".wav")
MEDIA_TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav"}


def _resolve_audio_path(category: str, filename: str) -> str | None:
    """Return the on-disk path for a track, trying both audio extensions."""
    category = category.upper()
    if category not in ("BGM", "SE"):
        return None
    safe_stem = os.path.splitext(os.path.basename(filename))[0]
    if not safe_stem:
        return None
    directory = os.path.join(EXTRACTED_DIR, category)
    for ext in AUDIO_EXTENSIONS:
        path = os.path.join(directory, safe_stem + ext)
        if os.path.exists(path):
            return path
    return None


def _etag_for_stat(st: os.stat_result) -> str:
    """Strong ETag matching what Starlette's FileResponse derives from stat.

    Keeping the same formula lets If-Range validation agree with the 200/206
    responses.
    """
    etag_base = str(st.st_mtime) + "-" + str(st.st_size)
    return f'"{hashlib.md5(etag_base.encode(), usedforsecurity=False).hexdigest()}"'


def _if_none_match_hits(header_value: str | None, etag: str) -> bool:
    """RFC 7232 If-None-Match evaluation (weak tags compare equal)."""
    if not header_value:
        return False
    for candidate in header_value.split(","):
        candidate = candidate.strip()
        if candidate == "*":
            return True
        if candidate.startswith("W/"):
            candidate = candidate[2:]
        if candidate == etag:
            return True
    return False


@router.get('/api/audio')
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
                if f.endswith(AUDIO_EXTENSIONS):
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


@router.get('/api/play/{category}/{filename}')
def play_audio(category: str, filename: str, request: Request):
    """Serve an audio track (MP3 preferred), honouring If-None-Match with 304.

    Starlette's FileResponse handles Range/If-Range but never answers
    conditional requests, so expired cache entries would re-download the
    whole track; the check below keeps repeat listeners at ~zero bytes.
    """
    path = _resolve_audio_path(category, filename)
    if not path:
        return Response(content="Audio file not found", status_code=404)

    st = os.stat(path)
    etag = _etag_for_stat(st)
    if _if_none_match_hits(request.headers.get("if-none-match"), etag):
        return Response(
            status_code=304,
            headers={"etag": etag, "last-modified": formatdate(st.st_mtime, usegmt=True)},
        )

    ext = os.path.splitext(path)[1]
    # stat_result passed through: FileResponse would otherwise re-stat and,
    # via setdefault, keeps the ETag we validated above.
    return FileResponse(path, media_type=MEDIA_TYPES[ext], stat_result=st,
                        headers={"etag": etag})
