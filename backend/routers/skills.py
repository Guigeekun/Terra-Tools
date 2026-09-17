from fastapi import APIRouter
from backend.database import gamedata, find_local_asset

router = APIRouter(tags=["skills"])

# Lazy-built reverse index: skill_id -> {"character": {chr_id: entry}, "buddy": {id: entry}, "enemy": {name: entry}}
# chr_meta: chr_id -> shared character display metadata (name, rarity, piece artwork)
_sources_index = None
_chr_meta = {}


def _image_url(path):
    return f"/api/assets/image?path={path}".replace("\\", "/") if path else None


def _en(string_obj):
    return (string_obj or {}).get("en", "")


def _char_meta_for(chr_id):
    """Display metadata for a character; falls back gracefully when infos are missing."""
    meta = _chr_meta.get(chr_id)
    if meta:
        return meta
    return {"type": "character", "id": chr_id, "name": f"Character {chr_id}", "rarity": 0, "image": None}


def get_skill_sources_index():
    """Build (once) a mapping of 1-based skill IDs to every known source.

    Skill IDs in the game databases are 1-based indices into SkillData.types
    (ID = array index + 1), as referenced by character job skill lists,
    buddies' `skill` field and enemies' `SkillSlot`.
    """
    global _sources_index, _chr_meta
    if _sources_index is not None:
        return _sources_index

    index = {}

    def bucket(skill_id):
        return index.setdefault(skill_id, {"character": {}, "buddy": {}, "enemy": {}})

    # --- Characters: aggregate, per character, the jobs granting each skill ---
    char_db = gamedata.get("characters", {})
    infos_by_chr = {info.get("ID"): info for info in char_db.get("infos", [])}

    for job in char_db.get("data", []):
        chr_id = job.get("chrID")
        if chr_id is None:
            continue
        meta = _chr_meta.get(chr_id)
        if meta is None:
            info = infos_by_chr.get(chr_id, {})
            meta = {
                "type": "character",
                "id": chr_id,
                "name": _en(info.get("NameString")) or _en(job.get("NameString")) or f"Character {chr_id}",
                "rarity": info.get("rarity", 0),
                "image": None,
            }
            _chr_meta[chr_id] = meta

        job_summary = {"id": job.get("ID"), "name": _en(job.get("NameString")) or meta["name"]}
        for skill_id in job.get("skills") or []:
            if not isinstance(skill_id, int) or skill_id <= 0:
                continue
            char_entry = bucket(skill_id)["character"].setdefault(
                chr_id, {"type": "character", "id": chr_id, "jobs": []}
            )
            char_entry["jobs"].append(job_summary)

    # Resolve display artwork per character (piece of the first job that has one)
    for chr_id, meta in _chr_meta.items():
        for job in char_db.get("data", []):
            if job.get("chrID") == chr_id:
                meta["image"] = _image_url(find_local_asset("Pieces", job.get("ImageID"), "img"))
                if meta["image"]:
                    break

    # --- Buddies (companions): one skill per buddy ---
    for buddy in gamedata.get("buddies", {}).get("data", []):
        skill_id = buddy.get("skill")
        if not isinstance(skill_id, int) or skill_id <= 0:
            continue
        bucket(skill_id)["buddy"][buddy.get("ID")] = {
            "type": "buddy",
            "id": buddy.get("ID"),
            "name": _en(buddy.get("NameString")) or f"Buddy {buddy.get('ID')}",
            "rarity": buddy.get("rarity", 0),
            "image": _image_url(find_local_asset("BuddyThumbs", buddy.get("ImageID"), "img")),
        }

    # --- Enemies: aggregate by display name (many IDs share the same foe) ---
    for enemy in gamedata.get("enemies", {}).get("data", []):
        slots = enemy.get("SkillSlot") or []
        name = _en(enemy.get("NameString"))
        if not slots or not name:
            continue
        image = _image_url(find_local_asset("Pieces", enemy.get("ImageID"), "img"))
        is_boss = (enemy.get("FrameType") or 0) >= 1
        for skill_id in slots:
            if not isinstance(skill_id, int) or skill_id <= 0:
                continue
            entry = bucket(skill_id)["enemy"].setdefault(
                name, {"type": "enemy", "name": name, "count": 0, "boss": False, "image": None}
            )
            entry["count"] += 1
            entry["boss"] = entry["boss"] or is_boss
            if entry["image"] is None:
                entry["image"] = image

    _sources_index = index
    return index


