"""Build LuckChests.json: the Luck Treasure Chest pools, per stage and tier.

Chest contents were authored on the retired game server and never shipped in
the APK, so unlike every other dataset here they cannot be recovered from
``local-input``. The record that exists is the community's, maintained as
Python tables in the sibling project ``project-liminal-gate``
(``liminal_gate.luck_pool_data.DOCUMENTED_CHEST_POOLS`` + ``NO_CHEST_CHAPTERS``,
with the tier/luck model in ``liminal_gate.luck_data``). This step imports
those tables, overlays this repo's own supplement for the descent quests the
donor under-documents (see ``luck_chests_supplement.py``), validates every
stage against the freshly-extracted ``BattleData.json``, and writes one JSON
the backend serves from.

Rewards keep the client's wire encoding (``C``/``I``/``O``/``M`` + ID); the
backend resolves them to names at serve time.

Usage (also run as step 10 of extract_everything.py)::

    python scripts/extract_luck_chests.py [--source /path/to/project-liminal-gate]

The donor location is taken from ``liminal_gate_path`` in ``config.json`` when
present, else auto-discovered next to this repository.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

from luck_chests_supplement import SUPPLEMENT_CHEST_POOLS  # noqa: E402

#: The six chest slots, verbatim from the record's ``luck_data.CHEST_TIERS``.
#: ``guaranteed_at_luck`` is the team Luck at or above which the record states
#: the chest always drops (``threshold_only`` tiers never drop below it); other
#: tiers rise proportionally with Luck up to that anchor. ``ceiling`` is the
#: probability at the anchor: 1.0 for tiers that become guaranteed, and for C
#: and D the value the record gives at 100.0 Luck.
CHEST_TIERS = (
    {"key": "A", "guaranteed_at_luck": 40.0, "ceiling": 1.0, "threshold_only": False},
    {"key": "B", "guaranteed_at_luck": 85.0, "ceiling": 1.0, "threshold_only": False},
    {"key": "C", "guaranteed_at_luck": 100.0, "ceiling": 0.5, "threshold_only": False},
    {"key": "D", "guaranteed_at_luck": 100.0, "ceiling": 0.25, "threshold_only": False},
    {"key": "Luck 80", "guaranteed_at_luck": 80.0, "ceiling": 1.0, "threshold_only": True},
    {"key": "Luck 100", "guaranteed_at_luck": 100.0, "ceiling": 1.0, "threshold_only": True},
)

DONOR_REPO_NAME = "project-liminal-gate"


def find_donor_repo(explicit: str | None = None) -> Path:
    """Locate the project-liminal-gate checkout holding the donor tables."""
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    config_path = REPO_ROOT / "config.json"
    if config_path.exists():
        try:
            configured = json.loads(config_path.read_text(encoding="utf-8")).get("liminal_gate_path")
            if configured:
                candidates.append(Path(configured))
        except (OSError, json.JSONDecodeError):
            pass
    candidates.append(REPO_ROOT.parent / DONOR_REPO_NAME)

    for candidate in candidates:
        if (candidate / "liminal_gate" / "luck_pool_data.py").exists():
            return candidate
    searched = ", ".join(str(c) for c in candidates)
    raise FileNotFoundError(
        f"Could not locate the {DONOR_REPO_NAME} checkout (searched: {searched}). "
        'Set "liminal_gate_path" in config.json to its path.'
    )


def load_donor_pools(donor_root: Path) -> tuple[dict, frozenset]:
    """Import the donor tables from the sibling checkout."""
    sys.path.insert(0, str(donor_root))
    try:
        from liminal_gate.luck_pool_data import DOCUMENTED_CHEST_POOLS, NO_CHEST_CHAPTERS
    finally:
        sys.path.remove(str(donor_root))
    return dict(DOCUMENTED_CHEST_POOLS), frozenset(NO_CHEST_CHAPTERS)


def build_document(
    donor_pools: dict[tuple[int, int], dict[str, tuple[str, ...]]],
    no_chest_chapters: frozenset[int],
    battle_data: dict,
) -> dict:
    """Merge donor + supplement and shape the served JSON, validating stages.

    A pool keyed to a chapter BattleData does not carry, or to a section beyond
    the chapter's section count, is dropped loudly rather than served: a chest
    no stage can roll is noise at best.
    """
    merged: dict[tuple[int, int], dict[str, tuple[str, ...]]] = {**donor_pools, **SUPPLEMENT_CHEST_POOLS}

    chapters: dict[int, int] = {}
    for ch in battle_data.get("chapters", []):
        chapters[ch.get("chapterNo", 0)] = len(ch.get("sections", []))

    stages: dict[str, dict[str, dict[str, list[str]]]] = {}
    dropped: list[str] = []
    for (chapter, section) in sorted(merged):
        sec_count = chapters.get(chapter)
        if sec_count is None or section > sec_count:
            dropped.append(f"{chapter}-{section}")
            continue
        tiers = {
            tier: list(codes)
            for tier, codes in merged[(chapter, section)].items()
        }
        stages.setdefault(str(chapter), {})[str(section)] = {"tiers": tiers}

    if dropped:
        print(f"  WARNING: dropped {len(dropped)} pool(s) with no BattleData stage: {', '.join(dropped)}")

    return {
        "schema": "luck-chests-1",
        "source": (
            "Community record (the retired server authored chest contents; the APK holds "
            "no table): project-liminal-gate liminal_gate.luck_pool_data, plus this repo's "
            "scripts/luck_chests_supplement.py for the descent quests' per-section pages. "
            "Coverage is a floor, not a claim: stages without a pool here may still have "
            "had chests."
        ),
        "tiers": [dict(t, order=i + 1) for i, t in enumerate(CHEST_TIERS)],
        "no_chest_chapters": sorted(no_chest_chapters),
        "supplement_stages": sorted(f"{c}-{s}" for (c, s) in SUPPLEMENT_CHEST_POOLS),
        "stages": stages,
    }


def extract_luck_chests(output_dir: Path, donor_root: Path | None = None) -> Path:
    """Generate LuckChests.json into the game_data output directory."""
    game_data = output_dir / "game_data"
    battle_path = game_data / "BattleData.json"
    if not battle_path.exists():
        raise FileNotFoundError(
            f"{battle_path} not found: run the BattleData extraction step first"
        )
    battle_data = json.loads(battle_path.read_text(encoding="utf-8"))

    donor_root = donor_root or find_donor_repo()
    donor_pools, no_chest_chapters = load_donor_pools(donor_root)
    document = build_document(donor_pools, no_chest_chapters, battle_data)

    out_path = game_data / "LuckChests.json"
    out_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    n_stages = sum(len(secs) for secs in document["stages"].values())
    print(f"  Luck chests: {n_stages} stages "
          f"(donor {len(donor_pools)}, supplement {len(SUPPLEMENT_CHEST_POOLS)}, "
          f"chestless chapters {len(document['no_chest_chapters'])})")
    print(f"  Wrote {out_path}")
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "user-data" / "extracted-gamedata",
        help="Output directory (game_data/ beneath it)",
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help=f"Path to the {DONOR_REPO_NAME} checkout (default: config.json or auto-discovery)",
    )
    args = parser.parse_args()
    try:
        extract_luck_chests(args.output_dir.resolve(), args.source)
    except (FileNotFoundError, ImportError) as error:
        print(f"  Failed to extract luck chests: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
