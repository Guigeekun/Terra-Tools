"""Extract and decrypt all game data from the Terra Battle APK into human-readable JSON.

Usage:
    py -3 extract_everything.py [--apk PATH] [--output-dir PATH]

Requires:
    - UnityPy >= 1.25.2
    - TypeTreeGeneratorAPI >= 0.0.10
    - capstone (for IL2CPP disassembly)
"""

from __future__ import annotations

import os
import sys

# Fix native DLL loading on Windows: ensure capstone.dll is findable by
# TypeTreeGeneratorAPI before any import triggers the load.
def _fix_dll_paths() -> None:
    try:
        import importlib.util
        for pkg in ("TypeTreeGeneratorAPI", "capstone"):
            spec = importlib.util.find_spec(pkg)
            if spec and spec.submodule_search_locations:
                pkg_dir = str(spec.submodule_search_locations[0])
                if hasattr(os, "add_dll_directory"):
                    os.add_dll_directory(pkg_dir)
                if pkg_dir not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = pkg_dir + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass

_fix_dll_paths()

import argparse
import json
import shutil
import struct
import tempfile
import traceback
import zipfile
from pathlib import Path
from typing import Any

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

# Monkey-patch TypeTreeGenerator to strip '.dll' from assembly names
# because the C# backend loads assembly names without '.dll' but UnityPy
# passes them with '.dll'.
orig_get_nodes_up = TypeTreeGenerator.get_nodes_up
def patched_get_nodes_up(self, assembly: str, fullname: str) -> Any:
    if assembly.lower().endswith(".dll"):
        assembly = assembly[:-4]
    return orig_get_nodes_up(self, assembly, fullname)
TypeTreeGenerator.get_nodes_up = patched_get_nodes_up

orig_get_nodes = TypeTreeGenerator.get_nodes
def patched_get_nodes(self, assembly: str, fullname: str) -> Any:
    if assembly.lower().endswith(".dll"):
        assembly = assembly[:-4]
    return orig_get_nodes(self, assembly, fullname)
TypeTreeGenerator.get_nodes = patched_get_nodes


# Known game data MonoBehaviour objects in resources.assets
KNOWN_OBJECTS: dict[int, str] = {
    12682: "AudioController",
    12684: "BattleData",
    12685: "BookData",
    12688: "ChrDatabase",
    12692: "EffectSet",
    12693: "EnemyData",
    12694: "Entity",
    12695: "ItemSet",
    12700: "SkillData",
    12702: "StringSet",
    13311: "ExchangeData",
    13343: "AchivementSet",
    13474: "BuddyDatabase",
    13515: "MultiplayData",
}

APK_DATA_MEMBER = "assets/bin/Data/data.unity3d"
IL2CPP_MEMBER = "lib/armeabi-v7a/libil2cpp.so"
METADATA_MEMBER = "assets/bin/Data/Managed/Metadata/global-metadata.dat"
INVERSE_TABLE_OFFSET = 0x601CAD


def load_inverse_table(apk_path: Path) -> bytes:
    """Load the string decryption inverse table from global-metadata.dat."""
    with zipfile.ZipFile(apk_path) as archive:
        metadata = archive.read(METADATA_MEMBER)
    table = metadata[INVERSE_TABLE_OFFSET : INVERSE_TABLE_OFFSET + 256]
    if len(table) != 256:
        raise ValueError("Could not read full 256-byte decryption table")
    return table


def decrypt_string(data: list[int], inverse_table: bytes) -> str:
    """Decrypt an EncryptedString byte list into a UTF-8 string."""
    if not data:
        return ""
    vals = [inverse_table[b] for b in data]
    plain_bytes = bytes(reversed(vals))
    return plain_bytes.decode("utf-8", errors="replace")


MAGIC = b"ENCA"

def _calc_index(index: int, size: int) -> int:
    low = index & 0xFF
    if (index >> 8) != ((size - 1) >> 8):
        low ^= 0xFF
    return (index & ~0xFF) | low


def _transform_byte(value: int) -> int:
    return ((value >> 4) | ((value & 0x0F) << 4)) ^ 0xFF


