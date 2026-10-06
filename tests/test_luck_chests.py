"""Luck Treasure Chests: pool assembly (pipeline) and serving (backend)."""

import sys
import unittest
from contextlib import ExitStack, contextmanager
from pathlib import Path
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
    """The served document shape, with the Bahamut descent chapter as fixture."""
    return {
        "schema": "luck-chests-1",
        "tiers": [
            {"key": "A", "order": 1, "guaranteed_at_luck": 40.0, "ceiling": 1.0, "threshold_only": False},
            {"key": "B", "order": 2, "guaranteed_at_luck": 85.0, "ceiling": 1.0, "threshold_only": False},
            {"key": "C", "order": 3, "guaranteed_at_luck": 100.0, "ceiling": 0.5, "threshold_only": False},
            {"key": "D", "order": 4, "guaranteed_at_luck": 100.0, "ceiling": 0.25, "threshold_only": False},
            {"key": "Luck 80", "order": 5, "guaranteed_at_luck": 80.0, "ceiling": 1.0, "threshold_only": True},
            {"key": "Luck 100", "order": 6, "guaranteed_at_luck": 100.0, "ceiling": 1.0, "threshold_only": True},
        ],
        "no_chest_chapters": [3000],
        "stages": {
            "2000": {
                "4": {"tiers": {
                    "A": ('C1500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
                    "B": ('C1500', 'I12',),
                    "C": ('I48', 'I49', 'M524', 'M519',),
                    "D": ('I134', 'I50', 'I112', 'I81',),
                    "Luck 80": ('I134', 'M632', 'O311',),
                    "Luck 100": ('I134', 'M632', 'O275', 'O311',),
                }},
            },
            # A donor-only stage (Eidolon Bahamut's served section).
            "4107": {
                "3": {"tiers": {
                    "C": ('C1200', 'I74',),
                    "Luck 100": ('I74', 'O385', 'O386', 'O311',),
                }},
            },
        },
    }


def make_gamedata():
    items = [{"NameString": {"en": f"Item {n}"}} for n in range(1, 200)]
    items[134 - 1] = {"NameString": {"en": "Bahamut's Fang"}}
    items[50 - 1] = {"NameString": {"en": "Metal Ticket"}}
    items[74 - 1] = {"NameString": {"en": "Naegling"}}
    return {
        "items": {"itemSet": items},
        "characters": {"infos": [
            {"ID": 148, "NameString": {"en": "Bahamut"}},
            {"ID": 524, "NameString": {"en": "Suzaku"}},
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
            {"chapterNo": 4107, "sections": [
                {"title": "バハムート（シングル）", "battleCnt": 0},
                {"title": "バハムートⅡ（シングル）", "battleCnt": 0},
                {"title": "バハムートⅢ（シングル）", "battleCnt": 1},
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

    def test_unresolvable_codes_survive(self):
        with patched_gamedata():
            self.assertEqual(resolve_reward("X9"), {"kind": "unknown", "code": "X9"})
            absent = resolve_reward("I999")
            self.assertEqual(absent["kind"], "item")
            self.assertIsNone(absent["name"])  # absent item keeps its slot


class TestSectionChests(unittest.TestCase):
    def setUp(self):
        reset_caches()

    def test_tiers_resolve_in_order(self):
        with patched_gamedata():
            chests = resolve_section_chests(2000, 4)
        self.assertEqual([t["key"] for t in chests],
                         ["A", "B", "C", "D", "Luck 80", "Luck 100"])
        luck100 = chests[-1]
        self.assertEqual(luck100["guaranteed_at_luck"], 100.0)
        self.assertEqual(luck100["rewards"], [
            {"kind": "item", "item_id": 134, "name": {"en": "Bahamut's Fang"},
             "icon_url": "/api/assets/item/item_134.png"},
            {"kind": "character", "character_id": 632, "name": {"en": "Bahamut Λ"}},
            {"kind": "buddy", "buddy_id": 275, "name": {"en": "Bahamut Ο"}},
            {"kind": "buddy", "buddy_id": 311, "name": {"en": "Bahamut ΟⅡ"}},
        ])

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
        self.assertEqual(entry["luck_chests"][0]["guaranteed_at_luck"], 100.0)

    def test_item_in_several_chests_and_stages(self):
        with patched_gamedata():
            details = items_router.get_item_details(74)  # Naegling: Eidolon Bahamut C + Luck 100
        stage_sources = [(s["chapter_no"], s["section_index"]) for s in details["dropped_in_stages"]]
        self.assertEqual(stage_sources, [(4107, 3)])
        tiers = [t["key"] for t in details["dropped_in_stages"][0]["luck_chests"]]
        self.assertEqual(tiers, ["C", "Luck 100"])

    def test_item_absent_from_chests_has_no_luck_chests(self):
        with patched_gamedata():
            details = items_router.get_item_details(150)
        for entry in details["dropped_in_stages"]:
            self.assertNotIn("luck_chests", entry)


class TestPipelineAssembly(unittest.TestCase):
    def test_supplement_overrides_donor_and_invalid_stages_drop(self):
        donor = {
            (2000, 4): {"D": ('I999',)},       # must be overridden by the supplement
            (2001, 1): {"A": ('C250',)},       # donor stage kept as-is
            (9999, 1): {"A": ('C50',)},        # chapter BattleData lacks -> dropped
            (2000, 9): {"A": ('C50',)},        # section beyond the chapter -> dropped
        }
        battle = {"chapters": [
            {"chapterNo": 2000, "sections": [1, 2, 3, 4]},
            {"chapterNo": 2001, "sections": [1, 2, 3, 4]},
        ]}
        document = extract_luck_chests.build_document(donor, frozenset({3000}), battle)

        self.assertEqual(
            document["stages"]["2000"]["4"]["tiers"]["D"],
            ['I134', 'I50', 'I112', 'I81'],
        )
        self.assertEqual(document["stages"]["2001"]["1"]["tiers"]["A"], ['C250'])
        self.assertNotIn("9999", document["stages"])
        self.assertNotIn("9", document["stages"]["2000"])
        self.assertEqual(document["no_chest_chapters"], [3000])
        tier_keys = [t["key"] for t in document["tiers"]]
        self.assertEqual(tier_keys, ["A", "B", "C", "D", "Luck 80", "Luck 100"])

    def test_supplement_tables_are_valid_wire_codes(self):
        from luck_chests_supplement import SUPPLEMENT_CHEST_POOLS
        tier_keys = [t["key"] for t in extract_luck_chests.CHEST_TIERS]
        for stage, tiers in SUPPLEMENT_CHEST_POOLS.items():
            for tier, codes in tiers.items():
                self.assertIn(tier, tier_keys, f"{stage} tier {tier}")
                for code in codes:
                    self.assertRegex(code, r'^[CIOM]\d+$', f"{stage} {tier} code {code}")


if __name__ == "__main__":
    unittest.main()
