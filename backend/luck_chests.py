"""Luck Treasure Chests: resolve the pipeline's chest pools for serving.

LuckChests.json (built by scripts/extract_luck_chests.py) stores each stage's
pools in the client's wire encoding — ``C``+amount for Coins, ``I`` item ID,
``O`` Companion ID, ``M`` character ID. The routers below call into this module
to resolve those codes into names/icons and to answer "which stages' chests
hold item N".
"""

from backend.database import gamedata

#: Serve order for the six chest slots the client rendered.
TIER_ORDER = ("A", "B", "C", "D", "Luck 80", "Luck 100")

#: reTB's ANIMATA_CORE_ITEM_ID: the ``L<count>`` reward code renders the
#: stage's exchange item, which for every chapter carrying L codes (Strikes
#: Back, chapter >= 6) is the Animata Core (reTB's ShowLuck finding).
ANIMATA_CORE_ITEM_ID = 181


def luck_chest_db() -> dict:
    return gamedata.get("luck_chests") or {}


def chest_tiers_meta() -> list[dict]:
    """The six slots with their appearance rules, in serve order."""
    tiers = luck_chest_db().get("tiers") or []
    return sorted(tiers, key=lambda t: (TIER_ORDER.index(t["key"]) if t.get("key") in TIER_ORDER else len(TIER_ORDER), t.get("order", 0)))


def _items_by_id() -> dict[int, dict]:
    return {
        idx + 1: item
        for idx, item in enumerate(gamedata.get("items", {}).get("itemSet", []))
    }


def _buddies_by_id() -> dict[int, dict]:
    return {
        b.get("ID"): b
        for b in gamedata.get("buddies", {}).get("data", [])
        if b.get("ID") is not None
    }


def _characters_by_id() -> dict[int, dict]:
    return {
        c.get("ID"): c
        for c in gamedata.get("characters", {}).get("infos", [])
        if c.get("ID") is not None
    }


def parse_reward(code: str) -> tuple[str, int] | None:
    """('coins'|'item'|'buddy'|'character', value) from one wire code."""
    if not isinstance(code, str) or len(code) < 2:
        return None
    kind = code[0]
    try:
        value = int(code[1:])
    except ValueError:
        return None
    mapping = {"C": "coins", "I": "item", "O": "buddy", "M": "character", "L": "exchange"}
    if kind not in mapping:
        return None
    return mapping[kind], value


def resolve_reward(code: str) -> dict:
    """One chest slot's reward, resolved to names and icon URLs.

    Unresolvable codes (the record has a handful of known gaps) come back as
    ``kind: "unknown"`` with the raw code rather than being dropped silently.
    """
    parsed = parse_reward(code)
    if parsed is None:
        return {"kind": "unknown", "code": code}
    kind, value = parsed

    if kind == "coins":
        return {"kind": "coins", "amount": value}

    if kind == "exchange":
        item = _items_by_id().get(ANIMATA_CORE_ITEM_ID)
        return {
            "kind": "item",
            "item_id": ANIMATA_CORE_ITEM_ID,
            "count": value,
            "name": (item or {}).get("NameString"),
            "icon_url": f"/api/assets/item/item_{ANIMATA_CORE_ITEM_ID:02d}.png",
        }

    if kind == "item":
        item = _items_by_id().get(value)
        return {
            "kind": "item",
            "item_id": value,
            "name": (item or {}).get("NameString"),
            "icon_url": f"/api/assets/item/item_{value:02d}.png",
        }

    if kind == "buddy":
        buddy = _buddies_by_id().get(value)
        return {
            "kind": "buddy",
            "buddy_id": value,
            "name": (buddy or {}).get("NameString"),
        }

    character = _characters_by_id().get(value)
    return {
        "kind": "character",
        "character_id": value,
        "name": (character or {}).get("NameString"),
    }