def decrypt_enca(source: bytes, inverse_table: bytes) -> bytes:
    if not source.startswith(MAGIC) or inverse_table is None:
        return source
    size = len(source) - len(MAGIC)
    if size == 0:
        return b""
    plain = bytearray(size)
    for source_index, value in enumerate(source[len(MAGIC):]):
        plain[_calc_index(size - 1 - source_index, size)] = _transform_byte(inverse_table[value])
    return bytes(plain)


def is_encrypted_string(obj: Any) -> bool:
    """Determine if a Python object represents serialized EncryptedString data."""
    if isinstance(obj, dict) and list(obj.keys()) == ["data"]:
        val = obj["data"]
        if isinstance(val, list) and all(isinstance(x, int) and 0 <= x <= 255 for x in val):
            return True
    return False


def sanitize_and_decrypt(obj: Any, inverse_table: bytes) -> Any:
    """Recursively convert UnityPy objects and decrypt EncryptedStrings."""
    if obj is None:
        return None
    if isinstance(obj, (bool,)):
        return obj
    if isinstance(obj, (int, float, str)):
        return obj
    if isinstance(obj, bytes):
        try:
            return obj.decode("utf-8")
        except UnicodeDecodeError:
            return f"<{len(obj)} bytes>"
    if is_encrypted_string(obj):
        return decrypt_string(obj["data"], inverse_table)
    if isinstance(obj, dict):
        return {str(k): sanitize_and_decrypt(v, inverse_table) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_and_decrypt(v, inverse_table) for v in obj]
    if hasattr(obj, "__dict__"):
        result = {}
        for k, v in obj.__dict__.items():
            if k.startswith("_"):
                continue
            result[k] = sanitize_and_decrypt(v, inverse_table)
        return result
    return str(obj)


def get_text_asset_script_bytes(obj: Any) -> bytes:
    """Read the raw script bytes of a TextAsset from its serialized data."""
    raw = obj.get_raw_data()
    # Layout of TextAsset serialized data:
    #   m_Name (string): int32 length, followed by bytes, aligned to 4 bytes
    #   m_Script (string): int32 length, followed by bytes, aligned to 4 bytes
    offset = 0
    name_len = struct.unpack_from("<i", raw, offset)[0]
    offset += 4 + name_len
    offset = (offset + 3) & ~3
    script_len = struct.unpack_from("<i", raw, offset)[0]
    offset += 4
    return raw[offset : offset + script_len]


def extract_text_assets(env: Any, output_dir: Path) -> None:
    """Extract all TextAsset objects (Lua chapter scripts, config files)."""
    text_dir = output_dir / "text_assets"
    text_dir.mkdir(parents=True, exist_ok=True)

    for obj in env.objects:
        if obj.assets_file.name == "resources.assets" and obj.type.name == "TextAsset":
            try:
                data = obj.read()
                name = data.m_Name
                content = get_text_asset_script_bytes(obj)

                # Check if it's binary (Lua bytecode) or text
                is_lua = content[:5] == b"\x1dMOON"
                if is_lua:
                    (text_dir / f"{name}.luac").write_bytes(content)
                    info = {"type": "lua_bytecode", "size": len(content)}
                else:
                    try:
                        text = content.decode("utf-8")
                        (text_dir / f"{name}.txt").write_text(text, encoding="utf-8")
                        info = {"type": "text", "size": len(text)}
                    except UnicodeDecodeError:
                        (text_dir / f"{name}.bin").write_bytes(content)
                        info = {"type": "binary", "size": len(content)}

                print(f"  Extracted TextAsset: {name} ({info['type']}, {info['size']:,} bytes/chars)")
            except Exception as error:
                print(f"  TextAsset {obj.path_id}: ERROR - {error}")


def extract_dlc_text_assets(scenario_dir: Path, output_dir: Path) -> None:
    """Scan DLC .bin files in Scenario directory for any TextAssets (like Chapter8.luac)."""
    if not scenario_dir.exists():
        return
        
    text_dir = output_dir / "text_assets"
    text_dir.mkdir(parents=True, exist_ok=True)
    
    bin_files = list(scenario_dir.glob("*.bin"))
    if not bin_files:
        return
        
    print(f"  Scanning {len(bin_files)} Scenario DLC files for TextAssets...")
    extracted_count = 0
    for bin_path in bin_files:
        try:
            env = UnityPy.load(str(bin_path))
            for obj in env.objects:
                if obj.type.name == "TextAsset":
                    data = obj.read()
                    name = data.m_Name
                    if not (name.startswith("Chapter") or name.startswith("Init_") or "Battle" in name):
                        continue
                    
                    content = get_text_asset_script_bytes(obj)
                    is_lua = content[:5] == b"\x1dMOON"
                    if is_lua:
                        (text_dir / f"{name}.luac").write_bytes(content)
                        extracted_count += 1
                    else:
                        try:
                            text = content.decode("utf-8")
                            (text_dir / f"{name}.txt").write_text(text, encoding="utf-8")
                            extracted_count += 1
                        except UnicodeDecodeError:
                            (text_dir / f"{name}.bin").write_bytes(content)
                            extracted_count += 1
        except Exception:
            pass
            
    if extracted_count > 0:
        print(f"  Extracted {extracted_count} TextAsset(s) from Scenario DLC files.")


