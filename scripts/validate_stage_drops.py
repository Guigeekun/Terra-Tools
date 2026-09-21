"""Validate the generated StageDrops.json against the game databases.

Checks every extracted stage-drop entry for internal consistency:
  - the chapter and section exist in BattleData
  - the enemy spawns in that section of StagesLayout.json
  - the item id exists in ItemSet.json
  - rates are sane percentages
Additionally spot-checks the Eidolon strengthening cards against the drop
rates documented on the community wiki (test fixture only; nothing here is
served by the app).

Usage:
    py -3 scripts/validate_stage_drops.py
"""

import json
import os
import sys

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "user-data", "extracted-gamedata", "game_data")

# Wiki fixture: item id -> {(chapter, section, enemy_var): rate%}
WIKI_EXPECTATIONS = {
    59: {(4000, 1, "MS_Artemis"): 30, (4002, 1, "MS_Valkyrie"): 30, (4008, 1, "MS_Odin"): 30, (4010, 1, "MS_Apollo"): 30},
    60: {(4001, 1, "MS_Chaos"): 30, (4003, 1, "MS_Lamia"): 30, (4005, 1, "MS_Phoenix"): 30,
         (4007, 1, "MS_Buhamut"): 30, (4009, 1, "MS_Levia"): 30, (4011, 1, "MS_Selene"): 30},
    61: {(4002, 2, "MS_Valkyrie2"): 40},
    62: {(4008, 2, "MS_Odin2"): 40},
    63: {(4000, 2, "MS_Artemis2"): 40},
    65: {(4007, 2, "MS_Buhamut2"): 40},
    66: {(4009, 2, "MS_Levia2"): 40},
    67: {(4001, 2, "MS_Chaos2"): 40},
    68: {(4004, 2, "MS_Raijin2"): 40},
    69: {(4005, 2, "MS_Phoenix2"): 40},
    70: {(4003, 1, "MS_Lamia"): 25},
    71: {(4002, 3, "MS_Valkyrie3"): 80},
    72: {(4008, 3, "MS_Odin3"): 80},
    73: {(4000, 3, "MS_Artemis3"): 80},
    74: {(4007, 3, "MS_Buhamut3"): 80},
    75: {(4009, 3, "MS_Levia3"): 80},
    76: {(4004, 3, "MS_Raijin3"): 80},
    77: {(4001, 3, "MS_Chaos3"): 80},
    79: {(4005, 3, "MS_Phoenix3"): 80},
}


def main():
    stage_drops = json.load(open(os.path.join(BASE, "StageDrops.json"), encoding="utf-8"))
    battles = json.load(open(os.path.join(BASE, "BattleData.json"), encoding="utf-8"))
    layout = json.load(open(os.path.join(BASE, "StagesLayout.json"), encoding="utf-8"))
    items = json.load(open(os.path.join(BASE, "ItemSet.json"), encoding="utf-8"))["itemSet"]

    chapters_by_no = {ch["chapterNo"]: ch for ch in battles["chapters"]}

    errors = []
    checked = 0
    for chapter_no, sections in stage_drops.items():
        for section, records in sections.items():
            cno, sno = int(chapter_no), int(section)
            ch = chapters_by_no.get(cno)
            if not ch or sno > len(ch.get("sections", [])):
                errors.append(f"chapter {cno} has no quest section {sno}")
                continue
            for rec in records:
                checked += 1
                item_id, eid, ratio = rec.get("item_id"), rec.get("enemy_id"), rec.get("ratio")
                if not (isinstance(item_id, int) and 1 <= item_id <= len(items)):
                    errors.append(f"{cno}-{sno}: bad item id {item_id}")
                if not (isinstance(ratio, (int, float)) and 0 <= ratio <= 100):
                    errors.append(f"{cno}-{sno}: bad ratio {ratio} for item {item_id}")
                battle_index = str(rec.get("battle_index", section))
                layout_spawns = {
                    sp.get("enemy_id")
                    for wave in layout.get(chapter_no, {}).get(battle_index, [])
                    for sp in wave.get("enemies", [])
                }
                if eid not in layout_spawns:
                    errors.append(f"{cno}-{sno}: enemy {eid} ({rec.get('enemy_var')}) "
                                  f"does not spawn in battle {battle_index}")

    # Wiki spot checks (per-item effective rates).
    for item_id, expectations in WIKI_EXPECTATIONS.items():
        extracted = {}
        for chapter_no, sections in stage_drops.items():
            for section, records in sections.items():
                for rec in records:
                    if rec.get("item_id") == item_id:
                        extracted[(int(chapter_no), int(section), rec.get("enemy_var"))] = rec.get("ratio")
        for key, rate in expectations.items():
            if key not in extracted:
                errors.append(f"wiki check: item {item_id} missing at {key}")
            elif extracted[key] != rate:
                errors.append(f"wiki check: item {item_id} at {key} is {extracted[key]}%, expected {rate}%")

    print(f"Checked {checked} stage-drop entries plus {len(WIKI_EXPECTATIONS)} wiki fixtures.")
    if errors:
        print(f"\n{len(errors)} PROBLEM(S):")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("StageDrops.json validated OK.")


if __name__ == "__main__":
    main()
