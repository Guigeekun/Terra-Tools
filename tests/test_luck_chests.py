"""Luck Treasure Chests: reTB-source pool assembly (pipeline) and serving (backend)."""

import sys
import unittest
from contextlib import ExitStack, contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend import database
from backend.luck_chests import resolve_reward, resolve_section_chests
from backend.routers import items as items_router
from backend.routers import stages as stages_router
import backend.luck_chests as luck_chests_module

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import extract_luck_chests  # noqa: E402


def make_luck_chests_db():
    """The served document shape, with reTB-flavoured stages as fixture."""
    return {
        "schema": "luck-chests-1",
        "tiers": [
            {"key": "A", "order": 1, "base_chance": 20.0, "guaranteed_at_luck": 40.0, "ceiling": 1.0, "threshold_only": False},
            {"key": "B", "order": 2, "base_chance": 10.0, "guaranteed_at_luck": 85.0, "ceiling": 1.0, "threshold_only": False},
            {"key": "C", "order": 3, "base_chance": 5.0, "guaranteed_at_luck": 100.0, "ceiling": 0.5, "threshold_only": False},
            {"key": "D", "order": 4, "base_chance": 2.5, "guaranteed_at_luck": 100.0, "ceiling": 0.25, "threshold_only": False},
            {"key": "Luck 80", "order": 5, "base_chance": None, "guaranteed_at_luck": 80.0, "ceiling": 1.0, "threshold_only": True},
            {"key": "Luck 100", "order": 6, "base_chance": None, "guaranteed_at_luck": 100.0, "ceiling": 1.0, "threshold_only": True},
        ],
        "no_chest_chapters": [3000],
        "stages": {
            # Bahamut Recoded: reTB's table (boss Λ in D).
            "2000": {
                "4": {"tiers": {
                    "A": ('C1500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
                    "B": ('C1500', 'I12',),
                    "C": ('I48', 'M632',),
                    "D": ('I134', 'M632', 'I50', 'I112', 'I81',),
                    "Luck 80": ('I134', 'M632', 'O311',),
                    "Luck 100": ('I134', 'M632', 'O275', 'O311',),
                }},
            },
            # Strikes Back tier II: L<count> = Animata Core x count.
            "8000": {
                "2": {"tiers": {
                    "A": ('L50', 'L130',),
                    "Luck 100": ('M853', 'O317', 'O128',),
                }},
            },
        },
    }


def make_gamedata():
    items = [{"NameString": {"en": f"Item {n}"}} for n in range(1, 200)]
    items[134 - 1] = {"NameString": {"en": "Bahamut's Fang"}}
    items[50 - 1] = {"NameString": {"en": "Metal Ticket"}}
    items[181 - 1] = {"NameString": {"en": "Animata Core"}}
    return {
        "items": {"itemSet": items},
        "characters": {"infos": [
            {"ID": 148, "NameString": {"en": "Bahamut"}},
            {"ID": 632, "NameString": {"en": "Bahamut Λ"}},
        ]},
        "buddies": {"data": [
            {"ID": 275, "NameString": {"en": "Bahamut Ο"}},
            {"ID": 311, "NameString": {"en": "Bahamut ΟⅡ"}},
        ]},
        "stages": {"chapters": [
            {"chapterNo": 2000, "sections": [
                {"title": "バハムート降臨", "battleCnt": 5},
                {"title": "バハムート進化", "battleCnt": 5},
                {"title": "バハムート超進化", "battleCnt": 5},
                {"title": "バハムート再構築", "battleCnt": 5},
            ]},
            {"chapterNo": 8000, "sections": [
                {"title": "Spinetrich Kino I", "battleCnt": 2},
                {"title": "Spinetrich Kino II", "battleCnt": 2},
            ]},
            {"chapterNo": 3000, "sections": [{"title": "Metal Zone", "battleCnt": 3}]},
        ]},
        "stages_layout": {},
        "luck_chests": make_luck_chests_db(),
    }


# Every module that holds its own `from backend.database import gamedata`
# reference: patch all of them or the fixture only reaches some.
GAMEDATA_USERS = (database, luck_chests_module, items_router, stages_router)


def reset_caches():
    stages_router._TITLE_POOL_INDEX = None
    luck_chests_module._ITEM_CHEST_INDEX = None
    luck_chests_module._ITEM_CHEST_INDEX_SOURCE = None


@contextmanager
def patched_gamedata(fixture=None):
    reset_caches()
    with ExitStack() as stack:
        fixture = fixture or make_gamedata()
        for module in GAMEDATA_USERS:
            stack.enter_context(patch.object(module, "gamedata", fixture))
        yield fixture
    reset_caches()


class TestResolveReward(unittest.TestCase):
    def test_each_wire_kind(self):
        with patched_gamedata():
            self.assertEqual(resolve_reward("C50"), {"kind": "coins", "amount": 50})
            item = resolve_reward("I134")
            self.assertEqual(item["kind"], "item")
            self.assertEqual(item["item_id"], 134)
            self.assertEqual(item["name"], {"en": "Bahamut's Fang"})
            self.assertEqual(item["icon_url"], "/api/assets/item/item_134.png")
            buddy = resolve_reward("O311")
            self.assertEqual(buddy, {
                "kind": "buddy", "buddy_id": 311, "name": {"en": "Bahamut ΟⅡ"},
            })
            character = resolve_reward("M632")
            self.assertEqual(character, {
                "kind": "character", "character_id": 632, "name": {"en": "Bahamut Λ"},
            })

    def test_exchange_code_is_the_animata_core_x_count(self):
        with patched_gamedata():
            exchange = resolve_reward("L130")
        self.assertEqual(exchange["kind"], "item")
        self.assertEqual(exchange["item_id"], 181)
        self.assertEqual(exchange["count"], 130)
        self.assertEqual(exchange["name"], {"en": "Animata Core"})

    def test_unresolvable_codes_survive(self):
        with patched_gamedata():
            self.assertEqual(resolve_reward("X9"), {"kind": "unknown", "code": "X9"})
            absent = resolve_reward("I999")
            self.assertEqual(absent["kind"], "item")
            self.assertIsNone(absent["name"])  # absent item keeps its slot


class TestSectionChests(unittest.TestCase):
    def setUp(self):
        reset_caches()

    def test_tiers_resolve_in_order_with_odds_metadata(self):
        with patched_gamedata():
            chests = resolve_section_chests(2000, 4)
        self.assertEqual([t["key"] for t in chests],
                         ["A", "B", "C", "D", "Luck 80", "Luck 100"])
        luck100 = chests[-1]
        self.assertEqual(luck100["guaranteed_at_luck"], 100.0)
        self.assertEqual(luck100["threshold_only"], True)
        self.assertEqual(luck100["rewards"], [
            {"kind": "item", "item_id": 134, "name": {"en": "Bahamut's Fang"},
             "icon_url": "/api/assets/item/item_134.png"},
            {"kind": "character", "character_id": 632, "name": {"en": "Bahamut Λ"}},
            {"kind": "buddy", "buddy_id": 275, "name": {"en": "Bahamut Ο"}},
            {"kind": "buddy", "buddy_id": 311, "name": {"en": "Bahamut ΟⅡ"}},
        ])
        tier_a = chests[0]
        self.assertEqual(tier_a["base_chance"], 20.0)
        self.assertEqual(tier_a["guaranteed_at_luck"], 40.0)

    def test_stage_without_pool_has_none(self):
        with patched_gamedata():
            self.assertEqual(resolve_section_chests(3000, 1), [])
            self.assertEqual(resolve_section_chests(2000, 1), [])


class TestStageChapterEnrichment(unittest.TestCase):
    def setUp(self):
        reset_caches()

    def test_sections_carry_their_chests(self):
        with patched_gamedata():
            chapter = stages_router.get_stage_chapter(2000)
        by_index = {s["section_index"]: s for s in chapter["sections"]}
        self.assertIn("luck_chests", by_index[4])
        self.assertNotIn("luck_chests", by_index[1])
        tiers = {t["key"] for t in by_index[4]["luck_chests"]}
        self.assertEqual(tiers, {"A", "B", "C", "D", "Luck 80", "Luck 100"})

    def test_chestless_chapter_sections_carry_nothing(self):
        with patched_gamedata():
            chapter = stages_router.get_stage_chapter(3000)
        self.assertNotIn("luck_chests", chapter["sections"][0])


class TestItemChestSources(unittest.TestCase):
    def setUp(self):
        reset_caches()

    def test_chest_only_item_gets_a_stage_source(self):
        with patched_gamedata():
            details = items_router.get_item_details(134)  # Bahamut's Fang: no enemy drops it
        stage_sources = [(s["chapter_no"], s["section_index"]) for s in details["dropped_in_stages"]]
        self.assertEqual(stage_sources, [(2000, 4)])
        entry = details["dropped_in_stages"][0]
        self.assertEqual(entry["spawning_enemies"], [])
        self.assertEqual([t["key"] for t in entry["luck_chests"]], ["D", "Luck 80", "Luck 100"])
        self.assertEqual(entry["luck_chests"][0]["base_chance"], 2.5)

    def test_exchange_item_is_indexed_through_l_codes(self):
        with patched_gamedata():
            details = items_router.get_item_details(181)  # Animata Core via Strikes Back A chest
        stage_sources = [(s["chapter_no"], s["section_index"]) for s in details["dropped_in_stages"]]
        self.assertEqual(stage_sources, [(8000, 2)])
        tiers = [t["key"] for t in details["dropped_in_stages"][0]["luck_chests"]]
        self.assertEqual(tiers, ["A"])

    def test_item_absent_from_chests_has_no_luck_chests(self):
        with patched_gamedata():
            details = items_router.get_item_details(150)
        for entry in details["dropped_in_stages"]:
            self.assertNotIn("luck_chests", entry)


def make_consts():
    """A stub of reTB's quest_consts with the shape the extractor reads."""
    return SimpleNamespace(
        LTC_SPECIAL_TIERS={
            # Bahamut Recoded, keyed 0-based with reTB's raw tier names; the
            # table omits "C" -> that chest is empty on the stage.
            "2000-3": {
                "A": ['C1500', 'I12'],
                "D": ['I134', 'M632', 'I50'],
                "Luck80": ['I134', 'M632', 'O311'],
                "Luck100": ['I134', 'M632', 'O275', 'O311'],
            },
        },
        DEFAULT_POOL=extract_luck_chests.LtcStagePool(items=[2, 4], coins=500),
        LTC_EXCLUDED_CHAPTERS={700, 1000, 1001, 1200},
        WIN_POOLS=(
            ("items",), ("items",),
            ("items", "companions", "monsters"),
            ("companions", "monsters", "items"),
            ("companions", "monsters", "items"),
            ("companions", "monsters", "items"),
        ),
        CODE_PREFIX={"items": "I", "companions": "O", "monsters": "M"},
        TIER_NAMES=("A", "B", "C", "D", "Luck80", "Luck100"),
        CHEST_CURVE=((20.0, 40, 100.0), (10.0, 85, 100.0), (5.0, 100, 50.0), (2.5, 100, 25.0)),
    )


class TestPipelineAssembly(unittest.TestCase):
    def test_build_document_converts_retb_sources(self):
        consts = make_consts()
        pools = {
            # 0-based key -> section 3; category pool with a D/Luck80-gated premium.
            "2000-2": {"items": [9, 10], "companions": [8], "monsters": [],
                       "coins": 500, "restricted": {"50": [3, 4]}},
            # Overridden by the special table for the same stage.
            "2000-3": {"items": [1]},
            # Section 5 does not exist in BattleData -> dropped loudly.
            "2000-4": {"items": [1]},
        }
        battle = {"chapters": [
            {"chapterNo": 2000, "sections": [1, 2, 3, 4]},
            {"chapterNo": 5000, "sections": [1, 2]},   # no pool -> DEFAULT_POOL
            {"chapterNo": 7000, "sections": [1]},      # 700 remaps to 7000 -> excluded
            {"chapterNo": 1001, "sections": [1]},      # explicitly excluded
        ]}
        excluded = extract_luck_chests.mapped_exclusions(consts.LTC_EXCLUDED_CHAPTERS)
        document = extract_luck_chests.build_document(
            pools, consts, battle, consts.DEFAULT_POOL, excluded)

        self.assertEqual(sorted(document["stages"]), ["2000", "5000"])
        self.assertNotIn("7000", document["stages"])
        self.assertNotIn("1001", document["stages"])
        # 0-based -> 1-based; specials override pools.
        s3 = document["stages"]["2000"]["3"]["tiers"]
        self.assertEqual(s3["A"], ['I9', 'I10'])
        self.assertEqual(s3["C"], ['I9', 'I10', 'O8'])  # WIN_POOLS C: items+companions+monsters
        # D/Luck tiers include the items category too, plus the restricted
        # item 50 gated to tiers D + Luck80.
        self.assertEqual(s3["D"], ['O8', 'I9', 'I10', 'I50'])
        self.assertEqual(s3["Luck 80"], ['O8', 'I9', 'I10', 'I50'])
        self.assertEqual(s3["Luck 100"], ['O8', 'I9', 'I10'])  # no restricted gate at tier 5
        # Special table: exact lists, omitted tier = empty chest, raw names normalized.
        s4 = document["stages"]["2000"]["4"]["tiers"]
        self.assertEqual(s4["A"], ['C1500', 'I12'])
        self.assertEqual(s4["C"], [])
        self.assertEqual(s4["Luck 80"], ['I134', 'M632', 'O311'])
        self.assertEqual(s4["Luck 100"], ['I134', 'M632', 'O275', 'O311'])
        # DEFAULT_POOL fallback fills pool-less stages.
        self.assertEqual(document["stages"]["5000"]["2"]["tiers"]["A"], ['I2', 'I4'])
        # Tier metadata keeps reTB's 0-100 Luck anchors (regression: no /10).
        tier_a = next(t for t in document["tiers"] if t["key"] == "A")
        self.assertEqual(tier_a["guaranteed_at_luck"], 40.0)
        self.assertEqual(tier_a["base_chance"], 20.0)
        # no_chest_chapters trimmed to chapters BattleData actually has.
        self.assertEqual(document["no_chest_chapters"], [1001, 7000])

    def test_mapped_exclusions_remap_retb_chapter_ids(self):
        excluded = extract_luck_chests.mapped_exclusions({700, 701, 1000, 1200, 3002})
        self.assertIn(7000, excluded)      # Orbling Cavern map points -> 7000
        self.assertNotIn(700, excluded)
        self.assertIn(3002, excluded)
        self.assertIn(2005, extract_luck_chests.RETB_NOT_SERVED_CHAPTERS)


if __name__ == "__main__":
    unittest.main()
