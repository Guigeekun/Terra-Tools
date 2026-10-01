import unittest
from unittest.mock import patch

from backend.routers import enemies as enemies_router
from backend.routers import stages as stages_router


def make_gamedata():
    """Two-stage fixture: 'Orbling' has two variants (one droppable), and an
    event boss 'Neo Bnut' whose loot exists only in StageDrops."""
    return {
        "enemies": {"data": [
            {
                "ID": 1, "NameString": {"en": "Orbling", "ja": "バクロウ"}, "LV": 3,
                "HP": 101, "ATK": 21, "DEF": 4, "SATK": 12, "SDEF": 15,
                "Species": 6, "Attrib": 1, "FrameType": 0, "ImageID": 929,
                "SkillSlot": [67], "items": [{"code": 0}, {"code": 2 * 256 + 30}, {"code": 0}, {"code": 0}],
                "avoidSleep": 1.0, "avoidPoison": 0.5,
            },
            {
                "ID": 7, "NameString": {"en": "Orbling", "ja": "バクロウ"}, "LV": 65,
                "HP": 5000, "ATK": 300, "DEF": 40, "SATK": 120, "SDEF": 150,
                "Species": 6, "Attrib": 1, "FrameType": 2, "ImageID": 929,
                "SkillSlot": [67, 999999], "items": [{"code": 0}, {"code": 0}, {"code": 0}, {"code": 0}],
                "DropJobID": 5, "DropRatio": 20.0,
            },
            {
                "ID": 527, "NameString": {"en": "Neo Bnut"}, "LV": 99,
                "HP": 90000, "ATK": 999, "DEF": 99, "SATK": 999, "SDEF": 999,
                "Species": 7, "Attrib": 4, "FrameType": 1, "ImageID": 42,
                "SkillSlot": [], "items": [{"code": 0}, {"code": 0}, {"code": 0}, {"code": 0}],
            },
            {
                "ID": 600, "NameString": {"en": "Phantom Buddy Dropper"}, "LV": 50,
                "HP": 100, "Species": 14, "Attrib": 0, "FrameType": 0, "ImageID": 1,
                "SkillSlot": [], "items": [{"code": 0}, {"code": 0}, {"code": 0}, {"code": 0}],
                "DropBuddyID": 9, "DropBuddyRatio": 5.0,
            },
        ]},
        "items": {"itemSet": [
            {"NameString": {"en": "Pelt of Orbling"}},   # item 1
            {"NameString": {"en": "Tears"}},             # item 2
        ]},
        "characters": {
            "data": [{"ID": 5, "chrID": 80, "NameString": {"en": "Sabertooth Job"}}],
            "infos": [{"ID": 80, "NameString": {"en": "Sabertooth"}, "rarity": 2}],
        },
        "buddies": {"data": [{"ID": 9, "NameString": {"en": "Companion Nine"}, "ImageID": 77}]},
        "stages": {"chapters": [
            {"chapterNo": 1, "sections": [{"title": "Title 1", "battleCnt": 1}, {"title": "Title 2", "battleCnt": 0}]},
            {"chapterNo": 2, "sections": [{"title": "Title 1", "battleCnt": 1}, {"title": "Random title", "battleCnt": 1}]},
        ]},
        "stages_layout": {
            "1": {"1": [{"type": "wave", "enemies": [
                {"enemy_id": 1, "enemy_var": "CH1_ORB"}, {"enemy_id": 1, "enemy_var": "CH1_ORB"},
            ]}]},
            # Chapter 2 has no layout: its sections synthesize waves, and
            # section 1 shares its title with a fixed chapter-1 section, so the
            # fallback pool must mirror that section's enemies.
        },
        "stage_drops": {"2000": {"2": [
            {"enemy_id": 527, "item_id": 1, "ratio": 10},
            {"enemy_id": 527, "item_id": 2, "ratio": 5},
        ]}},
    }


def reset_caches():
    enemies_router._GROUPS = None
    enemies_router._GROUP_BY_ID = {}
    enemies_router._SPAWN_INDEX = None
    enemies_router._POSSIBLE_INDEX = None
    enemies_router._STAGE_DROP_INDEX = None
    enemies_router._SECTION_TITLES.clear()
    # The stages module memoizes the section-title pool index from gamedata:
    # fixture data must not leak into the other test files (and vice versa).
    stages_router._TITLE_POOL_INDEX = None