def parse_string_set_manually(raw: bytes, inverse_table: bytes) -> dict[str, Any]:
    """Manually parse the StringSet object to bypass TypeTree generator bugs."""
    offset = 32 # Skip MonoBehaviour header

    def parse_encrypted_string(raw, offset):
        size = struct.unpack_from("<i", raw, offset)[0]
        offset += 4
        data = list(raw[offset : offset + size])
        offset += size
        offset = (offset + 3) & ~3
        return {"data": data}, offset

    def parse_string_data(raw, offset):
        en, offset = parse_encrypted_string(raw, offset)
        ja, offset = parse_encrypted_string(raw, offset)
        fr, offset = parse_encrypted_string(raw, offset)
        de, offset = parse_encrypted_string(raw, offset)
        es, offset = parse_encrypted_string(raw, offset)
        zh_tw, offset = parse_encrypted_string(raw, offset)
        bgID = struct.unpack_from("<i", raw, offset)[0]
        bgmID = struct.unpack_from("<i", raw, offset + 4)[0]
        flag = struct.unpack_from("<i", raw, offset + 8)[0]
        offset += 12
        return {
            "en": en, "ja": ja, "fr": fr, "de": de, "es": es, "zh_tw": zh_tw,
            "bgID": bgID, "bgmID": bgmID, "flag": flag
        }, offset

    def parse_string_data_array(raw, offset):
        size = struct.unpack_from("<i", raw, offset)[0]
        offset += 4
        arr = []
        for _ in range(size):
            item, offset = parse_string_data(raw, offset)
            arr.append(item)
        return arr, offset

    def parse_string(raw, offset):
        size = struct.unpack_from("<i", raw, offset)[0]
        offset += 4
        val = raw[offset : offset + size].decode("utf-8", errors="replace")
        offset += size
        offset = (offset + 3) & ~3
        return val, offset

    def parse_string_array(raw, offset):
        size = struct.unpack_from("<i", raw, offset)[0]
        offset += 4
        arr = []
        for _ in range(size):
            val, offset = parse_string(raw, offset)
            arr.append(val)
        return arr, offset

    chapterSet, offset = parse_string_data_array(raw, offset)
    uiSet, offset = parse_string_data_array(raw, offset)
    scenarioSet, offset = parse_string_data_array(raw, offset)
    ngwords, offset = parse_string_array(raw, offset)
    lang, offset = parse_string(raw, offset)

    return {
        "chapterSet": chapterSet,
        "uiSet": uiSet,
        "scenarioSet": scenarioSet,
        "ngwords": ngwords,
        "lang": lang
    }


