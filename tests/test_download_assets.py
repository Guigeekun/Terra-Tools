import io
import os
import sys
import tempfile
import unittest
import urllib.error
import zipfile
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))

from scripts.download_user_data import (
    ASSETS,
    ensure_user_data,
    extract_assets,
    find_local_archives,
    get_latest_release_via_direct_urls,
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


class FakeResponse(io.BytesIO):
    def __init__(self, data=b"", status=200):
        super().__init__(data)
        self.status = status
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def rate_limited(url, code=403):
    return urllib.error.HTTPError(url, code, "rate limit exceeded", None, None)


def direct_url(repo, name):
    return f"https://github.com/{repo}/releases/latest/download/{name}"


def zip_bytes(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


class TestDirectUrlFallback(unittest.TestCase):
    """The API-less fallback used when api.github.com rate-limits the host."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.repo = "acme/tools"

    def tearDown(self):
        self.tmp.cleanup()

    def fake_urlopen_factory(self, existing, bodies):
        def fake_urlopen(req, timeout=None):
            url = req.full_url
            if "api.github.com" in url:
                raise rate_limited(url)
            name = url.rsplit("/", 1)[1]
            if req.get_method() == "HEAD":
                if name in existing:
                    return FakeResponse(status=200)
                raise urllib.error.HTTPError(url, 404, "Not Found", None, None)
            if name in bodies:
                return FakeResponse(bodies[name])
            raise urllib.error.HTTPError(url, 404, "Not Found", None, None)
        return fake_urlopen

    def test_multipart_fallback_when_api_rate_limited(self):
        archive = zip_bytes({
            "user-data/extracted-gamedata/game_data/EnemyData.json": b"{}",
        })
        split = len(archive) // 2
        existing = {"user-data.zip.001", "user-data.zip.002"}
        bodies = {
            "user-data.zip.001": archive[:split],
            "user-data.zip.002": archive[split:],
        }

        target = os.path.join(self.root, "user-data")
        with mock.patch("scripts.download_user_data.urllib.request.urlopen",
                        self.fake_urlopen_factory(existing, bodies)):
            result = ensure_user_data(repo=self.repo, target_dir=target, asset="user-data")

        self.assertTrue(result)
        self.assertTrue(is_user_data_present(target))
        with open(os.path.join(target, "extracted-gamedata", "game_data", "EnemyData.json")) as f:
            self.assertEqual(f.read(), "{}")

    def test_single_zip_fallback(self):
        archive = zip_bytes({
            "user-data/extracted-gamedata/game_data/SkillData.json": b"[]",
        })
        target = os.path.join(self.root, "user-data")
        with mock.patch("scripts.download_user_data.urllib.request.urlopen",
                        self.fake_urlopen_factory({"user-data.zip"}, {"user-data.zip": archive})):
            result = ensure_user_data(repo=self.repo, target_dir=target, asset="user-data")

        self.assertTrue(result)
        self.assertTrue(is_user_data_present(target))

    def test_fallback_without_matching_assets_fails(self):
        target = os.path.join(self.root, "user-data")
        with mock.patch("scripts.download_user_data.urllib.request.urlopen",
                        self.fake_urlopen_factory(set(), {})):
            result = ensure_user_data(repo=self.repo, target_dir=target, asset="user-data")

        self.assertFalse(result)
        self.assertFalse(is_user_data_present(target))

    def test_direct_probe_skips_missing_parts(self):
        def fake_urlopen(req, timeout=None):
            if "api.github.com" in req.full_url:
                raise rate_limited(req.full_url)
            name = req.full_url.rsplit("/", 1)[1]
            if name == "user-data.zip.001":
                return FakeResponse(status=200)
            raise urllib.error.HTTPError(req.full_url, 404, "Not Found", None, None)

        with mock.patch("scripts.download_user_data.urllib.request.urlopen", fake_urlopen):
            release = get_latest_release_via_direct_urls(self.repo, ["user-data"])

        self.assertEqual([a["name"] for a in release["assets"]], ["user-data.zip.001"])
        self.assertEqual(release["assets"][0]["browser_download_url"],
                         direct_url(self.repo, "user-data.zip.001"))

    def test_gdresources_direct_names(self):
        self.assertEqual(ASSETS["gdresources"]["direct_names"],
                         ["gdresources", "gdresources-light"])
        self.assertEqual(ASSETS["user-data"]["direct_names"], ["user-data"])


if __name__ == "__main__":
    unittest.main()