def _ordered_sources(skill_id):
    """Flat, deterministically ordered source list for one skill."""
    src = get_skill_sources_index().get(skill_id)
    if not src:
        return []

    characters = []
    for entry in src["character"].values():
        characters.append({**_char_meta_for(entry["id"]), "jobs": entry["jobs"]})
    characters.sort(key=lambda c: (-c.get("rarity", 0), c["id"]))

    buddies = sorted(src["buddy"].values(), key=lambda b: (-b.get("rarity", 0), b["id"]))
    enemies = sorted(src["enemy"].values(), key=lambda e: (-e["count"], e["name"]))

    return characters + buddies + enemies


@router.get('/api/skills')
def get_skills(
    page: int = None,
    limit: int = 30,
    search: str = "",
    source_type: str = "",
    element: str = "",
    kind: str = "",
    trigger: str = "",
    sort: str = "id",
    order: str = "asc",
):
    """Retrieve the skills database with sources, server-side filtering, sorting and pagination."""
    types = gamedata.get("skills", {}).get("types", [])
    q = search.lower().strip()

    filtering = bool(q or source_type or element or kind or trigger)

    filtered = []
    for idx, skill in enumerate(types):
        if element != "" and str(skill.get("attrib", 0)) != str(element):
            continue
        if kind != "" and str(skill.get("kind", 0)) != str(kind):
            continue
        if trigger == "equip" and (skill.get("emitRatio") or 0) != 0:
            continue
        if trigger == "active" and (skill.get("emitRatio") or 0) == 0:
            continue

        skill_id = idx + 1
        sources = _ordered_sources(skill_id) if (q or source_type) else None

        if source_type:
            if source_type == "none":
                if sources:
                    continue
            elif not any(s["type"] == source_type for s in sources):
                continue

        if q:
            parts = [
                _en(skill.get("nameString")),
                (skill.get("nameString") or {}).get("ja", ""),
                _en(skill.get("descString")),
                str(skill.get("iconNo", "")),
                str(skill_id),
            ] + [s["name"].lower() for s in sources]
            if q not in " ".join(parts).lower():
                continue

        filtered.append((skill_id, skill))

    # Sorting happens on the full filtered set, before pagination
    reverse = order == "desc"
    if sort == "name":
        named = [t for t in filtered if _en(t[1].get("nameString"))]
        unnamed = [t for t in filtered if not _en(t[1].get("nameString"))]
        named.sort(key=lambda t: _en(t[1].get("nameString")).lower(), reverse=reverse)
        filtered[:] = named + unnamed
    elif sort == "trigger":
        filtered.sort(key=lambda t: t[1].get("emitRatio") or 0, reverse=reverse)
    elif sort == "power":
        filtered.sort(key=lambda t: t[1].get("power") or 0, reverse=reverse)
    elif sort == "sources":
        index = get_skill_sources_index()
        filtered.sort(
            key=lambda t: sum(len(index.get(t[0], {}).get(k, {})) for k in ("character", "buddy", "enemy")),
            reverse=reverse,
        )
    else:  # default: skill ID
        filtered.sort(key=lambda t: t[0], reverse=reverse)

    total = len(filtered)

    if page is None:
        # Full raw list (used by modals to resolve skill IDs); no source enrichment
        return types

    start_idx = (page - 1) * limit
    items = []
    for skill_id, skill in filtered[start_idx:start_idx + limit]:
        enriched = dict(skill)
        enriched["ID"] = skill_id
        enriched["sources"] = _ordered_sources(skill_id)
        items.append(enriched)

    return {
        "items": items,
        "total": total,
        "page": page,
        "has_more": (page * limit) < total
    }