class TestBestiaryGroups(unittest.TestCase):
    def setUp(self):
        reset_caches()

    def tearDown(self):
        reset_caches()

    def test_groups_by_name_with_variants(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            groups = enemies_router._enemy_groups()
        self.assertEqual(len(groups), 3)  # Orbling, Neo Bnut, Phantom Buddy Dropper
        orbling = next(g for g in groups if g["name"] == "Orbling")
        self.assertEqual(orbling["first_id"], 1)
        self.assertEqual(orbling["enemy_ids"], [1, 7])
        self.assertEqual(orbling["variant_count"], 2)
        self.assertEqual((orbling["min_lv"], orbling["max_lv"]), (3, 65))
        self.assertTrue(orbling["boss"])  # variant 7 is FrameType 2
        # Game order: by first enemy ID
        self.assertEqual([g["first_id"] for g in groups], [1, 527, 600])

    def test_list_pagination_and_search(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            page = enemies_router.get_enemies(page=1, limit=2)
            self.assertEqual(page["total"], 3)
            self.assertEqual([g["name"] for g in page["items"]], ["Orbling", "Neo Bnut"])
            self.assertTrue(page["has_more"])

            by_search = enemies_router.get_enemies(search="orb")
            self.assertEqual([g["name"] for g in by_search], ["Orbling"])
            by_id = enemies_router.get_enemies(search="527")
            self.assertEqual([g["name"] for g in by_id], ["Neo Bnut"])
            bosses = enemies_router.get_enemies(frame="boss")
            self.assertEqual([g["name"] for g in bosses], ["Orbling", "Neo Bnut"])

    def test_detail_accepts_any_variant_id(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            detail = enemies_router.get_enemy(7)  # second Orbling variant
        self.assertEqual(detail["first_id"], 1)
        self.assertEqual(detail["variant_count"], 2)

    def test_detail_404(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            with self.assertRaises(Exception):
                enemies_router.get_enemy(424242)


class TestBestiaryVariants(unittest.TestCase):
    def setUp(self):
        reset_caches()

    def tearDown(self):
        reset_caches()

    def detail(self):
        return enemies_router.get_enemy(1)

    def test_variant_stats_and_skills(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            detail = self.detail()
        v1 = detail["variants"][0]
        self.assertEqual((v1["LV"], v1["HP"], v1["ATK"]), (3, 101, 21))
        self.assertEqual(v1["skills"], [67])  # unknown skill 999999 dropped
        v7 = detail["variants"][1]
        self.assertEqual((v7["LV"], v7["HP"]), (65, 5000))

    def test_loot_decode(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            loot = self.detail()["variants"][0]["loot"]
        self.assertEqual(len(loot), 1)
        self.assertEqual(loot[0]["item_id"], 2)   # code = 2*256 + 30
        self.assertEqual(loot[0]["rate"], 30)
        self.assertEqual(loot[0]["name"]["en"], "Tears")

    def test_stage_drop_loot_merge(self):
        """Neo Bnut has no EnemyData items: its loot comes from StageDrops."""
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            loot = enemies_router.get_enemy(527)["variants"][0]["loot"]
        self.assertEqual(sorted(r["item_id"] for r in loot), [1, 2])
        self.assertEqual(sorted(r["rate"] for r in loot), [5, 10])

    def test_configured_occurrence_added(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            occs = enemies_router.get_enemy(527)["variants"][0]["occurrences"]
        self.assertEqual([(o["chapter_no"], o["section_index"]) for o in occs], [(2000, 2)])
        self.assertTrue(occs[0]["configured"])
        self.assertIsNone(occs[0]["count"])

    def test_fixed_occurrences_with_counts_and_vars(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            v1 = self.detail()["variants"][0]
        self.assertEqual([(o["chapter_no"], o["section_index"], o["count"]) for o in v1["occurrences"]],
                         [(1, 1, 2)])
        self.assertEqual(v1["enemy_vars"], ["CH1_ORB"])

    def test_fallback_pool_possible_occurrence(self):
        """Chapter 2 section 1 has no layout: its pool mirrors the fixed
        chapter-1 section sharing the same title, so Orbling occurs there."""
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            v1 = self.detail()["variants"][0]
        possible = [(o["chapter_no"], o["section_index"]) for o in v1["possible_occurrences"]]
        self.assertIn((2, 1), possible)

    def test_recruit_and_buddy_drops(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            detail = self.detail()
            recruit = detail["variants"][1]["recruits"]
            self.assertEqual(recruit["character_id"], 80)
            self.assertEqual(recruit["name"]["en"], "Sabertooth")
            self.assertIsNone(detail["variants"][0]["recruits"])

            buddy = enemies_router.get_enemy(600)["variants"][0]["drop_buddy"]
        self.assertEqual(buddy["id"], 9)
        self.assertEqual(buddy["name"]["en"], "Companion Nine")
        self.assertEqual(buddy["rate"], 5.0)

    def test_resistances_only_nonzero(self):
        with patch.object(enemies_router, "gamedata", make_gamedata()):
            res = self.detail()["variants"][0]["resistances"]
        # Sorted by value descending: full immunities first.
        self.assertEqual(res, [{"status": "Sleep", "value": 1.0}, {"status": "Poison", "value": 0.5}])


if __name__ == "__main__":
    unittest.main()
