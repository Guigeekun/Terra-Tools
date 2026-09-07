import os
import sys
import time
import zipfile

CHUNK_SIZE = 1500 * 1024 * 1024  # 1.5 GB per chunk (under GitHub's 2.0 GB limit)

def create_user_data_zip(source_dir="user-data", output_zip="user-data.zip"):
    if not os.path.exists(source_dir):
        raise FileNotFoundError(f"Source directory '{source_dir}' does not exist.")
    
    print(f"Counting files in '{source_dir}'...")
    all_files = []
    total_bytes = 0
    for root, dirs, files in os.walk(source_dir):
        for f in files:
            fp = os.path.join(root, f)
            all_files.append(fp)
            total_bytes += os.path.getsize(fp)

    print(f"Found {len(all_files)} files ({total_bytes / (1024**3):.2f} GB uncompressed).")
    print(f"Archiving into '{output_zip}' with ZIP_DEFLATED compression (allowZip64=True)...")

    start_time = time.time()
    last_print = start_time
    written_bytes = 0

    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zf:
        for idx, fp in enumerate(all_files, start=1):
            arcname = os.path.relpath(fp, start=".").replace("\\", "/")
            zf.write(fp, arcname=arcname)
            written_bytes += os.path.getsize(fp)

            now = time.time()
            if now - last_print >= 3.0 or idx == len(all_files):
                pct = (written_bytes / total_bytes) * 100 if total_bytes > 0 else 100
                elapsed = now - start_time
                print(f"  Archiving: {idx}/{len(all_files)} files ({pct:.1f}%) in {elapsed:.0f}s...", flush=True)
                last_print = now

    zip_size = os.path.getsize(output_zip)
    total_time = time.time() - start_time
    print(f"Created '{output_zip}' ({zip_size / (1024**3):.2f} GB / {zip_size / (1024**2):.1f} MB) in {total_time:.1f}s.")
    return output_zip


def split_file(file_path, output_dir=".", chunk_size=CHUNK_SIZE):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    file_size = os.path.getsize(file_path)
    base_name = os.path.basename(file_path)
    target_dir = output_dir or "."

    print(f"Splitting '{file_path}' ({file_size / (1024**3):.2f} GB) into chunks of {chunk_size / (1024**3):.2f} GB...")
    part_num = 1
    created_parts = []

    with open(file_path, "rb") as src:
        while True:
            chunk = src.read(chunk_size)
            if not chunk:
                break
            part_filename = os.path.join(target_dir, f"{base_name}.{part_num:03d}")
            with open(part_filename, "wb") as dst:
                dst.write(chunk)
            created_parts.append(part_filename)
            print(f"  Created: {part_filename} ({len(chunk) / (1024**2):.1f} MB)")
            part_num += 1

    print(f"Done splitting '{file_path}' into {len(created_parts)} parts.")
    return created_parts


if __name__ == "__main__":
    zip_path = create_user_data_zip("user-data", "user-data.zip")
    parts = split_file(zip_path, ".", CHUNK_SIZE)
    print("Multi-part user-data ready:", parts)