def resolve_section_chests(chapter_no, section_index) -> list[dict]:
    """A section's chest tiers with every reward resolved, [] when it has none."""
    stages = luck_chest_db().get("stages") or {}
    stage = stages.get(str(chapter_no)) or {}
    entry = stage.get(str(section_index))
    if not entry:
        return []

    tiers_by_key = {t["key"]: t for t in chest_tiers_meta()}
    resolved = []
    for tier_key, codes in entry.get("tiers", {}).items():
        meta = tiers_by_key.get(tier_key, {})
        resolved.append({
            "key": tier_key,
            "order": meta.get("order", len(TIER_ORDER)),
            "guaranteed_at_luck": meta.get("guaranteed_at_luck"),
            "base_chance": meta.get("base_chance"),
            "ceiling": meta.get("ceiling"),
            "threshold_only": meta.get("threshold_only", False),
            "rewards": [resolve_reward(code) for code in codes],
        })
    resolved.sort(key=lambda t: t["order"])
    return resolved


#: Item → [(chapter_no, section_index, tier_key)] index, rebuilt only when the
#: loaded LuckChests database object changes (tests re-point gamedata freely).
_ITEM_CHEST_INDEX: dict | None = None
_ITEM_CHEST_INDEX_SOURCE: object = None


def item_chest_index() -> dict[int, list[tuple[int, int, str]]]:
    """item_id -> chest tiers holding it, ordered by stage then tier."""
    global _ITEM_CHEST_INDEX, _ITEM_CHEST_INDEX_SOURCE
    source = luck_chest_db()
    if _ITEM_CHEST_INDEX is not None and _ITEM_CHEST_INDEX_SOURCE is source:
        return _ITEM_CHEST_INDEX

    index: dict[int, list[tuple[int, int, str]]] = {}
    tiers_by_key = {t["key"]: t for t in chest_tiers_meta()}
    for chapter_str, sections in (source.get("stages") or {}).items():
        try:
            chapter_no = int(chapter_str)
        except ValueError:
            continue
        for section_str, entry in sections.items():
            try:
                section_index = int(section_str)
            except ValueError:
                continue
            for tier_key, codes in entry.get("tiers", {}).items():
                order = tiers_by_key.get(tier_key, {}).get("order", len(TIER_ORDER))
                for code in codes:
                    parsed = parse_reward(code)
                    if parsed and parsed[0] == "item":
                        index.setdefault(parsed[1], []).append(
                            (chapter_no, section_index, tier_key, order)
                        )
                    elif parsed and parsed[0] == "exchange":
                        index.setdefault(ANIMATA_CORE_ITEM_ID, []).append(
                            (chapter_no, section_index, tier_key, order)
                        )

    for entries in index.values():
        entries.sort(key=lambda e: (e[0], e[1], e[3]))

    _ITEM_CHEST_INDEX = index
    _ITEM_CHEST_INDEX_SOURCE = source
    return index


def chest_tier_summaries(item_id: int, chapter_no: int, section_index: int) -> list[dict]:
    """Tier metadata for the chests of one stage that hold ``item_id``.

    A tier can hold the item through several codes (e.g. the two L<count>
    candidates of a Strikes Back A chest) — one summary per tier.
    """
    tiers_by_key = {t["key"]: t for t in chest_tiers_meta()}
    summaries: dict[str, dict] = {}
    for ch, sec, tier_key, order in item_chest_index().get(item_id, []):
        if ch == chapter_no and sec == section_index and tier_key not in summaries:
            meta = tiers_by_key.get(tier_key, {})
            summaries[tier_key] = {
                "key": tier_key,
                "order": order,
                "guaranteed_at_luck": meta.get("guaranteed_at_luck"),
                "base_chance": meta.get("base_chance"),
                "ceiling": meta.get("ceiling"),
                "threshold_only": meta.get("threshold_only", False),
            }
    return sorted(summaries.values(), key=lambda t: t["order"])
