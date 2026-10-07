import unittest

from backend.database import parse_asset_name


class ParseAssetNameTest(unittest.TestCase):
    """Extracted asset stems are '<md5 hex><prefix>_<id>[variant]' — the index
    must recover the numeric ID even when a variant letter follows it
    (buddy_513a/b previously failed int() and were never indexed)."""

    def test_plain_piece(self):
        self.assertEqual(
            parse_asset_name("00136ed76339505450041d732b21c90dimg_745"),
            ("img", 745, ""),
        )

    def test_illust_prefix(self):
        self.assertEqual(
            parse_asset_name("2c45c49094c02c00311b8dba0illust_2124"),
            ("illust", 2124, ""),
        )

    def test_buddy_variant_letters(self):
        self.assertEqual(
            parse_asset_name("6f3e82357862b54d0b7441d88573dad0buddy_513a"),
            ("img", 513, "a"),
        )
        self.assertEqual(
            parse_asset_name("b74bfe49d603d29134e1924e5b4d83debuddy_513b"),
            ("img", 513, "b"),
        )

    def test_thumb(self):
        self.assertEqual(
            parse_asset_name("948cdbf6514d2fc09d47c0b551c32c80bimg_513"),
            ("img", 513, ""),
        )

    def test_no_underscore(self):
        self.assertIsNone(parse_asset_name("justahexhash"))

    def test_non_numeric_id(self):
        self.assertIsNone(parse_asset_name("abcdefimg_xyz"))
        self.assertIsNone(parse_asset_name("abcdefimg_12x34"))


if __name__ == "__main__":
    unittest.main()
