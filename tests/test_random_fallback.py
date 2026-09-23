import unittest
from backend.stage_translations import strip_title_variants
from backend.routers.stages import _derive_fallback_random

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


if __name__ == "__main__":
    unittest.main()
