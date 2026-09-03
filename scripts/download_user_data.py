#!/usr/bin/env python3
"""
Downloads and unpacks the latest pre-extracted user-data release assets from GitHub.
Supports both single .zip files and multi-part archives (.zip.001, .zip.002, etc.).
"""

import argparse
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

DEFAULT_REPO = os.environ.get("GITHUB_REPO", "Guigeekun/Terra-Tools")
DEFAULT_TARGET = os.environ.get("USER_DATA_DIR", "user-data")


class MultiPartStream(io.RawIOBase):
    """File-like reader that transparently stitches multiple file parts together."""

    def __init__(self, file_paths):
        self.paths = file_paths
        self.files = [open(p, "rb") for p in file_paths]
        self.sizes = [os.path.getsize(p) for p in file_paths]
        self.total_size = sum(self.sizes)
        self.offsets = [0]
        for s in self.sizes[:-1]:
            self.offsets.append(self.offsets[-1] + s)
        self.pos = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.total_size + offset
        else:
            raise ValueError("Invalid whence argument")
        self.pos = max(0, min(self.pos, self.total_size))
        return self.pos

    def tell(self):
        return self.pos

    def readinto(self, b):
        if self.pos >= self.total_size:
            return 0
        for i, (part_start, part_size) in enumerate(zip(self.offsets, self.sizes)):
            if part_start <= self.pos < part_start + part_size:
                f = self.files[i]
                part_pos = self.pos - part_start
                f.seek(part_pos)
                max_read = min(len(b), part_size - part_pos)
                chunk = f.read(max_read)
                b[:len(chunk)] = chunk
                self.pos += len(chunk)
                return len(chunk)
        return 0

    def close(self):
        if hasattr(self, "files"):
            for f in self.files:
                try:
                    f.close()
                except Exception:
                    pass
        super().close()


def is_user_data_present(target_dir):
    """Check if valid user-data already exists in target_dir."""
    check_path = os.path.join(target_dir, "extracted-gamedata", "game_data")
    if os.path.exists(check_path):
        # Ensure it is not an empty directory
        items = os.listdir(check_path)
        if len(items) > 0:
            return True
    return False


def get_latest_release(repo, token=None):
    """Fetch the latest release information from GitHub API."""
    headers = {
        "User-Agent": "TerraTools-Fetcher",
        "Accept": "application/vnd.github.v3+json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    urls = [
        f"https://api.github.com/repos/{repo}/releases/latest",
        f"https://api.github.com/repos/{repo}/releases",
    ]

    last_err = None
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    if not data:
                        continue
                    # Pick first non-draft release if available
                    for rel in data:
                        if not rel.get("draft", False):
                            return rel
                    return data[0]
                return data
        except urllib.error.HTTPError as e:
            last_err = e
            continue
        except Exception as e:
            last_err = e
            continue

    raise RuntimeError(f"Failed to fetch releases for repository '{repo}': {last_err}")


def download_file(url, dest_path, expected_size=None, token=None):
    """Download a file with progress reporting and resume capability."""
    headers = {"User-Agent": "TerraTools-Fetcher"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    downloaded = 0
    if os.path.exists(dest_path):
        downloaded = os.path.getsize(dest_path)
        if expected_size and downloaded == expected_size:
            print(f"  [Cache hit] {os.path.basename(dest_path)} already fully downloaded ({downloaded / (1024**2):.1f} MB)")
            return
        elif expected_size and downloaded > expected_size:
            downloaded = 0
            os.remove(dest_path)

    if downloaded > 0:
        headers["Range"] = f"bytes={downloaded}-"
        print(f"  Resuming {os.path.basename(dest_path)} from {downloaded / (1024**2):.1f} MB...")
        open_mode = "ab"
    else:
        print(f"  Downloading {os.path.basename(dest_path)}...")
        open_mode = "wb"

    req = urllib.request.Request(url, headers=headers)
    start_time = time.time()
    last_print = 0

    try:
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, open_mode) as out_file:
            content_length = resp.headers.get("Content-Length")
            total_size = int(content_length) + downloaded if content_length else expected_size

            chunk_size = 1024 * 1024  # 1 MB chunk
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)

                now = time.time()
                if now - last_print >= 2.0:  # Print progress every 2 seconds
                    elapsed = now - start_time
                    speed = (downloaded / elapsed) if elapsed > 0 else 0
                    if total_size:
                        pct = (downloaded / total_size) * 100
                        print(f"    Progress: {downloaded / (1024**2):.1f} / {total_size / (1024**2):.1f} MB ({pct:.1f}%) - {speed / (1024**2):.2f} MB/s", end="\r", flush=True)
                    else:
                        print(f"    Progress: {downloaded / (1024**2):.1f} MB - {speed / (1024**2):.2f} MB/s", end="\r", flush=True)
                    last_print = now

            print(f"\n    Completed {os.path.basename(dest_path)} ({downloaded / (1024**2):.1f} MB)")
    except urllib.error.HTTPError as e:
        if e.code == 416:  # Requested Range Not Satisfiable (file is already fully downloaded)
            print(f"  File {os.path.basename(dest_path)} is already complete.")
            return
        raise


