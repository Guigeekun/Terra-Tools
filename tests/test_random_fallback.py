import unittest
from unittest.mock import patch
from backend.stage_translations import strip_title_variants, METAL_ZONE_ENEMY_VARS
from backend.routers.stages import (
    _derive_fallback_random,
    _chapter_layout,
    build_family_pool,
    build_metal_zone_pools,
)

ENEMIES = {7: {"ID": 7, "NameString": {"en": "Orbling"}, "LV": 3},
           99: {"ID": 99, "NameString": {"en": "Garuda"}, "LV": 99}}


def make_fixtures():
    chapters = [
        {"chapterNo": 110, "sections": [{"title": "五覇降臨ガルーダ"}]},
        {"chapterNo": 115, "sections": [{"title": "五覇降臨ガルーダ（ハード）"}]},
        {"chapterNo": 116, "sections": [{"title": "まったく別のタイトル"}]},
    ]
    layout_db = {
        "110": {"1": [{"type": "wave", "enemies": [
            {"enemy_id": 7, "enemy_var": "CH110_ORB"},
            {"enemy_id": 99, "enemy_var": "CH110_GARUDA"},
        ]}]},
    }
    return chapters, layout_db


class TestStripTitleVariants(unittest.TestCase):
    def test_strips_hard_suffix(self):
        self.assertEqual(strip_title_variants("五覇降臨ガルーダ（ハード）"), "五覇降臨ガルーダ")

    def test_strips_halfwidth_hard_suffix(self):
        self.assertEqual(strip_title_variants("Stage(Hard) (ハード)".replace(" (ハード)", "(ハード)")), "Stage(Hard)")

    def test_plain_title_unchanged(self):
        self.assertEqual(strip_title_variants("五覇降臨ガルーダ"), "五覇降臨ガルーダ")

    def test_empty_safe(self):
        self.assertEqual(strip_title_variants(""), "")
        self.assertEqual(strip_title_variants(None), "")


class TestDeriveFallbackRandom(unittest.TestCase):
    def setUp(self):
        self.chapters, self.layout_db = make_fixtures()

    def test_hard_variant_uses_normal_version_pool(self):
        reason, pool = _derive_fallback_random("五覇降臨ガルーダ（ハード）", self.chapters, self.layout_db, ENEMIES)
        self.assertEqual(reason, "Hard mode – enemy placement is randomized each run; the pool mirrors the normal version.")
        self.assertEqual([e["enemy_id"] for e in pool], [7, 99])

    def test_exact_title_match(self):
        reason, pool = _derive_fallback_random("五覇降臨ガルーダ", self.chapters, self.layout_db, ENEMIES)
        self.assertEqual(reason, "Enemy placement is randomized each run; the pool mirrors the fixed-layout version of this stage.")
        self.assertEqual(len(pool), 2)

    def test_no_match_gets_generic_reason_and_empty_pool(self):
        reason, pool = _derive_fallback_random("まったく別のタイトル", self.chapters, self.layout_db, ENEMIES)
        self.assertEqual(reason, "Enemy placement data isn't present in the game data – the game assigns spawns at run time.")
        self.assertEqual(pool, [])


class TestMetalZonePools(unittest.TestCase):
    def setUp(self):
        self.pools = build_metal_zone_pools({})

    def test_regular_pool_excludes_kings(self):
        self.assertEqual(len(self.pools["regular"]), len(METAL_ZONE_ENEMY_VARS) - 7)
        self.assertFalse(any("_KING" in e["enemy_var"] for e in self.pools["regular"]))

    def test_king_pool_is_full_family(self):
        self.assertEqual(len(self.pools["king"]), len(METAL_ZONE_ENEMY_VARS))
        kings = [e for e in self.pools["king"] if "_KING" in e["enemy_var"]]
        self.assertEqual(len(kings), 7)

    def test_pool_keeps_enum_symbol_as_enemy_var(self):
        by_id = {eid: evar for eid, evar in METAL_ZONE_ENEMY_VARS}
        sample = next(e for e in self.pools["regular"] if e["enemy_id"] == 407)
        self.assertEqual(sample["enemy_var"], by_id[407])


class TestChapterLayoutFiltering(unittest.TestCase):
    @staticmethod
    def layout(enemies):
        return {"1": [{"type": "wave", "enemies": enemies}]}

    def test_tutorial_chapter_keeps_ch1_spawns(self):
        layout = self.layout([{"enemy_id": 1, "enemy_var": "CH1_BAKUROU"}])
        filtered, placeholder = _chapter_layout(1, layout)
        self.assertFalse(placeholder)
        self.assertEqual(len(filtered["1"][0]["enemies"]), 1)

    def test_fully_placeholder_layout_is_discarded(self):
        layout = self.layout([{"enemy_id": 1, "enemy_var": "CH1_BAKUROU"}])
        filtered, placeholder = _chapter_layout(1001, layout)
        self.assertTrue(placeholder)
        self.assertEqual(filtered, {})

    def test_majority_placeholder_layout_is_discarded(self):
        layout = self.layout([
            {"enemy_id": 1, "enemy_var": "CH1_BAKUROU"},
            {"enemy_id": 1, "enemy_var": "CH1_WARRIOR"},
            {"enemy_id": 1, "enemy_var": "CH1_ARCHER"},
            {"enemy_id": 99, "enemy_var": "MONEY_S"},
        ])
        filtered, placeholder = _chapter_layout(3003, layout)
        self.assertTrue(placeholder)
        self.assertEqual(filtered, {})

    def test_minority_placeholder_spawns_are_stripped(self):
        layout = self.layout([
            {"enemy_id": 1, "enemy_var": "CH1_BAKUROU"},
            {"enemy_id": 99, "enemy_var": "MONEY_S"},
            {"enemy_id": 99, "enemy_var": "MONEY_B"},
            {"enemy_id": 99, "enemy_var": "MONEY_BOSS"},
        ])
        filtered, placeholder = _chapter_layout(3001, layout)
        self.assertFalse(placeholder)
        remaining = filtered["1"][0]["enemies"]
        self.assertEqual([e["enemy_var"] for e in remaining], ["MONEY_S", "MONEY_B", "MONEY_BOSS"])


class TestFamilyPool(unittest.TestCase):
    def test_builds_pool_from_enum_prefix(self):
        symbols = {483: "MONEY_S", 484: "MONEY_SP", 1: "CH1_BAKUROU", 999: "MONEY_GHOST"}
        with patch("backend.routers.stages.ENEMY_ENUM_SYMBOLS", symbols):
            pool = build_family_pool("MONEY_", {483: {"ID": 483}, 999: {"ID": 999}})
        self.assertEqual([e["enemy_id"] for e in pool], [483, 999])
        self.assertEqual(pool[0]["enemy_var"], "MONEY_S")

    def test_missing_enemy_records_are_skipped(self):
        symbols = {483: "MONEY_S", 484: "MONEY_SP"}
        with patch("backend.routers.stages.ENEMY_ENUM_SYMBOLS", symbols):
            pool = build_family_pool("MONEY_", {483: {"ID": 483}})
        self.assertEqual([e["enemy_id"] for e in pool], [483])


if __name__ == "__main__":
    unittest.main()
