"""Decrypt ENCA files in gdresources and find all Chapter*.luac script assets."""
import os, zipfile, sys, glob, re
import UnityPy

APK_PATH = "local-input/terra-battle-5.5.7-170.apk"
METADATA_MEMBER = "assets/bin/Data/Managed/Metadata/global-metadata.dat"
INVERSE_TABLE_OFFSET = 0x601CAD
MAGIC = b"ENCA"

def load_inverse_table(apk_path):
    with zipfile.ZipFile(apk_path) as archive:
        metadata = archive.read(METADATA_MEMBER)
    return metadata[INVERSE_TABLE_OFFSET : INVERSE_TABLE_OFFSET + 256]

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

inv_table = load_inverse_table(APK_PATH)

gd_path = "g:/Terra/gdresources"
all_files = []
for root, dirs, files in os.walk(gd_path):
    for f in files:
        if f.endswith('.bin') or f.endswith('.bytes'):
            all_files.append(os.path.join(root, f))

print(f"Scanning {len(all_files)} files in gdresources for Chapter Lua scripts...")

output_dir = "user-data/extracted-gamedata/text_assets"
os.makedirs(output_dir, exist_ok=True)

chapter_found = {}

for idx, fpath in enumerate(all_files):
    if idx % 2000 == 0:
        print(f"  Processed {idx}/{len(all_files)} files... Found {len(chapter_found)} chapters so far.")
    try:
        raw = open(fpath, 'rb').read()
        dec = decrypt_enca(raw, inv_table) if raw.startswith(MAGIC) else raw
        env = UnityPy.load(dec)
        for obj in env.objects:
            if obj.type.name == "TextAsset":
                data = obj.read()
                name = getattr(data, "m_Name", "") or getattr(data, "name", "")
                if re.match(r'^Chapter\d+', name, re.IGNORECASE):
                    script_bytes = bytes(data.script)
                    dest_file = os.path.join(output_dir, f"{name}.luac")
                    with open(dest_file, "wb") as out_f:
                        out_f.write(script_bytes)
                    chapter_found[name] = dest_file
                    print(f"  [SAVED!] {name}.luac ({len(script_bytes)} bytes) from {os.path.basename(fpath)}")
    except Exception:
        pass

print(f"\nFINISH! Total unique Chapter scripts extracted: {len(chapter_found)}")
for k in sorted(chapter_found.keys()):
    print(f"  {k} -> {chapter_found[k]}")
