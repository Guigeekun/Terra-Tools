"""Build LuckChests.json from the reTB server's Luck Treasure Chest tables.

Chest contents were authored on the retired official server and never shipped
in the APK, so the record we serve is the **reTB private server's**
implementation (the sibling checkout this toolbox's play flow uses). It
superseded the project-liminal-gate tables this step originally served: on
every stage both projects document, reTB's tables are equal or strictly more
complete (they resolve rows liminal-gate left open), and they cover families
liminal-gate lacks (Strikes Back per-difficulty amounts, Daily Quests incl.
The Hunt For Joker, Tower of Temptation, the Hunt For arena quests, Shin'en /
Mutoh, Royal Rings, Melting Pot, chapter 2017). The UI labels the result as
"based on reTB chests" — it is a server implementation, not original
Mistwalker data.

Sources, all from the reTB checkout (looked up by default in ``local-input/``
— see the README's Local Input Directory section — then ``retb_path`` in
config.json, then a checkout beside this repository):

* ``tb_server/data/ltc_pools_by_stage.json`` — per-stage pools keyed
  ``"<chapter>-<section0>"`` (0-based sections; reTB validated the client's
  1-based wire value minus one). Stages with exact wiki tier tables carry
  ``tiers``; the rest carry category buckets (``items`` / ``companions`` /
  ``monsters``) reTB generates from battledata drop lists, plus
  ``restricted`` (premium items gated to specific chest tiers).
* ``tb_server/handlers/userdata/quest_consts.py`` — ``LTC_SPECIAL_TIERS``
  exact tables that override the JSON, ``DEFAULT_POOL`` (the generic chest
  every other non-excluded stage shows), ``LTC_EXCLUDED_CHAPTERS``,
  ``WIN_POOLS`` (the categories each tier may draw) and ``CHEST_CURVE`` (the
  per-tier chance bases). The module source is executed against a stub
  ``LtcStagePool`` so no reTB dependency (dotenv, pydantic) is needed here.

Conversion to the served schema: sections renumbered 1-based, tier names
``Luck80`` -> ``Luck 80``, the ``L<count>`` reward code (Animata Core x count,
reTB's ShowLuck finding) passed through for the backend to resolve, and every
non-excluded stage that has no pool serves reTB's ``DEFAULT_POOL`` — which is
why the toolbox now shows chests wherever reTB players see them.
"""

from __future__ import annotations

import argparse
import json
import sys
import types
from dataclasses import dataclass, field
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

DONOR_REPO_NAME = "reTB - working adult edition"

#: reTB chapter ids that mean a different BattleData chapter here.
EXCLUDED_CHAPTER_REMAP = {700: 7000, 701: 7000}  # Orbling Cavern map points
#: Gated off upstream of LTC in reTB (never served at all), so no chests there.
RETB_NOT_SERVED_CHAPTERS = {2005, 3004}  # Mobius FF (licensed), Crystal Road


def find_donor_repo(explicit: str | None = None) -> Path:
    """Locate the reTB server checkout holding the chest implementation.

    Default convention is a ``reTB*`` folder dropped into ``local-input/``
    (same drop-zone as the APK and gdresources); ``retb_path`` in config.json
    overrides, and a checkout beside this repository is the last fallback.
    """
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    config_path = REPO_ROOT / "config.json"
    if config_path.exists():
        try:
            configured = json.loads(config_path.read_text(encoding="utf-8")).get("retb_path")
            if configured:
                candidates.append(Path(configured))
        except (OSError, json.JSONDecodeError):
            pass
    local_input = REPO_ROOT / "local-input"
    if local_input.is_dir():
        for entry in sorted(local_input.iterdir()):
            if entry.name.lower().startswith("retb") and (
                entry / "tb_server" / "handlers" / "userdata" / "quest_consts.py"
            ).exists():
                candidates.append(entry)
    candidates.append(REPO_ROOT.parent / DONOR_REPO_NAME)

    for candidate in candidates:
        if (candidate / "tb_server" / "handlers" / "userdata" / "quest_consts.py").exists():
            return candidate
    searched = ", ".join(str(c) for c in candidates)
    raise FileNotFoundError(
        f"Could not locate the {DONOR_REPO_NAME} checkout (searched: {searched}). "
        "Drop it into local-input/ as 'reTB - working adult edition', or set "
        '"retb_path" in config.json to its path.'
    )


@dataclass
class LtcStagePool:  # noqa: D101 - stub for reTB's own dataclass, same fields
    items: list = field(default_factory=list)
    companions: list = field(default_factory=list)
    monsters: list = field(default_factory=list)
    coins: int = 0
    tiers: dict = field(default_factory=dict)
    restricted: dict = field(default_factory=dict)


