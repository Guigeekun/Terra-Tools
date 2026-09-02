#!/usr/bin/env python3
"""Recompile modified game data JSON files and assets back into the game's APK and resources.

Usage:
    python scripts/recompile_everything.py [--apk PATH] [--user-data PATH] [--output-dir PATH]
"""

from __future__ import annotations

import os
import sys
import argparse
import json
import shutil
import tempfile
import zipfile
import struct
from pathlib import Path
from typing import Any

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

def build_text_asset_raw_data(name: str, script_bytes: bytes) -> bytes:
    name_encoded = name.encode("utf-8")
    name_len = len(name_encoded)
    name_payload = struct.pack(f"<I{name_len}s", name_len, name_encoded)
    if len(name_payload) % 4 != 0:
        name_payload += b"\x00" * (4 - (len(name_payload) % 4))
        
    script_len = len(script_bytes)
    script_payload = struct.pack(f"<I{script_len}s", script_len, script_bytes)
    if len(script_payload) % 4 != 0:
        script_payload += b"\x00" * (4 - (len(script_payload) % 4))
        
    return name_payload + script_payload

# Monkey-patch TypeTreeGenerator to strip '.dll' from assembly names
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


# Fix native DLL loading on Windows
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


def decrypt_string(data: list[int], inverse_table: bytes) -> str:
    """Decrypt an EncryptedString byte list into a UTF-8 string."""
    if not data:
        return ""
    vals = [inverse_table[b] for b in data]
    plain_bytes = bytes(reversed(vals))
    return plain_bytes.decode("utf-8", errors="replace")


def encrypt_string(text: str, inverse_table: bytes) -> dict:
    """Encrypt a UTF-8 string back into an EncryptedString data structure."""
    plain_bytes = text.encode("utf-8")
    forward_table = [0] * 256
    for idx, val in enumerate(inverse_table):
        forward_table[val] = idx
    encrypted_data = [forward_table[b] for b in reversed(plain_bytes)]
    return {"data": encrypted_data}


def is_encrypted_string(obj: Any) -> bool:
    """Determine if a Python object represents serialized EncryptedString data."""
    if isinstance(obj, dict) and list(obj.keys()) == ["data"]:
        val = obj["data"]
        if isinstance(val, list) and all(isinstance(x, int) and 0 <= x <= 255 for x in val):
            return True
    return False


def encrypt_all_strings_recursively(obj: Any, inverse_table: bytes) -> Any:
    """Recursively convert all string values to EncryptedString format."""
    if isinstance(obj, str):
        return encrypt_string(obj, inverse_table)
    if isinstance(obj, dict):
        return {k: encrypt_all_strings_recursively(v, inverse_table) for k, v in obj.items()}
    if isinstance(obj, list):
        return [encrypt_all_strings_recursively(v, inverse_table) for v in obj]
    return obj


