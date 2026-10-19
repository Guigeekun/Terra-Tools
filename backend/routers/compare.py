from fastapi import APIRouter

from backend.database import gamedata, find_local_asset

router = APIRouter(tags=["compare"])


@router.get('/api/compare/roster')
def get_compare_roster():
    """Compact character + companion roster for the Compare tab pickers.

    The full enriched character/buddy endpoints carry profiles, descriptions
    and per-job skill lists — too heavy to load just to fill two dropdowns.
    This returns only what the pickers and the stat math need; the selected
    sides still fetch /api/characters/{id} for job/skill detail.
    """
    char_db = gamedata.get("characters", {})
    jobs_by_id = {job["ID"]: job for job in char_db.get("data", [])}

    characters = []
    for info in char_db.get("infos", []):
        characters.append({
            "ID": info.get("ID"),
            "name": info.get("NameString", {}),
            "rarity": info.get("rarity"),
            "isLambda": info.get("isLambda", 0),
            "ancestorChrID": info.get("ancestorChrID", 0),
            # Job count and the last job's weapon/element for the picker rows;
            # the last job of a lambda character is its lambda job.
            "jobCount": len([j for j in info.get("Jobs", []) if j in jobs_by_id]),
        })

    buddies = []
    for buddy in gamedata.get("buddies", {}).get("data", []):
        image_id = buddy.get("ImageID", 0)
        buddies.append({
            "ID": buddy.get("ID"),
            "name": buddy.get("NameString", {}),
            "rarity": buddy.get("rarity"),
            "thumb_file": find_local_asset("BuddyThumbs", image_id, "img"),
            "skill": buddy.get("skill", 0),
            "MaxLevel": buddy.get("MaxLevel", 1),
            "RequiredLevel": buddy.get("RequiredLevel", 1),
            "exclusiveChrID": buddy.get("exclusiveChrID", 0),
            "exclusiveSpeciesID": buddy.get("exclusiveSpeciesID", 0),
            "evolveID": buddy.get("evolveID", 0),
            "ATKmin": buddy.get("ATKmin", 0), "ATKmax": buddy.get("ATKmax", 0),
            "DEFmin": buddy.get("DEFmin", 0), "DEFmax": buddy.get("DEFmax", 0),
            "SATKmin": buddy.get("SATKmin", 0), "SATKmax": buddy.get("SATKmax", 0),
            "SDEFmin": buddy.get("SDEFmin", 0), "SDEFmax": buddy.get("SDEFmax", 0),
            "BOOSTmin": buddy.get("BOOSTmin", 0), "BOOSTmax": buddy.get("BOOSTmax", 0),
            "Coeff": buddy.get("Coeff", 1.0),
        })

    return {"characters": characters, "buddies": buddies}