def load_retb_consts(retb_root: Path) -> types.SimpleNamespace:
    """Execute reTB's quest_consts.py against a stub LtcStagePool."""
    const_path = retb_root / "tb_server" / "handlers" / "userdata" / "quest_consts.py"
    stub_pkg = types.ModuleType("tb_server")
    stub_models = types.ModuleType("tb_server.models")
    stub_gd = types.ModuleType("tb_server.models.game_data_models")
    stub_gd.LtcStagePool = LtcStagePool
    stub_pkg.models = stub_models
    stub_models.game_data_models = stub_gd
    for name, mod in (
        ("tb_server", stub_pkg),
        ("tb_server.models", stub_models),
        ("tb_server.models.game_data_models", stub_gd),
    ):
        sys.modules.setdefault(name, mod)

    namespace: dict = {"__file__": str(const_path), "__name__": "tb_server.quest_consts"}
    exec(compile(const_path.read_text(encoding="utf-8"), str(const_path), "exec"), namespace)
    return types.SimpleNamespace(**{
        name: namespace[name]
        for name in ("LTC_SPECIAL_TIERS", "DEFAULT_POOL", "LTC_EXCLUDED_CHAPTERS",
                     "WIN_POOLS", "CODE_PREFIX", "TIER_NAMES", "CHEST_CURVE")
    })


def mapped_exclusions(retb_excluded) -> frozenset[int]:
    """reTB's excluded chapter set in this repo's BattleData chapter ids."""
    mapped = {EXCLUDED_CHAPTER_REMAP.get(ch, ch) for ch in retb_excluded}
    return frozenset(mapped | RETB_NOT_SERVED_CHAPTERS)


def tier_metadata(consts) -> list[dict]:
    """The six chest slots with reTB's chance model, in serve order.

    From CHEST_CURVE: each regular chest's chance is linear from a non-zero
    base at Luck 0 up to its anchor (A guaranteed at 40, B at 85; C and D
    peak at 50% / 25% at Luck 100). The two named chests are all-or-nothing
    at their Luck threshold (reTB's chest_chance).
    """
    regular = ("A", "B", "C", "D")
    tiers = []
    for (base, anchor_luck, peak), name in zip(consts.CHEST_CURVE, regular):
        tiers.append({
            "key": name,
            "order": len(tiers) + 1,
            "base_chance": base,
            "guaranteed_at_luck": float(anchor_luck),
            "ceiling": peak / 100,
            "threshold_only": False,
        })
    for name, threshold in (("Luck 80", 80), ("Luck 100", 100)):
        tiers.append({
            "key": name,
            "order": len(tiers) + 1,
            "base_chance": None,
            "guaranteed_at_luck": threshold,
            "ceiling": 1.0,
            "threshold_only": True,
        })
    return tiers


def expand_pool_tiers(pool: dict, consts) -> dict[str, list[str]]:
    """A JSON pool's six tier lists, reTB's compose_chests semantics.

    A tier with an exact table uses it; otherwise the tier draws from the
    pool's content categories (WIN_POOLS decides which categories per tier)
    plus its tier-gated restricted items.
    """
    prefix = consts.CODE_PREFIX
    restricted: dict[str, list[int]] = pool.get("restricted") or {}
    tiers: dict[str, list[str]] = {}
    for idx, name in enumerate(consts.TIER_NAMES):
        exact = (pool.get("tiers") or {}).get(name)
        if exact is not None:
            tiers[_tier_key(name)] = list(dict.fromkeys(exact))
            continue
        codes: list[str] = []
        for cat in consts.WIN_POOLS[idx]:
            codes.extend(f"{prefix[cat]}{value}" for value in pool.get(cat, []))
        for item, gate in restricted.items():
            if idx in gate:
                codes.append(f"I{item}")
        tiers[_tier_key(name)] = list(dict.fromkeys(codes))
    return tiers


def expand_special_tiers(table: dict) -> dict[str, list[str]]:
    """An LTC_SPECIAL_TIERS table: exact lists, and a tier the table omits is
    an empty chest on that stage (reTB's compose_tiers draws nothing)."""
    out: dict[str, list[str]] = {}
    for raw in ("A", "B", "C", "D", "Luck80", "Luck100"):
        out[_tier_key(raw)] = list(table.get(raw, []))
    return out


def expand_default_pool(pool: LtcStagePool, consts) -> dict[str, list[str]]:
    """reTB's DEFAULT_POOL: items only (it carries no companions/monsters)."""
    codes = [f"I{value}" for value in pool.items]
    return {_tier_key(name): list(codes) for name in consts.TIER_NAMES}


