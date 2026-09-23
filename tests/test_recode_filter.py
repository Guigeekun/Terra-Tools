import unittest
from backend.routers.characters import _is_active_rebirth


class TestActiveRebirthFilter(unittest.TestCase):
    def test_entry_with_coins_is_active(self):
        self.assertTrue(_is_active_rebirth({"coins": 30000, "items": [], "mons": []}))

    def test_entry_with_materials_is_active(self):
        entry = {"coins": 0, "items": [{"code": 23813}, {"code": 0}], "mons": []}
        self.assertTrue(_is_active_rebirth(entry))

    def test_entry_with_companions_is_active(self):
        entry = {"coins": 0, "items": [{"code": 0}], "mons": [{"chrID": 237, "level": 50}]}
        self.assertTrue(_is_active_rebirth(entry))

    def test_hollow_placeholder_is_skipped(self):
        """Game-data stubs (e.g. Dagus -> Ella Λ) carry no cost in any field."""
        entry = {
            "ID": 50, "srcChrID": 1004, "dstChrID": 973, "coins": 0,
            "items": [{"code": 0}, {"code": 0}, {"code": 0}],
            "mons": [{"chrID": 0, "level": 0}, {"chrID": 0, "level": 0}],
        }
        self.assertFalse(_is_active_rebirth(entry))


if __name__ == "__main__":
    unittest.main()
