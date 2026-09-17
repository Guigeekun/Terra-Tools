#!/usr/bin/env python3
"""
Downloads and unpacks pre-extracted release assets from GitHub.
Supports both single .zip files and multi-part archives (.zip.001, .zip.002, etc.).

Assets:
    user-data    Pre-extracted game databases (default), unpacked into user-data/.
                 This is what the deployed Docker container relies on.
    gdresources  Raw client asset bundles (gdresources*.zip), unpacked into
                 local-input/. Dev-only, opt-in via --asset gdresources, used to
                 experience/test the data pipeline with the raw resources.
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

ASSET_PATTERN_USER_DATA = re.compile(r"^user-data\.zip(\.\d+)?$")
ASSET_PATTERN_GDRESOURCES = re.compile(r"^gdresources.*\.zip(\.\d+)?$", re.IGNORECASE)

# Category folders identifying a usable gdresources platform directory; an
# extracted-but-empty skeleton must not count as present.
GDRESOURCES_CATEGORIES = {
    "bg", "bgm", "banner", "buddyimages", "buddythumbs",
    "illust", "pieces", "se", "scenario",
}


def is_user_data_present(target_dir):
    """Check if valid user-data already exists in target_dir."""
    check_path = os.path.join(target_dir, "extracted-gamedata", "game_data")
    if os.path.exists(check_path):
        # Ensure it is not an empty directory
        items = os.listdir(check_path)
        if len(items) > 0:
            return True
    return False


def is_gdresources_present(target_dir):
    """Check if a gdresources* folder with asset categories exists in target_dir."""
    try:
        entries = sorted(os.listdir(target_dir))
    except OSError:
        return False
    for name in entries:
        if not name.lower().startswith("gdresources"):
            continue
        path = os.path.join(target_dir, name)
        if not os.path.isdir(path):
            continue
        try:
            for dirpath, dirnames, _ in os.walk(path):
                depth = os.path.relpath(dirpath, path).count(os.sep)
                if depth > 3:
                    dirnames[:] = []
                    continue
                if {d.lower() for d in dirnames} & GDRESOURCES_CATEGORIES:
                    return True
        except OSError:
            continue
    return False


# Asset registry driving the shared download/unpack workflow below.
# "direct_names" lists the archive base names to probe on the API-less
# releases/latest/download endpoint when api.github.com is unavailable.
ASSETS = {
    "user-data": {
        "pattern": ASSET_PATTERN_USER_DATA,
        "present": is_user_data_present,
        "default_target": DEFAULT_TARGET,
        "label": "user-data",
        "direct_names": ["user-data"],
    },
    "gdresources": {
        "pattern": ASSET_PATTERN_GDRESOURCES,
        "present": is_gdresources_present,
        "default_target": os.environ.get("LOCAL_INPUT_DIR", "local-input"),
        "label": "gdresources",
        "direct_names": ["gdresources", "gdresources-light"],
    },
}


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


def direct_download_url(repo, name):
    return f"https://github.com/{repo}/releases/latest/download/{name}"


def head_exists(url):
    """Cheap existence probe for non-API download URLs (no auth, no body)."""
    req = urllib.request.Request(url, headers={"User-Agent": "TerraTools-Fetcher"}, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= getattr(resp, "status", 200) < 300
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def get_latest_release_via_direct_urls(repo, base_names):
    """Build a release dict from the API-less 'releases/latest/download' URLs.

    api.github.com enforces a strict per-IP quota (60 requests/hour
    unauthenticated) that shared build hosts routinely exhaust, while the web
    download endpoints are not subject to it. Asset names cannot be listed
    without the API, so the known candidate names are probed instead: the plain
    zip if present, otherwise consecutive .001/.002/... parts up to the first
    missing one.
    """
    assets = []
    for base in base_names:
        plain = f"{base}.zip"
        if head_exists(direct_download_url(repo, plain)):
            assets.append({
                "name": plain,
                "size": None,
                "browser_download_url": direct_download_url(repo, plain),
            })
            break
        parts = []
        index = 1
        while index <= 99:
            name = f"{base}.zip.{index:03d}"
            if not head_exists(direct_download_url(repo, name)):
                break
            parts.append({
                "name": name,
                "size": None,
                "browser_download_url": direct_download_url(repo, name),
            })
            index += 1
        if parts:
            assets.extend(parts)
            break

    return {
        "tag_name": "latest",
        "name": "latest release (direct download)",
        "assets": assets,
    }


def download_file(url, dest_path, expected_size=None):
    """Download a file with progress reporting and resume capability.

    Never sends the GitHub token: browser download URLs redirect to the CDN and
    urllib forwards the Authorization header to it, which S3 presigned URLs
    reject. Public-repo assets download fine unauthenticated.
    """
    headers = {"User-Agent": "TerraTools-Fetcher"}

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


def extract_assets(part_paths, target_dir, asset="user-data"):
    """Extract zip or multipart zip into target_dir."""
    import zipfile

    print(f"Unpacking {len(part_paths)} archive part(s) into '{target_dir}'...")
    os.makedirs(target_dir, exist_ok=True)

    # gdresources archives may be packed without a gdresources* top-level
    # folder; nest them under the archive's own name in that case so the
    # gdresources* discovery still finds them.
    root_name = os.path.basename(part_paths[0])
    root_name = re.sub(r"\.zip(\.\d+)?$", "", root_name, flags=re.IGNORECASE)

    stream = io.BufferedReader(MultiPartStream(part_paths))
    try:
        with zipfile.ZipFile(stream, "r") as zf:
            members = zf.infolist()
            total_members = len(members)
            print(f"Found {total_members} files in archive. Extracting...")

            for i, member in enumerate(members, start=1):
                # Clean path to prevent directory traversal
                filename = member.filename.replace("\\", "/")

                if asset == "gdresources":
                    # Strip leading "local-input/" if the archive was created
                    # from a workspace layout.
                    if filename.startswith("local-input/"):
                        filename = filename[len("local-input/"):]
                    elif filename == "local-input":
                        continue

                    if not filename:
                        continue

                    top_dir = filename.split("/", 1)[0]
                    if top_dir.lower().startswith("gdresources"):
                        rel_name = filename
                    else:
                        rel_name = os.path.join(root_name, filename)
                else:
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


def find_local_archives(target_dir, pattern):
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
        parts = []
        try:
            for f in os.listdir(d):
                if pattern.match(f):
                    part_file = os.path.join(d, f)
                    if os.path.isfile(part_file) and os.path.getsize(part_file) > 0:
                        parts.append(part_file)
        except OSError:
            pass

        if parts:
            # Prefer the single plain zip over its split parts if both exist
            plain = [p for p in parts if re.match(r"^.*\.zip$", p, re.IGNORECASE)]
            if plain:
                return [plain[0]]
            parts.sort()
            return parts

    return []


def ensure_user_data(repo=DEFAULT_REPO, target_dir=None, force=False, asset="user-data"):
    """Main workflow to check, download, and unpack release assets."""
    config = ASSETS[asset]
    if target_dir is None:
        target_dir = config["default_target"]
    present = config["present"]
    pattern = config["pattern"]
    label = config["label"]

    # 1. Check if the asset is already extracted and present
    if not force and present(target_dir):
        print(f"{label} already present in '{target_dir}'. Skipping.")
        return True

    # 2. Check if local archives exist in the project folder
    if not force:
        local_archives = find_local_archives(target_dir, pattern)
        if local_archives:
            print(f"Found local {label} archive in project folder:")
            for p in local_archives:
                print(f"  - {p} ({os.path.getsize(p) / (1024**2):.1f} MB)")
            print(f"Unpacking local archive(s) into '{target_dir}'...")
            try:
                extract_assets(local_archives, target_dir, asset=asset)
                if present(target_dir):
                    print(f"Local {label} successfully unpacked and verified!")
                    return True
                else:
                    print(f"Warning: Unpacking local archive did not yield expected {label}. Falling back to GitHub release.")
            except Exception as e:
                print(f"Warning: Failed to extract local archive ({e}). Falling back to GitHub release.")

    # 3. Fallback: Query GitHub releases and download
    print(f"No valid local {label} found. Checking GitHub releases for '{repo}'...")
    token = os.environ.get("GITHUB_TOKEN")

    try:
        try:
            release = get_latest_release(repo, token=token)
        except Exception as api_err:
            print(f"GitHub API unavailable ({api_err}); falling back to direct download URLs...")
            release = get_latest_release_via_direct_urls(repo, config["direct_names"])
        tag = release.get("tag_name", "unknown")
        print(f"Found release: {tag} ({release.get('name', '')})")

        assets = release.get("assets", [])
        # Match e.g. user-data.zip(.001...) or gdresources*.zip(.001...)
        matching_assets = [
            a for a in assets
            if pattern.match(a.get("name", ""))
        ]

        if not matching_assets:
            print(f"No {label} assets found in release {tag}!")
            print("Available assets:", [a.get("name") for a in assets])
            return False

        # Sort parts numerically (e.g. .001 before .002)
        matching_assets.sort(key=lambda a: a["name"])

        temp_dir = os.path.join(target_dir, ".download_cache")
        os.makedirs(temp_dir, exist_ok=True)

        downloaded_files = []
        for asset_file in matching_assets:
            name = asset_file["name"]
            url = asset_file["browser_download_url"]
            size = asset_file.get("size")
            part_path = os.path.join(temp_dir, name)
            download_file(url, part_path, expected_size=size)
            downloaded_files.append(part_path)

        # Unpack files into target_dir
        extract_assets(downloaded_files, target_dir, asset=asset)

        # Cleanup cache
        print("Cleaning up temporary download archives...")
        shutil.rmtree(temp_dir, ignore_errors=True)
        print("All assets installed and ready!")
        return True

    except Exception as e:
        print(f"Error during {label} fetch: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch and unpack release assets from GitHub")
    parser.add_argument("--asset", choices=sorted(ASSETS.keys()), default="user-data",
                        help="Which release asset to fetch (default: user-data)")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"GitHub repository (default: {DEFAULT_REPO})")
    parser.add_argument("--target-dir", default=None,
                        help="Destination directory (default: asset-specific, e.g. user-data/ or local-input/)")
    parser.add_argument("--force", action="store_true", help="Force download even if the asset exists")
    parser.add_argument("--check-only", action="store_true", help="Only check if the asset is present and exit")

    args = parser.parse_args()

    config = ASSETS[args.asset]
    target_dir = args.target_dir if args.target_dir is not None else config["default_target"]

    if args.check_only:
        if config["present"](target_dir):
            print(f"{config['label']} present in '{target_dir}'.")
            sys.exit(0)
        else:
            print(f"{config['label']} missing in '{target_dir}'.")
            sys.exit(1)

    success = ensure_user_data(repo=args.repo, target_dir=target_dir, force=args.force, asset=args.asset)
    sys.exit(0 if success else 1)

