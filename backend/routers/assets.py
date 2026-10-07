import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.database import find_local_asset

router = APIRouter(tags=["assets"])


@router.get('/api/assets/image')
def serve_image(path: str):
    """Serve pre-extracted images from user-data/extracted-gamedata."""
    normalized_path = os.path.normpath(path).replace("\\", "/")

    # Validation to prevent path traversal outside user-data/extracted-gamedata
    if not normalized_path.startswith("user-data/extracted-gamedata/"):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(normalized_path, media_type="image/png")


@router.get('/api/assets/resolve')
def resolve_asset(category: str, image_id: int, prefix: str = "img"):
    """Resolve an image ID to its extracted file path.

    Filenames carry an md5 prefix (<md5>img_2124.png), so clients cannot
    construct the URL for an arbitrary ID — they ask this route instead.
    404 means the ID has no extracted art."""
    path = find_local_asset(category, image_id, prefix)
    if not path:
        raise HTTPException(status_code=404, detail="No extracted asset for this ID")
    return {"path": path}


