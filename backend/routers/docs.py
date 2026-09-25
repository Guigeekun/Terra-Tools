import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.config import DOCS_DIR

router = APIRouter(tags=["docs"])

# Frontmatter is a small block of `key: value` lines between two `---` fences.
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
# Slugs are relative markdown paths without the extension; no dots keeps
# traversal and extension-spoofing out of the route parameter.
SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/_-]*$")


def _parse_frontmatter(text):
    """Split a markdown file into its `key: value` frontmatter and body."""
    meta = {}
    body = text
    match = FRONTMATTER_RE.match(text)
    if match:
        for line in match.group(1).splitlines():
            if ":" not in line:
                continue
            key, _, value = line.partition(":")
            meta[key.strip().lower()] = value.strip().strip('"').strip("'")
        body = text[match.end():]
    return meta, body


def _parse_tags(raw):
    """Accept both `tags: a, b` and `tags: [a, b]` frontmatter spellings."""
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [t.strip() for t in raw.split(",") if t.strip()]


def _doc_entry(path, meta):
    rel = os.path.relpath(path, DOCS_DIR).replace(os.sep, "/")
    fallback_title = os.path.basename(rel)[:-3].replace("-", " ").title()
    return {
        "slug": rel[:-3],
        "title": meta.get("title") or fallback_title,
        "tags": _parse_tags(meta.get("tags")),
        "description": meta.get("description", ""),
        "updated": datetime.fromtimestamp(
            os.path.getmtime(path), tz=timezone.utc
        ).isoformat(),
    }


def _read_entry(path):
    try:
        with open(path, encoding="utf-8") as fh:
            meta, _ = _parse_frontmatter(fh.read())
        return _doc_entry(path, meta)
    except OSError:
        return None


@router.get('/api/docs')
def list_docs(tag: str = None):
    """List community documents with their frontmatter metadata.

    Returns every document plus per-tag counts so the UI can build its filter
    chips; `?tag=` optionally narrows the list server-side.
    """
    docs = []
    if os.path.isdir(DOCS_DIR):
        for dirpath, dirnames, filenames in os.walk(DOCS_DIR):
            dirnames.sort()
            for name in sorted(filenames):
                if not name.lower().endswith(".md") or name.lower() == "readme.md":
                    continue
                entry = _read_entry(os.path.join(dirpath, name))
                if entry:
                    docs.append(entry)
    docs.sort(key=lambda d: d["slug"])

    counts = {}
    for doc in docs:
        for doc_tag in doc["tags"]:
            counts[doc_tag] = counts.get(doc_tag, 0) + 1
    tags = [{"tag": t, "count": c} for t, c in sorted(counts.items())]

    if tag:
        docs = [d for d in docs if tag in d["tags"]]
    return {"docs": docs, "tags": tags}


@router.get('/api/docs/{slug:path}')
def get_doc(slug: str):
    """Return one document's metadata and markdown body."""
    if not slug or not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Invalid document slug")
    path = os.path.join(DOCS_DIR, *slug.split("/")) + ".md"
    real_base = os.path.realpath(DOCS_DIR)
    real_path = os.path.realpath(path)
    if not real_path.startswith(real_base + os.sep):
        raise HTTPException(status_code=400, detail="Invalid document slug")
    if not os.path.isfile(real_path):
        raise HTTPException(status_code=404, detail="Document not found")

    entry = _read_entry(real_path)
    if entry is None:
        raise HTTPException(status_code=500, detail="Could not read document")
    with open(real_path, encoding="utf-8") as fh:
        _, body = _parse_frontmatter(fh.read())
    return {**entry, "content": body}
