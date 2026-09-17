import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))

from backend.config import (
    LEGACY_LOCAL_INPUT_DIR,
    find_gdresources_dirs,
    find_gdresources_dir,
)

CATEGORIES = ["BG", "BGM", "Banner", "BuddyImages", "BuddyThumbs", "Illust", "Pieces", "SE", "Scenario"]


def make_dir(path):
    os.makedirs(path, exist_ok=True)
    return path


class TestGdresourcesDiscovery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def add_categories(self, base, cats=None):
        for cat in (cats or CATEGORIES):
            make_dir(os.path.join(base, cat))

    def test_no_gdresources_falls_back_to_legacy_path(self):
        make_dir(os.path.join(self.root, "something-else"))
        self.assertEqual(find_gdresources_dir(self.root), LEGACY_LOCAL_INPUT_DIR)
        self.assertEqual(find_gdresources_dirs(self.root), [])

    def test_finds_vanilla_layout(self):
        android = make_dir(os.path.join(self.root, "gdresources", "data_u2017", "android"))
        self.add_categories(android)
        make_dir(os.path.join(self.root, "gdresources", "data_u2017", "Mac"))

        candidates = find_gdresources_dirs(self.root)
        self.assertEqual([os.path.basename(c) for c in candidates], ["gdresources"])
        self.assertEqual(find_gdresources_dir(self.root), android)

    def test_finds_light_layout(self):
        light_base = make_dir(os.path.join(self.root, "gdresources-light"))
        light = make_dir(os.path.join(light_base, "android"))
        self.add_categories(light, ["BG", "BGM", "Pieces", "SE"])

        self.assertEqual(find_gdresources_dirs(self.root), [light_base])
        self.assertEqual(find_gdresources_dir(self.root), light)

    def test_prefers_most_categories_then_android(self):
        android = make_dir(os.path.join(self.root, "gdresources-light", "data_u2017", "android"))
        self.add_categories(android)
        ios = make_dir(os.path.join(self.root, "gdresources-light", "data_u2017", "iOS_2"))
        self.add_categories(ios, ["BG", "BGM"])

        self.assertEqual(find_gdresources_dir(self.root), android)

    def test_prefers_data_u2017_revision_on_tie(self):
        # The full gdresources ships both 'data' and 'data_u2017' CDN
        # revisions; the extraction pipeline reads from data_u2017.
        modern = make_dir(os.path.join(self.root, "gdresources", "data", "android"))
        self.add_categories(modern)
        legacy = make_dir(os.path.join(self.root, "gdresources", "data_u2017", "android"))
        self.add_categories(legacy)

        self.assertEqual(find_gdresources_dir(self.root), legacy)

    def test_prefers_folder_with_more_categories_across_candidates(self):
        full = make_dir(os.path.join(self.root, "gdresources", "data_u2017", "android"))
        self.add_categories(full)
        light = make_dir(os.path.join(self.root, "gdresources-light", "android"))
        self.add_categories(light, ["BG", "BGM"])

        self.assertEqual(find_gdresources_dir(self.root), full)

    def test_categories_directly_at_resource_root(self):
        base = make_dir(os.path.join(self.root, "gdresources-light"))
        self.add_categories(base, ["BG", "SE"])

        self.assertEqual(find_gdresources_dir(self.root), base)

    def test_ignores_empty_category_dirs_and_files(self):
        base = make_dir(os.path.join(self.root, "gdresources-light"))
        self.add_categories(base, ["BG"])
        # An empty directory does not score, and files are never candidates.
        make_dir(os.path.join(self.root, "gdresources-empty"))
        with open(os.path.join(self.root, "gdresources.zip"), "wb") as f:
            f.write(b"zip")

        self.assertEqual(find_gdresources_dirs(self.root), [make_dir(os.path.join(self.root, "gdresources-empty")), base])
        self.assertEqual(find_gdresources_dir(self.root), base)

    def test_missing_root_falls_back_to_legacy_path(self):
        self.assertEqual(find_gdresources_dir(os.path.join(self.root, "nope")), LEGACY_LOCAL_INPUT_DIR)


if __name__ == "__main__":
    unittest.main()
