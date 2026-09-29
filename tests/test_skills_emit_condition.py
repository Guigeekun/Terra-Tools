import unittest
from backend.routers.skills import _matches_emit_condition, EMIT_CONDITION_SANDWICH


class TestEmitConditionFilter(unittest.TestCase):
    def test_no_filter_matches_everything(self):
        self.assertTrue(_matches_emit_condition({"condition": 0}, ""))
        self.assertTrue(_matches_emit_condition({"condition": 1}, ""))

    def test_sandwich_matches_pincer_only(self):
        """Ragnarok's skill: close range (Sandwich) only."""
        self.assertTrue(_matches_emit_condition({"condition": 1}, "1"))
        self.assertFalse(_matches_emit_condition({"condition": 0}, "1"))

    def test_unrestricted_matches_none_value(self):
        """Grand Ragnarok's skill: no positional restriction (condition 0)."""
        self.assertTrue(_matches_emit_condition({"condition": 0}, "0"))
        self.assertFalse(_matches_emit_condition({"condition": 1}, "0"))

    def test_missing_condition_defaults_to_none(self):
        self.assertTrue(_matches_emit_condition({}, "0"))
        self.assertFalse(_matches_emit_condition({}, "1"))

    def test_sandwich_constant_is_one(self):
        """SkillEmitCondition.Sandwich == 1 in dump.cs."""
        self.assertEqual(EMIT_CONDITION_SANDWICH, 1)


if __name__ == "__main__":
    unittest.main()
