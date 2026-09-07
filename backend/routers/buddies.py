from fastapi import APIRouter, HTTPException
from backend.database import gamedata, find_local_asset

router = APIRouter(tags=["buddies"])


@router.get('/api/buddies')
def get_buddies(page: int = None, limit: int = 20, search: str = "", rarity: str = ""):
    """Retrieve buddies/companions with optional pagination and filters."""
    buddy_db = gamedata.get("buddies", {})
    data = buddy_db.get("data", [])
    
    q = search.lower().strip()
    filtered = []
    for buddy in data:
        if rarity and str(buddy.get("rarity", "")) != str(rarity):
            continue
        if q:
            name_en = buddy.get("NameString", {}).get("en", "").lower()
            name_ja = buddy.get("NameString", {}).get("ja", "").lower()
            desc_en = buddy.get("DescString", {}).get("en", "").lower()
            if not (q in name_en or q in name_ja or q in desc_en):
                continue
        filtered.append(buddy)

    total = len(filtered)
    if page is not None:
        start_idx = (page - 1) * limit
        target = filtered[start_idx:start_idx + limit]
    else:
        target = filtered

    result = []
    for buddy in target:
        image_id = buddy.get("ImageID", 0)
        thumb_path = find_local_asset("BuddyThumbs", image_id, "img")
        image_path = find_local_asset("BuddyImages", image_id, "img")
        
        buddy_copy = dict(buddy)
        buddy_copy["thumb_file"] = thumb_path
        buddy_copy["image_file"] = image_path
        result.append(buddy_copy)
        
    if page is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return result


@router.get('/api/buddy/{buddy_id}')
def get_buddy_details(buddy_id: int):
    """Retrieve details for a single companion/buddy by ID."""
    buddy_db = gamedata.get("buddies", {})
    data = buddy_db.get("data", [])
    buddy = next((b for b in data if b.get("ID") == buddy_id), None)
    if not buddy:
        raise HTTPException(status_code=404, detail="Buddy not found")

    image_id = buddy.get("ImageID", 0)
    buddy_copy = dict(buddy)
    buddy_copy["thumb_file"] = find_local_asset("BuddyThumbs", image_id, "img")
    buddy_copy["image_file"] = find_local_asset("BuddyImages", image_id, "img")
    return buddy_copy