def extract_monobehaviours(
    env: Any, output_dir: Path, inverse_table: bytes
) -> None:
    """Extract and decrypt MonoBehaviour game data objects."""
    data_dir = output_dir / "game_data"
    data_dir.mkdir(parents=True, exist_ok=True)

    for obj in env.objects:
        if obj.assets_file.name != "resources.assets" or obj.type.name != "MonoBehaviour":
            continue
        if obj.path_id not in KNOWN_OBJECTS:
            continue

        class_name = KNOWN_OBJECTS[obj.path_id]
        print(f"  Parsing and decrypting {class_name} (path_id={obj.path_id}, {obj.byte_size:,} bytes)...")

        try:
            if class_name == "StringSet":
                # Manual parsing bypasses bugs in UnityPy type tree generator for array of strings
                tree = parse_string_set_manually(obj.get_raw_data(), inverse_table)
            else:
                tree = obj.parse_as_dict(check_read=True)

            clean_data = sanitize_and_decrypt(tree, inverse_table)
            output_file = data_dir / f"{class_name}.json"
            output_file.write_text(
                json.dumps(clean_data, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            print(f"    -> Saved to: {output_file.name}")
        except Exception as error:
            print(f"    -> FAILED to parse: {error}")


def run_decompile_and_parse_all(output_dir: Path) -> None:
    """Run the Lua decompiler + stage layout parser for chapters 1-7."""
    scripts_dir = Path(__file__).resolve().parent
    luac_dir = output_dir / "text_assets"
    decomp_dir = output_dir.parent / "decompiled_luac"
    decompiler_exe = scripts_dir / "Decompiler.exe"
    enemy_db_path = output_dir / "game_data" / "EnemyData.json"
    output_layout_path = output_dir / "game_data" / "StagesLayout.json"

    if not decompiler_exe.exists():
        print(f"  Skipped: Decompiler.exe not found at {decompiler_exe}")
        return

    decomp_dir.mkdir(parents=True, exist_ok=True)

    # Decompile all Chapter*.luac files found in the text_assets dir
    import subprocess
    luac_files = list(luac_dir.glob("Chapter*.luac"))
    print(f"  Found {len(luac_files)} .luac chapter files to decompile.")
    for f in luac_files:
        out_path = decomp_dir / f"{f.stem}_decompiled.txt"
        try:
            subprocess.run(
                [str(decompiler_exe), str(f), str(out_path)],
                check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            print(f"    Decompiled: {f.name}")
        except Exception as err:
            print(f"    Failed to decompile {f.name}: {err}")

    # Parse decompiled files using decompile_and_parse_all logic
    import importlib.util, re as _re
    spec = importlib.util.spec_from_file_location(
        "decompile_and_parse_all", scripts_dir / "decompile_and_parse_all.py"
    )
    mod = importlib.util.module_from_spec(spec)
    # Override path constants before executing the module
    mod.__dict__["BASE_DIR"] = output_dir.parent.parent
    spec.loader.exec_module(mod)

    enum_names = mod.get_enemies_enum() if hasattr(mod, "get_enemies_enum") else []
    enum_to_id = mod.build_enum_to_id_map(enum_names) if enum_names else {}

    decompiled_files = list(decomp_dir.glob("Chapter*_decompiled.txt"))
    print(f"  Parsing {len(decompiled_files)} decompiled text files...")

    stages_layout: dict = {}
    if output_layout_path.exists():
        try:
            import json as _json
            with open(output_layout_path, "r", encoding="utf-8") as fh:
                stages_layout = _json.load(fh)
        except Exception:
            stages_layout = {}

    for f in decompiled_files:
        m = _re.search(r"Chapter(\d+)", f.name)
        if m:
            chapter_no = m.group(1)
            layout = mod.parse_decompiled_file(f, enum_to_id)
            if layout:
                stages_layout[chapter_no] = layout
                print(f"    Parsed Chapter {chapter_no}: {len(layout)} sections")

    output_layout_path.parent.mkdir(parents=True, exist_ok=True)
    import json as _json
    with open(output_layout_path, "w", encoding="utf-8") as fh:
        _json.dump(stages_layout, fh, indent=2, ensure_ascii=False)
    print(f"  -> Saved StagesLayout.json to: {output_layout_path}")


def run_extract_native_stages(apk_path: Path, output_dir: Path) -> None:
    """Merge native ARM64 stage layouts (chapters 8-42) into StagesLayout.json.
    Requires dump.cs in user-data/ and llvm-objdump in PATH."""
    import subprocess, json as _json
    scripts_dir = Path(__file__).resolve().parent
    base_dir = Path(__file__).resolve().parent.parent
    dump_cs_path = base_dir / "user-data" / "dump.cs"
    stages_layout_path = output_dir / "game_data" / "StagesLayout.json"

    if not dump_cs_path.exists():
        print(f"  Skipped: dump.cs not found at {dump_cs_path}")
        print("  (Run Il2CppDumper or the full extraction pipeline to generate it.)")
        return

    try:
        subprocess.run(["llvm-objdump", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  Skipped: llvm-objdump not found in PATH.")
        return

    print("  Running extract_native_stages.py (chapters 8–42)...")
    try:
        result = subprocess.run(
            ["python3", str(scripts_dir / "extract_native_stages.py")],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            print(f"    {line}")
        if result.returncode != 0:
            print(f"  Warning: extract_native_stages exited with code {result.returncode}")
            for line in result.stderr.splitlines():
                print(f"    [ERR] {line}")
    except Exception as err:
        print(f"  Failed to run extract_native_stages.py: {err}")


def extract_item_icons(env: Any, output_dir: Path) -> None:
    """Extract and crop item icons from ItemAtlas sprite atlas."""
    atlas_img = None
    for obj in env.objects:
        if obj.type.name == "Texture2D" and obj.path_id == 612:
            try:
                atlas_img = obj.read().image
                print("    Found ItemAtlas Texture2D")
            except Exception as e:
                print(f"    Failed to load ItemAtlas texture: {e}")
            break

    if not atlas_img:
        print("    Skipped item icons: ItemAtlas texture not found")
        return

    ui_atlas_data = None
    for obj in env.objects:
        if obj.path_id == 12739 and obj.assets_file.name == "resources.assets":
            try:
                ui_atlas_data = obj.parse_as_dict(check_read=True)
                print("    Found and parsed UIAtlas metadata for ItemAtlas")
            except Exception as e:
                print(f"    Failed to parse UIAtlas MonoBehaviour: {e}")
            break

    if not ui_atlas_data:
        print("    Skipped item icons: UIAtlas metadata not found")
        return

    mSprites = ui_atlas_data.get("mSprites", [])
    if not mSprites:
        print("    Skipped item icons: No sprites found in UIAtlas metadata")
        return

    dst_dir = output_dir / "item_icons"
    dst_dir.mkdir(parents=True, exist_ok=True)

    print(f"    Cropping {len(mSprites)} sprites to {dst_dir}...")
    cropped_count = 0
    for s in mSprites:
        name = s.get("name")
        x = s.get("x")
        y = s.get("y")
        w = s.get("width")
        h = s.get("height")
        if name and x is not None and y is not None and w and h:
            try:
                # NGUI UIAtlas coordinates start at the top-left corner
                left = x
                top = y
                right = x + w
                bottom = y + h
                
                sprite_img = atlas_img.crop((left, top, right, bottom))
                sprite_img.save(dst_dir / f"{name}.png")
                cropped_count += 1
            except Exception as e:
                print(f"      Failed to crop {name}: {e}")

    print(f"    Successfully extracted {cropped_count} item icons.")


def extract_images_from_dir(category: str, input_dir: Path, output_dir: Path, inverse_table: bytes) -> None:
    cat_in_dir = input_dir / category
    if not cat_in_dir.exists():
        print(f"  Directory not found: {cat_in_dir}")
        return
        
    cat_out_dir = output_dir / category
    cat_out_dir.mkdir(parents=True, exist_ok=True)
    
    bin_files = list(cat_in_dir.glob("*.bin"))
    if not bin_files:
        return
        
    print(f"  Extracting {len(bin_files)} images from {category}...")
    count = 0
    for f in bin_files:
        try:
            file_bytes = f.read_bytes()
            decrypted_bytes = decrypt_enca(file_bytes, inverse_table)
            
            env = UnityPy.load(decrypted_bytes)
            extracted = False
            for obj in env.objects:
                if obj.type.name in ('Texture2D', 'Sprite'):
                    data = obj.read()
                    img = data.image
                    
                    # Save as PNG
                    out_path = cat_out_dir / f"{f.stem}.png"
                    img.save(out_path)
                    extracted = True
                    count += 1
                    break
            if not extracted:
                print(f"    No Texture2D/Sprite found in {f.name}")
        except Exception as e:
            print(f"    Failed to extract image {f.name}: {e}")
            
    print(f"  Successfully extracted {count} images in {category}")


def extract_audio_from_dir(category: str, input_dir: Path, output_dir: Path, inverse_table: bytes) -> None:
    cat_in_dir = input_dir / category
    if not cat_in_dir.exists():
        print(f"  Directory not found: {cat_in_dir}")
        return
        
    cat_out_dir = output_dir / category
    cat_out_dir.mkdir(parents=True, exist_ok=True)
    
    bin_files = list(cat_in_dir.glob("*.bin"))
    if not bin_files:
        return
        
    print(f"  Extracting {len(bin_files)} audio clips from {category}...")
    count = 0
    for f in bin_files:
        try:
            file_bytes = f.read_bytes()
            decrypted_bytes = decrypt_enca(file_bytes, inverse_table)
            
            env = UnityPy.load(decrypted_bytes)
            extracted = False
            for obj in env.objects:
                if obj.type.name == 'AudioClip':
                    clip = obj.read()
                    if clip.samples:
                        wav_name = next(iter(clip.samples.keys()))
                        wav_bytes = clip.samples[wav_name]
                        
                        out_path = cat_out_dir / f"{f.stem}.wav"
                        out_path.write_bytes(wav_bytes)
                        extracted = True
                        count += 1
                        break
            if not extracted:
                print(f"    No AudioClip found in {f.name}")
        except Exception as e:
            print(f"    Failed to extract audio {f.name}: {e}")
            
    print(f"  Successfully extracted {count} audio clips in {category}")


def run_il2cppdumper(apk_path: Path, output_dir: Path) -> None:
    """Run Il2CppDumper on the APK to generate dump.cs in user-data/.

    Extracts libil2cpp.so and global-metadata.dat from the APK if not already
    present, then invokes Il2CppDumper to produce dump.cs alongside them.
    Skips gracefully if Il2CppDumper is not available on PATH.
    """
    import subprocess

    base_dir = Path(__file__).resolve().parent.parent
    user_data_dir = base_dir / "user-data"
    user_data_dir.mkdir(parents=True, exist_ok=True)

    lib_path = user_data_dir / "libil2cpp.so"
    metadata_path = user_data_dir / "global-metadata.dat"
    dump_cs_path = user_data_dir / "dump.cs"

    # Check if Il2CppDumper is available
    try:
        subprocess.run(
            ["Il2CppDumper", "--help"],
            capture_output=True, check=False
        )
    except FileNotFoundError:
        print("  Skipped: Il2CppDumper not found in PATH.")
        print("  Install Il2CppDumper and add it to PATH to auto-generate dump.cs.")
        return

    # Extract libil2cpp.so from APK if not already present
    if not lib_path.exists():
        print("  Extracting libil2cpp.so from APK...")
        try:
            with zipfile.ZipFile(apk_path) as z:
                # Try arm64 first, fall back to armeabi-v7a
                for member in ("lib/arm64-v8a/libil2cpp.so", "lib/armeabi-v7a/libil2cpp.so"):
                    try:
                        with z.open(member) as src:
                            lib_path.write_bytes(src.read())
                        print(f"  Extracted {member}")
                        break
                    except KeyError:
                        continue
                else:
                    print("  Skipped: libil2cpp.so not found in APK.")
                    return
        except Exception as e:
            print(f"  Failed to extract libil2cpp.so: {e}")
            return

    # Extract global-metadata.dat from APK if not already present
    if not metadata_path.exists():
        print("  Extracting global-metadata.dat from APK...")
        try:
            with zipfile.ZipFile(apk_path) as z:
                with z.open(METADATA_MEMBER) as src:
                    metadata_path.write_bytes(src.read())
            print("  Extracted global-metadata.dat")
        except Exception as e:
            print(f"  Failed to extract global-metadata.dat: {e}")
            return

    # Run Il2CppDumper
    print(f"  Running Il2CppDumper to generate dump.cs...")
    try:
        result = subprocess.run(
            ["Il2CppDumper", str(lib_path), str(metadata_path), str(user_data_dir)],
            capture_output=True, text=True
        )
        if result.returncode == 0 and dump_cs_path.exists():
            size_mb = dump_cs_path.stat().st_size / (1024 * 1024)
            print(f"  Successfully generated dump.cs ({size_mb:.1f} MB)")
        else:
            print(f"  Warning: Il2CppDumper exited with code {result.returncode}")
            for line in result.stderr.splitlines():
                print(f"    [ERR] {line}")
            if not dump_cs_path.exists():
                print("  dump.cs was not generated.")
    except Exception as e:
        print(f"  Failed to run Il2CppDumper: {e}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    BASE_DIR = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--apk",
        type=Path,
        default=BASE_DIR / "local-input" / "terra-battle-5.5.7-170.apk",
        help="Path to the Terra Battle APK",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BASE_DIR / "user-data" / "extracted-gamedata",
        help="Output directory for extracted data",
    )
    args = parser.parse_args()

    apk_path = args.apk.resolve()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    if not apk_path.exists():
        print(f"APK not found: {apk_path}")
        return 1

    print(f"APK: {apk_path}")
    print(f"Output: {output_dir}")
    print()

    # Step 1: Load inverse table
    print("[1/8] Loading string decryption table...")
    try:
        inverse_table = load_inverse_table(apk_path)
        print("  Decryption table loaded successfully")
    except Exception as error:
        print(f"  Failed to load decryption table: {error}")
        return 1
    print()

    # Step 2: Setup type tree generator
    print("[2/8] Setting up IL2CPP type tree generator...")
    try:
        with zipfile.ZipFile(apk_path) as archive:
            il2cpp = archive.read(IL2CPP_MEMBER)
            metadata = archive.read(METADATA_MEMBER)
        gen = TypeTreeGenerator("2017.4.37f1")
        gen.load_il2cpp(il2cpp, metadata)
        print("  IL2CPP loaded and type trees registered successfully")
    except Exception as error:
        print(f"  Failed to setup type tree generator: {error}")
        print("  Please make sure 'capstone' is installed: py -3 -m pip install capstone")
        return 1
    print()

    # Step 3: Load Unity environment
    print("[3/8] Loading Unity resources.assets...")
    try:
        with zipfile.ZipFile(apk_path) as archive:
            data_payload = archive.read(APK_DATA_MEMBER)
    except (KeyError, zipfile.BadZipFile) as error:
        print(f"  Could not read data.unity3d from APK: {error}")
        return 1

    tmpdir = Path(tempfile.mkdtemp())
    try:
        data_file = tmpdir / "data.unity3d"
        data_file.write_bytes(data_payload)
        env = UnityPy.load(str(data_file))
        env.typetree_generator = gen
        print(f"  Loaded {sum(1 for _ in env.objects)} objects from data.unity3d")
        print()

        # Step 4: TextAssets
        print("[4/8] Extracting Lua scripts and TextAssets...")
        extract_text_assets(env, output_dir)

        # Scan Scenario directory for DLC chapter scripts
        scenario_dir = apk_path.parent / "resources" / "data_u2017" / "android" / "Scenario"
        extract_dlc_text_assets(scenario_dir, output_dir)
        print()

        # Step 5: MonoBehaviours (game data)
        print("[5/8] Extracting and decrypting database objects...")
        extract_monobehaviours(env, output_dir, inverse_table)
        print()

        # Step 5b: Extract item icons from ItemAtlas
        print("  Extracting item icons from ItemAtlas...")
        extract_item_icons(env, output_dir)
        print()

        # Step 5c: Extract images from local android bundles
        print("  Extracting images from local Android asset bundles...")
        android_dir = apk_path.parent / "resources" / "data_u2017" / "android"
        if android_dir.exists():
            for category in ("BG", "Banner", "BuddyImages", "BuddyThumbs", "Illust", "Pieces"):
                extract_images_from_dir(category, android_dir, output_dir, inverse_table)
        else:
            print(f"  WARNING: Android resources directory not found at {android_dir}")
        print()

        # Step 5d: Extract audio from local android bundles
        print("  Extracting audio from local Android asset bundles...")
        if android_dir.exists():
            for category in ("BGM", "SE"):
                extract_audio_from_dir(category, android_dir, output_dir, inverse_table)
        print()

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    # Step 6: Decompile Lua chapters and parse stage layouts (chapters 1-7)
    print("[6/8] Decompiling Lua chapters and building StagesLayout.json (chapters 1–7)...")
    run_decompile_and_parse_all(output_dir)
    print()

    # Step 7: Generate dump.cs via Il2CppDumper
    print("[7/8] Generating dump.cs via Il2CppDumper...")
    run_il2cppdumper(apk_path, output_dir)
    print()

    # Step 8: Extract native ARM64 stage layouts (chapters 8-42)
    print("[8/8] Extracting native stage layouts (chapters 8–42)...")
    run_extract_native_stages(apk_path, output_dir)
    print()

    print("=" * 60)
    print(f"Extraction complete! Output in: {output_dir}")
    print(f"Decrypted game databases: {output_dir / 'game_data'}")
    print(f"Lua/TextAssets scripts:   {output_dir / 'text_assets'}")
    print(f"Stage wave layouts:       {output_dir / 'game_data' / 'StagesLayout.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

