"""Generate stripped variants of a converted ReTB savefile for boot bisection.

When an imported save hangs the game on the loading screen, importing the
variants below one at a time isolates the offending chunk: each variant applies
the client float-trap fix (the most common offender) and removes ONE further
area of progress data, so the first variant that boots names the culprit.

Usage:
    python scripts/strip_save.py <converted-save.json> [-o OUTPUT_DIR]
"""

import copy
import json
import os
import sys


def _as_float(value):
    """Coerce to float, returning the input unchanged when not numeric."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def fix_float_traps(save):
    """Coerce the client's LitJson double fields to JSON decimals.

    The client parses chrdata date/jobLevels/jobSlots, lastupdate,
    refillStartTime and every questClearDate value through a double cast --
    an integer is a parse failure, not a rounding difference (see
    project-liminal-gate save_validation.py FLOAT_FIELDS).
    """
    save = copy.deepcopy(save)
    doc = json.loads(save["tables"]["session"]["rows"][0][1])
    for entry in doc.get("chrdata", []) or []:
        if not isinstance(entry, dict):
            continue
        if "date" in entry:
            entry["date"] = _as_float(entry["date"])
        for key in ("jobLevels", "jobSlots"):
            if isinstance(entry.get(key), list):
                entry[key] = [_as_float(v) for v in entry[key]]
    for key in ("lastupdate", "refillStartTime"):
        if key in doc:
            doc[key] = _as_float(doc[key])
    if isinstance(doc.get("questClearDate"), dict):
        doc["questClearDate"] = {
            stage: _as_float(stamp) for stage, stamp in doc["questClearDate"].items()
        }
    if isinstance(doc.get("extra_quest_clears"), dict):
        doc["extra_quest_clears"] = {
            stage: _as_float(stamp)
            for stage, stamp in doc["extra_quest_clears"].items()
        }
    save["tables"]["session"]["rows"][0][1] = json.dumps(doc)
    return save, "client float traps coerced to decimals"


def _set_row_value(save, table, column, value):
    """Overwrite one column of the first row of a single-row table."""
    table_data = save["tables"].get(table)
    if not table_data or not table_data.get("rows"):
        return
    cols = table_data.get("cols", [])
    if column in cols:
        table_data["rows"][0][cols.index(column)] = value


def fresh_roster(save):
    """Empty the character roster and squads (a fresh-account roster)."""
    save = copy.deepcopy(save)
    doc = json.loads(save["tables"]["session"]["rows"][0][1])
    doc["chrdata"] = []
    doc["teamMembers"] = [0] * 90
    doc["teamMembers_VS"] = [0] * 18
    doc["teamBuddies_VS"] = [0] * 18
    save["tables"]["session"]["rows"][0][1] = json.dumps(doc)
    # Emptied too: reTB re-adds characters-table rows to the roster on load.
    if "characters" in save["tables"]:
        save["tables"]["characters"]["rows"] = []
    save["rows"] = sum(len(t.get("rows", [])) for t in save["tables"].values())
    return save, "chrdata + characters table + squads emptied"


def no_items(save):
    """Zero the whole item inventory."""
    save = copy.deepcopy(save)
    doc = json.loads(save["tables"]["session"]["rows"][0][1])
    doc["itemList"] = [0] * 181
    save["tables"]["session"]["rows"][0][1] = json.dumps(doc)
    return save, "itemList zeroed"


def minimal_progress(save):
    """Reset story progression to a fresh account (chapter 1, no clears)."""
    save = copy.deepcopy(save)
    doc = json.loads(save["tables"]["session"]["rows"][0][1])
    doc["progressCode"] = 16777216
    doc["worldProgressCode"] = {"0": 16777216}
    doc["extra_quest_clears"] = {}
    doc["questClearDate"] = {}
    doc["_last_quest_chapter"] = 0
    doc["_last_quest_section"] = 0
    save["tables"]["session"]["rows"][0][1] = json.dumps(doc)
    _set_row_value(save, "user_progression", "chapter", 0)
    _set_row_value(save, "user_progression", "section", 0)
    _set_row_value(save, "user_progression", "quest_clear_date_json", "{}")
    return save, "progressCode/quest clears reset to chapter 1"


STRIPS = (
    ("01-float-dates", fix_float_traps),
    ("02-fresh-roster", fresh_roster),
    ("03-no-items", no_items),
    ("04-minimal-progress", minimal_progress),
)


def build_variants(save):
    """Return ``[(name, variant_save, description), ...]``.

    Every variant carries the float-trap fix so a boot names the REMOVED area,
    not the trap: 01 changes nothing else (the fix alone), 02..04 each drop
    one further chunk ON TOP of the fix, so the first variant that boots
    localizes the fault.
    """
    fixed, fix_description = fix_float_traps(save)
    variants = [("01-float-dates", fixed, fix_description)]
    for name, strip in STRIPS[1:]:
        variant, description = strip(fixed)
        variants.append((name, variant, f"{fix_description} + {description}"))
    return variants


def write_variants(save_path, out_dir=None):
    with open(save_path, "r", encoding="utf-8") as handle:
        save = json.load(handle)
    out_dir = out_dir or os.path.splitext(save_path)[0] + "-bisect"
    os.makedirs(out_dir, exist_ok=True)

    lines = ["Stripped savefile variants (import with the game closed,", "in this order, until one boots):", ""]
    for name, variant, description in build_variants(save):
        path = os.path.join(out_dir, f"{name}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(variant, handle, indent=2)
        lines.append(f"  {name}.json -- {description}")
        print(f"wrote {path} ({description})")
    lines += [
        "",
        "If 01 boots: the original save only needed the float fix -- re-convert",
        "with the updated tool instead, it now applies this automatically.",
        "If 01 hangs but 02 boots: the fault is elsewhere in the character",
        "roster. 03 / 04 localize items / story progress the same way.",
    ]
    with open(os.path.join(out_dir, "README.txt"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    print(f"wrote {os.path.join(out_dir, 'README.txt')}")
    return out_dir


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    write_variants(sys.argv[1], sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "-o" else None)