def _tier_key(name: str) -> str:
    return name.replace("Luck80", "Luck 80").replace("Luck100", "Luck 100")


def build_document(
    pools: dict[str, dict],
    consts,
    battle_data: dict,
    default_pool: LtcStagePool,
    excluded_chapters: frozenset[int],
) -> dict:
    """Merge reTB's sources and shape the served JSON, validating stages.

    Precedence mirrors reTB's luckresult_for: LTC_SPECIAL_TIERS beat the JSON
    pools, which beat DEFAULT_POOL. A pool keyed to a section BattleData does
    not carry is dropped loudly rather than served.
    """
    chapters: dict[int, int] = {}
    for ch in battle_data.get("chapters", []):
        chapters[ch.get("chapterNo", 0)] = len(ch.get("sections", []))

    stages: dict[str, dict[str, dict[str, list[str]]]] = {}
    dropped: list[str] = []
    default_tiers = expand_default_pool(default_pool, consts)

    for chapter_no, section_count in sorted(chapters.items()):
        if chapter_no in excluded_chapters:
            continue
        for section in range(1, section_count + 1):
            raw_key = f"{chapter_no}-{section - 1}"
            if raw_key in consts.LTC_SPECIAL_TIERS:
                tiers = expand_special_tiers(consts.LTC_SPECIAL_TIERS[raw_key])
            elif raw_key in pools:
                tiers = expand_pool_tiers(pools[raw_key], consts)
            else:
                tiers = {name: list(codes) for name, codes in default_tiers.items()}
            stages.setdefault(str(chapter_no), {})[str(section)] = {"tiers": tiers}

    # Pool/special keys that no longer map onto a real stage: reported, kept
    # out. Chapter-level skips (1100 difficulty levels, Tower variants keyed
    # beyond a chapter's sections) surface here.
    served = {(int(ch), int(sec)) for ch, secs in stages.items() for sec in secs}
    for raw_key in sorted(set(consts.LTC_SPECIAL_TIERS) | set(pools)):
        try:
            ch, s0 = raw_key.split("-")
            if (int(ch), int(s0) + 1) not in served and int(ch) not in excluded_chapters:
                dropped.append(raw_key)
        except ValueError:
            dropped.append(raw_key)
    if dropped:
        print(f"  WARNING: dropped {len(dropped)} reTB pool(s) with no BattleData stage: "
              f"{', '.join(dropped)}")

    return {
        "schema": "luck-chests-1",
        "source": (
            "Based on the reTB server's Luck Treasure Chest implementation "
            "(tb_server ltc_pools_by_stage.json + quest_consts.LTC_SPECIAL_TIERS): "
            "wiki-transcribed exact tables audited in-game, reTB's generated "
            "category pools for stages with battledata drops, and reTB's "
            "DEFAULT_POOL fallback for the remainder. Not original Mistwalker "
            "server data — the client held no chest table."
        ),
        "tiers": tier_metadata(consts),
        "no_chest_chapters": sorted(set(excluded_chapters) & set(chapters)),
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
    pools_path = donor_root / "tb_server" / "data" / "ltc_pools_by_stage.json"
    pools = json.loads(pools_path.read_text(encoding="utf-8"))
    consts = load_retb_consts(donor_root)
    excluded = mapped_exclusions(consts.LTC_EXCLUDED_CHAPTERS)

    document = build_document(pools, consts, battle_data, consts.DEFAULT_POOL, excluded)

    out_path = game_data / "LuckChests.json"
    out_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    n_stages = sum(len(secs) for secs in document["stages"].values())
    print(f"  Luck chests: {n_stages} stages served, "
          f"{len(pools)} reTB pools + {len(consts.LTC_SPECIAL_TIERS)} special tables, "
          f"chestless chapters {len(document['no_chest_chapters'])}")
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
        help=f"Path to the {DONOR_REPO_NAME} checkout (default: local-input/ or auto-discovery)",
    )
    args = parser.parse_args()

    # A missing reTB checkout is not an error: the pipeline still produces
    # (incomplete) user-data, just without LuckChests.json — the backend and
    # UI already treat absent chest data as "no chest panels".
    try:
        donor_root = find_donor_repo(args.source)
    except FileNotFoundError as error:
        print(f"  reTB checkout not found — skipping LuckChests.json "
              f"(user-data will lack luck chest data): {error}")
        return 0

    try:
        extract_luck_chests(args.output_dir.resolve(), donor_root)
    except (FileNotFoundError, SyntaxError) as error:
        print(f"  Failed to extract luck chests: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
