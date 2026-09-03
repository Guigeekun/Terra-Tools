import os
import sys

CHUNK_SIZE = 1500 * 1024 * 1024  # 1.5 GB per chunk (well under GitHub's 2.0 GB limit)

def split_file(file_path, output_dir=None):
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        return []
    
    file_size = os.path.getsize(file_path)
    base_name = os.path.basename(file_path)
    target_dir = output_dir or os.path.dirname(file_path) or "."
    
    print(f"Splitting '{file_path}' ({file_size / (1024**3):.2f} GB) in chunks of {CHUNK_SIZE / (1024**3):.2f} GB...")
    part_num = 1
    created_parts = []
    
    with open(file_path, 'rb') as src:
        while True:
            chunk = src.read(CHUNK_SIZE)
            if not chunk:
                break
            part_filename = os.path.join(target_dir, f"{base_name}.{part_num:03d}")
            with open(part_filename, 'wb') as dst:
                dst.write(chunk)
            created_parts.append(part_filename)
            print(f"  Created: {part_filename} ({len(chunk) / (1024**2):.2f} MB)")
            part_num += 1
            
    print(f"Done splitting {file_path} into {len(created_parts)} parts.")
    return created_parts

if __name__ == '__main__':
    user_data = "user-data.zip"
    local_input = os.path.join("local-input", "local-input.zip")
    
    print("--- Splitting user-data.zip ---")
    split_file(user_data, ".")
    
    print("\n--- Splitting local-input.zip ---")
    split_file(local_input, "local-input")

