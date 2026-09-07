import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.config import LOCAL_INPUT_DIR

router = APIRouter(tags=["assets"])


@router.get('/api/assets')
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

