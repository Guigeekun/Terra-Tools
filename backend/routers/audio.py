import os
from fastapi import APIRouter, Response
from fastapi.responses import FileResponse
from backend.config import EXTRACTED_DIR

router = APIRouter(tags=["audio"])


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


@router.get('/api/play/{category}/{filename}')
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

