import io
import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))

from scripts.download_user_data import (
    ASSETS,
    ensure_user_data,
    extract_assets,
    find_local_archives,
    is_gdresources_present,
    is_user_data_present,
)


def list_files(root):
    result = []
    for dirpath, _, files in os.walk(root):
        for f in files:
            result.append(os.path.relpath(os.path.join(dirpath, f), root).replace("\\", "/"))
    return sorted(result)


def write_zip(path, entries):
    """entries: dict of arcname -> bytes."""
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)


class TestGdresourcesFetch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_asset_patterns(self):
        gd = ASSETS["gdresources"]["pattern"]
        self.assertIsNotNone(gd.match("gdresources-light.zip"))
        self.assertIsNotNone(gd.match("gdresources.zip"))
        self.assertIsNotNone(gd.match("gdresources-light.zip.001"))
        self.assertIsNone(gd.match("user-data.zip"))
        self.assertIsNone(gd.match("gdresources.txt"))

        ud = ASSETS["user-data"]["pattern"]
        self.assertIsNotNone(ud.match("user-data.zip"))
        self.assertIsNotNone(ud.match("user-data.zip.002"))
        self.assertIsNone(ud.match("gdresources-light.zip"))

    def test_extract_with_top_folder(self):
        target = os.path.join(self.root, "local-input")
        archive = os.path.join(self.root, "gdresources-light.zip")
        write_zip(archive, {
            "gdresources-light/android/BG/bg_1.bin": b"a",
            "gdresources-light/android/SE/se_1.bin": b"b",
        })

        extract_assets([archive], target, asset="gdresources")
        self.assertEqual(list_files(target), [
            "gdresources-light/android/BG/bg_1.bin",
            "gdresources-light/android/SE/se_1.bin",
        ])

    def test_extract_without_top_folder_gets_nested(self):
        target = os.path.join(self.root, "local-input")
        archive = os.path.join(self.root, "gdresources-light.zip.001")
        write_zip(archive, {"android/BG/bg_1.bin": b"a"})

        extract_assets([archive], target, asset="gdresources")
        self.assertEqual(list_files(target), ["gdresources-light/android/BG/bg_1.bin"])

    def test_extract_strips_local_input_prefix(self):
        target = os.path.join(self.root, "local-input")
        archive = os.path.join(self.root, "gdresources-light.zip")
        write_zip(archive, {"local-input/gdresources-light/android/BG/bg_1.bin": b"a"})

        extract_assets([archive], target, asset="gdresources")
        self.assertEqual(list_files(target), ["gdresources-light/android/BG/bg_1.bin"])

    def test_user_data_extraction_unchanged(self):
        target = os.path.join(self.root, "user-data")
        archive = os.path.join(self.root, "user-data.zip")
        write_zip(archive, {
            "user-data/extracted-gamedata/game_data/EnemyData.json": b"{}",
            "other/file.txt": b"x",
        })

        extract_assets([archive], target, asset="user-data")
        self.assertEqual(list_files(target), [
            "extracted-gamedata/game_data/EnemyData.json",
            "other/file.txt",
        ])

    def test_presence_checks(self):
        local_input = os.path.join(self.root, "local-input")
        self.assertFalse(is_gdresources_present(local_input))

        os.makedirs(os.path.join(local_input, "gdresources-light", "android"))
        self.assertFalse(is_gdresources_present(local_input))  # skeleton without categories

        # A category folder (even freshly created) marks the resource usable.
        os.makedirs(os.path.join(local_input, "gdresources-light", "android", "BG"))
        with open(os.path.join(local_input, "gdresources-light", "android", "BG", "b.bin"), "wb") as f:
            f.write(b"b")
        self.assertTrue(is_gdresources_present(local_input))

    def test_user_data_presence_unchanged(self):
        target = os.path.join(self.root, "user-data")
        self.assertFalse(is_user_data_present(target))

        game_data = os.path.join(target, "extracted-gamedata", "game_data")
        os.makedirs(game_data)
        self.assertFalse(is_user_data_present(target))  # empty

        with open(os.path.join(game_data, "data.json"), "w") as f:
            f.write("{}")
        self.assertTrue(is_user_data_present(target))

    def test_find_local_archives_prefers_plain_zip(self):
        target = os.path.join(self.root, "user-data")
        os.makedirs(target)
        write_zip(os.path.join(target, "user-data.zip"), {"a": b"1"})
        write_zip(os.path.join(target, "user-data.zip.001"), {"a": b"1"})

        self.assertEqual(find_local_archives(target, ASSETS["user-data"]["pattern"]),
                         [os.path.join(os.path.abspath(target), "user-data.zip")])

    def test_find_local_archives_multipart_sorted(self):
        target = os.path.join(self.root, "local-input")
        os.makedirs(target)
        write_zip(os.path.join(target, "gdresources-light.zip.002"), {"a": b"1"})
        write_zip(os.path.join(target, "gdresources-light.zip.001"), {"a": b"1"})

        self.assertEqual(find_local_archives(target, ASSETS["gdresources"]["pattern"]), [
            os.path.join(os.path.abspath(target), "gdresources-light.zip.001"),
            os.path.join(os.path.abspath(target), "gdresources-light.zip.002"),
        ])

    def test_ensure_skips_when_present(self):
        local_input = os.path.join(self.root, "local-input")
        os.makedirs(os.path.join(local_input, "gdresources-light", "android", "BG"))
        with open(os.path.join(local_input, "gdresources-light", "android", "BG", "b.bin"), "wb") as f:
            f.write(b"b")

        self.assertTrue(ensure_user_data(target_dir=local_input, asset="gdresources"))


if __name__ == "__main__":
    unittest.main()
