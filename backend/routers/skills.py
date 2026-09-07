from fastapi import APIRouter
from backend.database import gamedata

router = APIRouter(tags=["skills"])


@router.get('/api/skills')
def get_skills(page: int = None, limit: int = 30, search: str = ""):
    """Retrieve skills database with optional pagination."""
    skill_db = gamedata.get("skills", {})
    types = skill_db.get("types", [])

    q = search.lower().strip()
    filtered = []
    for skill in types:
        if q:
            name_en = skill.get("nameString", {}).get("en", "").lower()
            desc_en = skill.get("descString", {}).get("en", "").lower()
            icon_no = str(skill.get("iconNo", ""))
            if not (q in name_en or q in desc_en or q in icon_no):
                continue
        filtered.append(skill)

    total = len(filtered)
    if page is not None:
        start_idx = (page - 1) * limit
        target = filtered[start_idx:start_idx + limit]
        return {
            "items": target,
            "total": total,
            "page": page,
            "has_more": (page * limit) < total
        }
    return types

