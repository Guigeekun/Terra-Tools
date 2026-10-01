import os
import pathlib
import struct
import tempfile
import unittest
import wave

from starlette.responses import FileResponse

from backend.routers import audio as audio_router
from backend.routers import system as system_router
from scripts.transcode_audio_to_mp3 import (
    parse_wav_pcm,
    transcode_directory,
    wav_bytes_to_mp3,
)


def _pcm_wav_bytes(seconds: float = 0.05, channels: int = 2, rate: int = 44100) -> bytes:
    """Synthesize a real 16-bit PCM WAV (sine-ish samples) for encoder tests."""
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        n = int(seconds * rate)
        for i in range(n):
            value = int(8000 * ((i % 100) / 100 - 0.5))
            frames += struct.pack("<" + "h" * channels, *([value] * channels))
        w.writeframes(bytes(frames))
    return buf.getvalue()


class TestWavParsing(unittest.TestCase):
    def test_parses_pcm16(self):
        pcm, channels, rate = parse_wav_pcm(_pcm_wav_bytes())
        self.assertEqual(channels, 2)
        self.assertEqual(rate, 44100)
        self.assertEqual(len(pcm) % 4, 0)

    def test_rejects_non_pcm_format(self):
        raw = _pcm_wav_bytes()
        # IEEE float is format tag 3; flip it in the fmt chunk.
        idx = raw.index(b"fmt ")
        mutated = bytearray(raw)
        struct.pack_into("<H", mutated, idx + 8, 3)
        with self.assertRaises(ValueError):
            parse_wav_pcm(bytes(mutated))

    def test_rejects_garbage(self):
        with self.assertRaises(ValueError):
            parse_wav_pcm(b"not a wav at all")


class TestMp3Encoding(unittest.TestCase):
    def test_encodes_to_mpeg_sync(self):
        mp3 = wav_bytes_to_mp3(_pcm_wav_bytes(), bitrate_kbps=128)
        self.assertGreater(len(mp3), 100)
        self.assertEqual(mp3[0], 0xFF)  # MPEG frame sync
        self.assertLess(len(mp3), len(_pcm_wav_bytes()))  # actually compressed


class TestTranscodeDirectory(unittest.TestCase):
    def test_converts_removes_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, "track.wav")
            with open(wav_path, "wb") as f:
                f.write(_pcm_wav_bytes())

            converted, kept, _, _ = transcode_directory(pathlib.Path(tmp), 128)
            self.assertEqual((converted, kept), (1, 0))
            self.assertFalse(os.path.exists(wav_path))
            mp3_path = wav_path[:-4] + ".mp3"
            self.assertTrue(os.path.exists(mp3_path))

            # A re-run over an already-converted dir is a no-op: no WAVs left.
            converted2, kept2, _, _ = transcode_directory(pathlib.Path(tmp), 128)
            self.assertEqual((converted2, kept2), (0, 0))
            self.assertTrue(os.path.exists(mp3_path))

    def test_undecodable_wav_is_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, "broken.wav")
            with open(wav_path, "wb") as f:
                f.write(b"RIFFxxxxWAVEjunk")
            converted, kept, _, _ = transcode_directory(pathlib.Path(tmp), 128)
            self.assertEqual((converted, kept), (0, 1))
            self.assertTrue(os.path.exists(wav_path))
            self.assertFalse(os.path.exists(os.path.join(tmp, "broken.mp3")))


class TestEtag(unittest.TestCase):
    def test_matches_starlette_file_response_formula(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"x" * 1234)
            path = f.name
        try:
            st = os.stat(path)
            # FileResponse computes its ETag in set_stat_headers; render it once.
            resp = FileResponse(path, stat_result=st)
            starlette_etag = resp.headers["etag"]
            self.assertEqual(audio_router._etag_for_stat(st), starlette_etag)
        finally:
            os.unlink(path)


class TestIfNoneMatch(unittest.TestCase):
    def setUp(self):
        self.etag = '"abc123"'

    def test_exact_match(self):
        self.assertTrue(audio_router._if_none_match_hits('"abc123"', self.etag))

    def test_weak_tag_matches(self):
        self.assertTrue(audio_router._if_none_match_hits('W/"abc123"', self.etag))

    def test_tag_list_matches(self):
        self.assertTrue(audio_router._if_none_match_hits('"zzz", "abc123"', self.etag))

    def test_star_matches(self):
        self.assertTrue(audio_router._if_none_match_hits("*", self.etag))

    def test_no_match(self):
        self.assertFalse(audio_router._if_none_match_hits('"other"', self.etag))

    def test_missing_header(self):
        self.assertFalse(audio_router._if_none_match_hits(None, self.etag))


class TestResolveAudioPath(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.bgm = os.path.join(self.tmp.name, "BGM")
        os.makedirs(self.bgm)
        self._orig = audio_router.EXTRACTED_DIR
        audio_router.EXTRACTED_DIR = self.tmp.name

    def tearDown(self):
        audio_router.EXTRACTED_DIR = self._orig

    def _touch(self, name):
        with open(os.path.join(self.bgm, name), "wb") as f:
            f.write(b"x")

    def test_prefers_mp3_when_both_exist(self):
        self._touch("a.mp3")
        self._touch("a.wav")
        path = audio_router._resolve_audio_path("bgm", "a.wav")
        self.assertTrue(path.endswith(".mp3"))

    def test_falls_back_to_wav(self):
        self._touch("a.wav")
        path = audio_router._resolve_audio_path("BGM", "a.mp3")
        self.assertTrue(path.endswith(".wav"))

    def test_missing_track_is_none(self):
        self.assertIsNone(audio_router._resolve_audio_path("BGM", "nope.mp3"))

    def test_bad_category_is_none(self):
        self._touch("a.mp3")
        self.assertIsNone(audio_router._resolve_audio_path("BG", "a.mp3"))

    def test_path_traversal_is_neutralized(self):
        self._touch("a.mp3")
        self.assertIsNone(audio_router._resolve_audio_path("BGM", "../../config.json"))


class TestStatsAudioCount(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self._orig = system_router.EXTRACTED_DIR
        system_router.EXTRACTED_DIR = self.tmp.name

    def tearDown(self):
        system_router.EXTRACTED_DIR = self._orig

    def _touch(self, category, name):
        directory = os.path.join(self.tmp.name, category)
        os.makedirs(directory, exist_ok=True)
        with open(os.path.join(directory, name), "wb") as f:
            f.write(b"x")

    def test_counts_mp3_and_wav_tracks(self):
        self._touch("BGM", "bgm_1.mp3")
        self._touch("BGM", "bgm_2.mp3")
        self._touch("SE", "se_1.wav")
        stats = system_router.get_stats()
        self.assertEqual(stats["bgm_count"], 2)
        self.assertEqual(stats["se_count"], 1)

    def test_stem_in_both_formats_counts_once(self):
        self._touch("BGM", "bgm_1.mp3")
        self._touch("BGM", "bgm_1.wav")
        stats = system_router.get_stats()
        self.assertEqual(stats["bgm_count"], 1)

    def test_missing_directory_counts_zero(self):
        stats = system_router.get_stats()
        self.assertEqual(stats["bgm_count"], 0)
        self.assertEqual(stats["se_count"], 0)

    def test_non_audio_files_ignored(self):
        self._touch("BGM", "notes.txt")
        self._touch("BGM", "bgm_1.mp3")
        stats = system_router.get_stats()
        self.assertEqual(stats["bgm_count"], 1)


if __name__ == "__main__":
    unittest.main()
