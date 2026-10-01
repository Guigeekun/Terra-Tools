"""Transcode extracted WAV audio to MP3 to cut audio egress by ~85%.

The game's audio decodes to raw 16-bit PCM WAV (a 2-minute BGM track is
~18 MB); MP3 at 192 kbps brings the same track to ~2.5 MB, which matters
because deployed containers are billed per GB served.

Used by extract_everything.py to encode each clip right after UnityPy
extraction, and runnable standalone to convert already-extracted user-data
in place (the WAV is removed once its MP3 is written):

    py -3 scripts/transcode_audio_to_mp3.py [--user-data-dir user-data]

Requires the `lameenc` package (bundled LAME encoder, no external binary).
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

# LAME only accepts the MPEG-1/2/2.5 sample-rate families; anything else
# fails at encoder setup and the file is kept as WAV.
SUPPORTED_SAMPLE_RATES = (
    8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000,
)


def parse_wav_pcm(wav_bytes: bytes) -> tuple[bytes, int, int]:
    """Return (interleaved PCM data, channels, sample_rate) from WAV bytes.

    Raises ValueError for anything but plain 16-bit PCM, which is what
    UnityPy's AudioClip.samples produces for this game.
    """
    if len(wav_bytes) < 12 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        raise ValueError("not a RIFF/WAVE file")

    fmt = None
    data = None
    pos = 12
    while pos + 8 <= len(wav_bytes):
        chunk_id = wav_bytes[pos:pos + 4]
        chunk_size = struct.unpack("<I", wav_bytes[pos + 4:pos + 8])[0]
        body = wav_bytes[pos + 8:pos + 8 + chunk_size]
        if chunk_id == b"fmt ":
            fmt = body
        elif chunk_id == b"data":
            data = body
        pos += 8 + chunk_size + (chunk_size & 1)

    if fmt is None or data is None:
        raise ValueError("missing fmt or data chunk")
    audio_format, channels, rate = struct.unpack("<HHI", fmt[:8])
    bits = struct.unpack("<H", fmt[14:16])[0]
    if audio_format != 1 or bits != 16:
        raise ValueError(f"unsupported WAV format tag={audio_format} bits={bits}")
    if channels not in (1, 2) or rate not in SUPPORTED_SAMPLE_RATES:
        raise ValueError(f"unsupported channels={channels} rate={rate}")
    return data, channels, rate


def wav_bytes_to_mp3(wav_bytes: bytes, bitrate_kbps: int = 192) -> bytes:
    """Encode PCM WAV bytes to MP3 at the given CBR bitrate."""
    import lameenc

    pcm, channels, rate = parse_wav_pcm(wav_bytes)
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(bitrate_kbps)
    encoder.set_in_sample_rate(rate)
    encoder.set_channels(channels)
    encoder.set_quality(2)  # 2 = high, ~70x realtime
    return bytes(encoder.encode(pcm)) + bytes(encoder.flush())


def transcode_directory(directory: Path, bitrate_kbps: int) -> tuple[int, int, int, int]:
    """Convert every sibling-unique WAV in `directory` to MP3 in place.

    Skips stems that already have an MP3 (idempotent) and keeps the WAV of
    anything LAME cannot encode.  Returns (converted, kept_wav,
    bytes_before, bytes_after).
    """
    converted = kept = 0
    bytes_before = bytes_after = 0
    for wav_path in sorted(directory.glob("*.wav")):
        bytes_before += wav_path.stat().st_size
        mp3_path = wav_path.with_suffix(".mp3")
        if mp3_path.exists():
            # Re-runs must not pile duplicate work on already-converted dirs.
            converted += 1
            bytes_after += mp3_path.stat().st_size
            wav_path.unlink()
            continue
        try:
            mp3_bytes = wav_bytes_to_mp3(wav_path.read_bytes(), bitrate_kbps)
        except ValueError as exc:
            print(f"    keeping WAV {wav_path.name}: {exc}")
            kept += 1
            bytes_after += wav_path.stat().st_size
            continue
        mp3_path.write_bytes(mp3_bytes)
        wav_path.unlink()
        converted += 1
        bytes_after += len(mp3_bytes)
    return converted, kept, bytes_before, bytes_after


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert extracted BGM/SE WAVs to MP3 in place.")
    parser.add_argument("--user-data-dir", default="user-data")
    parser.add_argument("--bgm-bitrate", type=int, default=192)
    parser.add_argument("--se-bitrate", type=int, default=128)
    args = parser.parse_args()

    audio_root = Path(args.user_data_dir) / "extracted-gamedata"
    if not audio_root.exists():
        print(f"No extracted-gamedata under {args.user_data_dir}; nothing to do.")
        return 1

    for category, bitrate in (("BGM", args.bgm_bitrate), ("SE", args.se_bitrate)):
        directory = audio_root / category
        if not directory.exists():
            continue
        print(f"Transcoding {category} -> MP3 @ {bitrate} kbps...")
        converted, kept, before, after = transcode_directory(directory, bitrate)
        print(f"  {converted} converted, {kept} kept as WAV; "
              f"{before / (1024**2):.0f} MB -> {after / (1024**2):.0f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
