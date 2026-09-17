import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

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