def extract_assets(part_paths, target_dir):
    """Extract zip or multipart zip into target_dir."""
    import zipfile

    print(f"Unpacking {len(part_paths)} archive part(s) into '{target_dir}'...")
    os.makedirs(target_dir, exist_ok=True)

    stream = io.BufferedReader(MultiPartStream(part_paths))
    try:
        with zipfile.ZipFile(stream, "r") as zf:
            members = zf.infolist()
            total_members = len(members)
            print(f"Found {total_members} files in archive. Extracting...")

            for i, member in enumerate(members, start=1):
                # Clean path to prevent directory traversal
                filename = member.filename.replace("\\", "/")
                
                # Strip leading "user-data/" or "user-data" if present in the archive
                if filename.startswith("user-data/"):
                    rel_name = filename[len("user-data/"):]
                elif filename == "user-data":
                    continue
                else:
                    rel_name = filename

                if not rel_name:
                    continue

                dest_path = os.path.join(target_dir, rel_name)

                if member.is_dir():
                    os.makedirs(dest_path, exist_ok=True)
                else:
                    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                    with zf.open(member) as src, open(dest_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)

                if i % 1000 == 0 or i == total_members:
                    print(f"  Extracted {i}/{total_members} files...", end="\r", flush=True)
            print("\nExtraction completed successfully!")
    finally:
        stream.close()


def find_local_archives(target_dir):
    """
    Search for existing local zip archives in target_dir, cwd, or project root.
    Returns a list of file paths (either [single_zip] or sorted [part1, part2, ...]).
    """
    search_dirs = []
    # 1. Target directory itself
    if os.path.isdir(target_dir):
        search_dirs.append(os.path.abspath(target_dir))
    
    # 2. Parent of target directory (e.g. /app or project root)
    parent_dir = os.path.dirname(os.path.abspath(target_dir))
    if parent_dir and os.path.isdir(parent_dir) and parent_dir not in search_dirs:
        search_dirs.append(parent_dir)
        
    # 3. Current working directory
    cwd = os.path.abspath(".")
    if cwd not in search_dirs:
        search_dirs.append(cwd)

    for d in search_dirs:
        # Check for single zip
        single_zip = os.path.join(d, "user-data.zip")
        if os.path.isfile(single_zip) and os.path.getsize(single_zip) > 0:
            return [single_zip]

        # Check for multipart zip (.001, .002, ...)
        parts = []
        try:
            for f in os.listdir(d):
                if re.match(r"^user-data\.zip\.\d+$", f):
                    part_file = os.path.join(d, f)
                    if os.path.isfile(part_file) and os.path.getsize(part_file) > 0:
                        parts.append(part_file)
        except OSError:
            pass

        if parts:
            parts.sort()
            return parts

    return []


def ensure_user_data(repo=DEFAULT_REPO, target_dir=DEFAULT_TARGET, force=False):
    """Main workflow to check, download, and unpack user-data."""
    # 1. Check if user data is already extracted and present
    if not force and is_user_data_present(target_dir):
        print(f"User data already extracted in '{target_dir}'. Skipping.")
        return True

    # 2. Check if local archives exist in the project folder
    if not force:
        local_archives = find_local_archives(target_dir)
        if local_archives:
            print(f"Found local user-data archive in project folder:")
            for p in local_archives:
                print(f"  - {p} ({os.path.getsize(p) / (1024**2):.1f} MB)")
            print(f"Unpacking local archive(s) into '{target_dir}'...")
            try:
                extract_assets(local_archives, target_dir)
                if is_user_data_present(target_dir):
                    print("Local user data successfully unpacked and verified!")
                    return True
                else:
                    print("Warning: Unpacking local archive did not yield expected user data. Falling back to GitHub release.")
            except Exception as e:
                print(f"Warning: Failed to extract local archive ({e}). Falling back to GitHub release.")

    # 3. Fallback: Query GitHub releases and download
    print(f"No valid local user data found. Checking GitHub releases for '{repo}'...")
    token = os.environ.get("GITHUB_TOKEN")

    try:
        release = get_latest_release(repo, token=token)
        tag = release.get("tag_name", "unknown")
        print(f"Found release: {tag} ({release.get('name', '')})")

        assets = release.get("assets", [])
        # Match user-data.zip or user-data.zip.001, .002, etc.
        user_data_assets = [
            a for a in assets
            if re.match(r"^user-data\.zip(\.\d+)?$", a.get("name", ""))
        ]

        if not user_data_assets:
            print(f"No user-data assets found in release {tag}!")
            print("Available assets:", [a.get("name") for a in assets])
            return False

        # Sort parts numerically (e.g. .001 before .002)
        user_data_assets.sort(key=lambda a: a["name"])

        temp_dir = os.path.join(target_dir, ".download_cache")
        os.makedirs(temp_dir, exist_ok=True)

        downloaded_files = []
        for asset in user_data_assets:
            name = asset["name"]
            url = asset["browser_download_url"]
            size = asset.get("size")
            part_path = os.path.join(temp_dir, name)
            download_file(url, part_path, expected_size=size, token=token)
            downloaded_files.append(part_path)

        # Unpack files into target_dir
        extract_assets(downloaded_files, target_dir)

        # Cleanup cache
        print("Cleaning up temporary download archives...")
        shutil.rmtree(temp_dir, ignore_errors=True)
        print("All assets installed and ready!")
        return True

    except Exception as e:
        print(f"Error during user-data fetch: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch and unpack user-data from GitHub releases")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"GitHub repository (default: {DEFAULT_REPO})")
    parser.add_argument("--target-dir", default=DEFAULT_TARGET, help=f"Destination directory (default: {DEFAULT_TARGET})")
    parser.add_argument("--force", action="store_true", help="Force download even if user-data exists")
    parser.add_argument("--check-only", action="store_true", help="Only check if user-data is present and exit")

    args = parser.parse_args()

    if args.check_only:
        if is_user_data_present(args.target_dir):
            print(f"User data present in '{args.target_dir}'.")
            sys.exit(0)
        else:
            print(f"User data missing in '{args.target_dir}'.")
            sys.exit(1)

    success = ensure_user_data(repo=args.repo, target_dir=args.target_dir, force=args.force)
    sys.exit(0 if success else 1)