def prepare_monobehaviour_data(original: Any, modified: Any, inverse_table: bytes) -> Any:
    """Recursively map clean JSON values back to MonoBehaviour, re-encrypting EncryptedStrings."""
    if is_encrypted_string(original):
        if isinstance(modified, str):
            return encrypt_string(modified, inverse_table)
        return original
    if isinstance(original, dict) and isinstance(modified, dict):
        res = {}
        for k in original:
            if k in modified:
                res[k] = prepare_monobehaviour_data(original[k], modified[k], inverse_table)
            else:
                res[k] = original[k]
        return res
    if isinstance(original, list) and isinstance(modified, list):
        res = []
        for idx, item in enumerate(original):
            if idx < len(modified):
                res.append(prepare_monobehaviour_data(item, modified[idx], inverse_table))
            else:
                res.append(item)
        # Handle added list elements
        for idx in range(len(original), len(modified)):
            res.append(encrypt_all_strings_recursively(modified[idx], inverse_table))
        return res
    return modified


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    BASE_DIR = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--apk",
        type=Path,
        default=BASE_DIR / "local-input" / "terra-battle-5.5.7-170.apk",
        help="Path to the original Terra Battle APK",
    )
    parser.add_argument(
        "--user-data",
        type=Path,
        default=BASE_DIR / "user-data" / "extracted-gamedata",
        help="User data folder containing modified files",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BASE_DIR / "user-output",
        help="Output folder to save recompiled APK and resources",
    )
    args = parser.parse_args()

    apk_path = args.apk.resolve()
    user_data_dir = args.user_data.resolve()
    output_dir = args.output_dir.resolve()

    if not apk_path.exists():
        print(f"Original APK not found: {apk_path}")
        return 1

    print(f"Original APK:  {apk_path}")
    print(f"User Data:     {user_data_dir}")
    print(f"Output Dir:    {output_dir}")
    print()

    # Load inverse table
    print("Loading decryption table...")
    with zipfile.ZipFile(apk_path) as archive:
        metadata = archive.read(METADATA_MEMBER)
        il2cpp = archive.read(IL2CPP_MEMBER)
        data_payload = archive.read(APK_DATA_MEMBER)

    inverse_table = metadata[INVERSE_TABLE_OFFSET : INVERSE_TABLE_OFFSET + 256]

    # Setup type tree generator
    print("Loading IL2CPP type trees...")
    gen = TypeTreeGenerator("2017.4.37f1")
    gen.load_il2cpp(il2cpp, metadata)

    # Load Unity data
    print("Loading data.unity3d...")
    env = UnityPy.load(data_payload)
    env.typetree_generator = gen

    # Step 1: Re-serialize modified MonoBehaviours
    print("\n[1/4] Re-serializing modified MonoBehaviours...")
    gamedata_dir = user_data_dir / "game_data"
    recompiled_mb_count = 0

    for obj in env.objects:
        if obj.assets_file.name == "resources.assets" and obj.type.name == "MonoBehaviour" and obj.path_id in KNOWN_OBJECTS:
            class_name = KNOWN_OBJECTS[obj.path_id]
            json_file = gamedata_dir / f"{class_name}.json"

            if not json_file.exists():
                continue

            try:
                # Try parsing original. If it fails (like StringSet due to type tree issues),
                # we print a warning and skip, since we cannot recompile it via save_typetree.
                try:
                    orig_data = obj.parse_as_dict()
                except Exception:
                    print(f"  Skipping unmodified/unparseable MonoBehaviour: {class_name} (path_id={obj.path_id})")
                    continue

                # Load modified
                with open(json_file, "r", encoding="utf-8") as f:
                    modified_json = json.load(f)

                # Prepare binary-ready data dict
                prepared_data = prepare_monobehaviour_data(orig_data, modified_json, inverse_table)

                # Check if it was actually modified by comparing dicts
                if prepared_data == orig_data:
                    # No changes, skip to save performance
                    continue

                print(f"  Modifying MonoBehaviour {class_name} (path_id={obj.path_id})...")
                
                # Save back to object
                obj.save_typetree(prepared_data)
                print(f"    -> Recompiled MonoBehaviour {class_name} successfully.")
                recompiled_mb_count += 1
            except Exception as e:
                print(f"    -> ERROR compiling {class_name}: {e}")

    # Step 2: Re-serialize modified TextAssets
    print("\n[2/4] Re-serializing modified TextAssets...")
    text_assets_dir = user_data_dir / "text_assets"
    recompiled_ta_count = 0

    if text_assets_dir.exists():
        for obj in env.objects:
            if obj.assets_file.name == "resources.assets" and obj.type.name == "TextAsset":
                data = obj.read()
                name = data.m_Name
                
                # Check for possible modified files
                target_file = None
                for ext in (".luac", ".txt", ".bin"):
                    test_path = text_assets_dir / f"{name}{ext}"
                    if test_path.exists():
                        target_file = test_path
                        break
                        
                if target_file:
                    try:
                        # Read new content
                        if target_file.suffix == ".luac" or target_file.suffix == ".bin":
                            new_content = target_file.read_bytes()
                        else:
                            new_content = target_file.read_text(encoding="utf-8").encode("utf-8")
                            
                        # Build new raw TextAsset payload
                        new_raw = build_text_asset_raw_data(name, new_content)
                        
                        # Compare to current raw data
                        if obj.get_raw_data() != new_raw:
                            print(f"  Modifying TextAsset {name} from {target_file.name}...")
                            obj.set_raw_data(new_raw)
                            recompiled_ta_count += 1
                    except Exception as e:
                        print(f"    -> ERROR compiling TextAsset {name}: {e}")

    # Step 3: Package new data.unity3d and rebuild APK
    print("\n[3/4] Packaging data.unity3d and rebuilding APK...")
    modified_data_unity3d = env.file.save()
    print(f"  Built data.unity3d payload: {len(modified_data_unity3d):,} bytes")

    output_dir.mkdir(parents=True, exist_ok=True)
    modified_apk_path = output_dir / f"{apk_path.stem}-modified.apk"

    try:
        # Re-pack the APK zip by replacing assets/bin/Data/data.unity3d
        with zipfile.ZipFile(apk_path, "r") as in_zip:
            with zipfile.ZipFile(modified_apk_path, "w", compression=zipfile.ZIP_DEFLATED) as out_zip:
                for item in in_zip.infolist():
                    if item.filename == "assets/bin/Data/data.unity3d":
                        out_zip.writestr(item, modified_data_unity3d)
                    else:
                        out_zip.writestr(item, in_zip.read(item.filename))
        print(f"  -> Saved modified APK to: {modified_apk_path.name}")
    except Exception as e:
        print(f"  -> FAILED to rebuild APK: {e}")
        return 1

    # Step 4: Re-encrypt and copy resources
    print("\n[4/4] Copying and maintaining resources format...")
    src_res_dir = apk_path.parent / "gdresources"
    dst_res_dir = output_dir / "resources"

    if src_res_dir.exists():
        dst_res_dir.mkdir(parents=True, exist_ok=True)
        # Walk and copy all contents
        print(f"  Copying resources from {src_res_dir} to {dst_res_dir}...")
        for root, dirs, files in os.walk(src_res_dir):
            rel_path = Path(root).relative_to(src_res_dir)
            target_dir = dst_res_dir / rel_path
            target_dir.mkdir(parents=True, exist_ok=True)
            
            for file in files:
                src_file = Path(root) / file
                dst_file = target_dir / file
                shutil.copy2(src_file, dst_file)
        print("  -> Resources copied successfully.")
    else:
        print("  WARNING: Source resources folder not found at local-input/gdresources/.")

    print("\n" + "=" * 60)
    print("RECOMPILATION COMPLETE!")
    print(f"Recompiled MonoBehaviours: {recompiled_mb_count}")
    print(f"Recompiled TextAssets:     {recompiled_ta_count}")
    print(f"Modified Game APK:         {modified_apk_path}")
    print(f"Output resources path:     {dst_res_dir}")
    print("-" * 60)
    print("Note: To run this APK on a device/emulator, make sure to sign it first.")
    print("============================================================\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
