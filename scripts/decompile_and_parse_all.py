import os
import re
import json
import subprocess
import zipfile
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
APK_PATH = BASE_DIR / "local-input" / "terra-battle-5.5.7-170.apk"
LUAC_DIR = BASE_DIR / "user-data" / "extracted-gamedata" / "text_assets"
DECOMP_DIR = BASE_DIR / "user-data" / "decompiled_luac"
DECOMPILER_EXE = BASE_DIR / "scripts" / "Decompiler.exe"
ENEMY_DB_PATH = BASE_DIR / "user-data" / "extracted-gamedata" / "game_data" / "EnemyData.json"
OUTPUT_LAYOUT_PATH = BASE_DIR / "user-data" / "extracted-gamedata" / "game_data" / "StagesLayout.json"

DECOMP_DIR.mkdir(parents=True, exist_ok=True)

# Step 1: Extract the Enemies enum from global-metadata.dat
def get_enemies_enum():
    print("Extracting Enemies enum from global-metadata.dat...")
    if not APK_PATH.exists():
        print(f"Error: APK not found at {APK_PATH}")
        return []
        
    with zipfile.ZipFile(APK_PATH) as archive:
        metadata = archive.read("assets/bin/Data/Managed/Metadata/global-metadata.dat")
        
    idx = metadata.find(b"CH1_BAKUROU")
    if idx == -1:
        print("Error: CH1_BAKUROU not found in metadata.")
        return []
        
    sub = metadata[idx:]
    parts = sub.split(b"\x00")
    
    enum_names = []
    for p in parts:
        name = p.decode(errors="replace").strip()
        if not name:
            continue
        if name == "NumberOfEnemies":
            break
        enum_names.append(name)
        if len(enum_names) >= 2500: # safety break
            break
            
    print(f"Extracted {len(enum_names)} enum constants.")
    return enum_names

# Step 2: Compile a mapping of EnumName -> EnemyID (1-based index)
def build_enum_to_id_map(enum_names):
    enum_to_id = {}
    for i, name in enumerate(enum_names):
        enum_to_id[name] = i + 1
    return enum_to_id

# Step 3: Decompile all Chapter*.luac files
def decompile_all_chapters():
    print("Decompiling all Chapter*.luac files...")
    if not DECOMPILER_EXE.exists():
        print(f"Error: Decompiler.exe not found at {DECOMPILER_EXE}")
        return
        
    luac_files = list(LUAC_DIR.glob("Chapter*.luac"))
    print(f"Found {len(luac_files)} compiled chapter files.")
    
    for f in luac_files:
        out_path = DECOMP_DIR / f"{f.stem}_decompiled.txt"
        print(f"  Decompiling {f.name} -> {out_path.name}")
        try:
            subprocess.run([str(DECOMPILER_EXE), str(f), str(out_path)], check=True, stdout=subprocess.PIPE)
        except Exception as e:
            print(f"  Failed to decompile {f.name}: {e}")

# Step 4: Parse decompiled files
def parse_decompiled_file(filepath, enum_to_id):
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Split into functions
    functions = {}
    current_fn = None
    fn_lines = []

    for line in lines:
        line = line.strip()
        if line.startswith("META"):
            if current_fn and fn_lines:
                functions[current_fn] = fn_lines
            parts = re.split(r"\s+", line)
            if len(parts) >= 4:
                current_fn = parts[3]
            else:
                current_fn = None
            fn_lines = []
        elif current_fn:
            fn_lines.append(line)
            
    if current_fn and fn_lines:
        functions[current_fn] = fn_lines

    # Extract helper function enemy mappings
    helper_enemy_map = {}
    for fn_name, fn_lines in functions.items():
        if fn_name.startswith("Init_"):
            stack = []
            enemy_id_str = None
            for line in fn_lines:
                parts = re.split(r"\s+", line)
                op = parts[0]
                if op == "LITERAL":
                    val = parts[1] if len(parts) > 1 else None
                    try:
                        val = int(val)
                    except ValueError:
                        pass
                    stack.append(val)
                elif op in ("INDEX", "INDEXN", "UPVALUE", "LOCAL"):
                    val = parts[1] if len(parts) > 1 else None
                    if val and val.startswith('"') and val.endswith('"'):
                        val = val[1:-1]
                    stack.append(val)
                elif op == "CALL":
                    num_args = int(parts[1])
                    args = []
                    for _ in range(num_args):
                        if stack:
                            args.insert(0, stack.pop())
                    fn_called = stack.pop() if stack else None
                    if fn_called == "CreateEnemy":
                        if len(args) >= 3:
                            enemy_id_str = args[2]
            if enemy_id_str:
                helper_enemy_map[fn_name] = enemy_id_str

    # Extract ordered section sequences: interleaved story events + battle calls
    sections = {}  # fn_name -> list of {'type': 'story'|'battle', ...}
    for fn_name, fn_lines in functions.items():
        if fn_name.startswith("Section") and not fn_name.startswith("SectionReached"):
            sequence = []  # ordered mix of story/battle items
            pending_tokens = []

            # Collect all INDEX string tokens in order
            for line in fn_lines:
                parts = re.split(r"\s+", line)
                op = parts[0] if parts else ""
                if op == "INDEX" and len(parts) > 1:
                    val = parts[1]
                    if val.startswith('"') and val.endswith('"'):
                        val = val[1:-1]
                    pending_tokens.append(val)

            # Walk tokens and reconstruct the chronological call sequence
            j = 0
            while j < len(pending_tokens):
                tok = pending_tokens[j]
                if tok in ("StartEvent", "StartEvents"):
                    j += 1
                    while j < len(pending_tokens) and pending_tokens[j] not in (
                        "StartEvent", "StartEvents", "StartBattle",
                        "SelectTeam", "RegisterEnemies", "RegisterSections",
                        "SectionReached", "RegisterSectionTitles", "SetBG"
                    ):
                        sid = pending_tokens[j]
                        # Include any scenario-looking ID (CH_XX_YY, PR1, LUCK_*, etc.)
                        if re.match(r'^(CH_|PR\d|LUCK_|[A-Z]{2,}_)', sid):
                            sequence.append({"type": "story", "scenarioID": sid})
                        j += 1
                elif tok == "StartBattle":
                    j += 1
                    battle_names = []
                    while j < len(pending_tokens) and pending_tokens[j] not in (
                        "StartEvent", "StartEvents", "StartBattle",
                        "SelectTeam", "RegisterEnemies", "RegisterSections",
                        "SectionReached", "RegisterSectionTitles", "SetBG"
                    ):
                        b = pending_tokens[j]
                        if "Battle" in b:
                            battle_names.append(b)
                        j += 1
                    if battle_names:
                        sequence.append({"type": "battle", "battles": battle_names})
                else:
                    j += 1

            if sequence:
                sections[fn_name] = sequence

    # Extract chapter background ID from Init function (SetBG <id>)
    chapter_bg = 0
    init_lines = functions.get("Init", [])
    for i, line in enumerate(init_lines):
        if "INDEX" in line and '"SetBG"' in line:
            for j in range(i + 1, min(len(init_lines), i + 4)):
                if init_lines[j].startswith("LITERAL"):
                    p = re.split(r"\s+", init_lines[j])
                    if len(p) > 1 and p[1].isdigit():
                        chapter_bg = int(p[1])
                        break

    # Extract spawns and BGM for each battle function
    battles_spawns = {}
    battle_bgms = {}
    for fn_name, fn_lines in functions.items():
        if "Battle" in fn_name and not fn_name.startswith("StartBattle"):
            spawns = []
            stack = []
            bgm_id = 0
            for i, line in enumerate(fn_lines):
                if "INDEX" in line and '"PlayBGM"' in line:
                    for j in range(i + 1, min(len(fn_lines), i + 4)):
                        if fn_lines[j].startswith("LITERAL"):
                            p = re.split(r"\s+", fn_lines[j])
                            if len(p) > 1:
                                val = p[1].strip('"')
                                m = re.search(r'BGM_?(\d+)', val, re.IGNORECASE)
                                if m:
                                    bgm_id = int(m.group(1))
                                    break

                parts = re.split(r"\s+", line)
                op = parts[0]
                if op == "LITERAL":
                    val = parts[1] if len(parts) > 1 else None
                    try:
                        val = int(val)
                    except (ValueError, TypeError):
                        pass
                    stack.append(val)
                elif op in ("INDEX", "INDEXN", "UPVALUE", "LOCAL"):
                    val = parts[1] if len(parts) > 1 else None
                    if val and val.startswith('"') and val.endswith('"'):
                        val = val[1:-1]
                    stack.append(val)
                elif op == "CALL":
                    num_args = int(parts[1])
                    args = []
                    for _ in range(num_args):
                        if stack:
                            args.insert(0, stack.pop())
                    fn_called = stack.pop() if stack else None

                    x, y, enemy_id_str, vid = None, None, None, None
                    if fn_called == "CreateEnemy":
                        if len(args) >= 4:
                            x, y, enemy_id_str, vid = args[0], args[1], args[2], args[3]
                    elif fn_called in helper_enemy_map:
                        if len(args) >= 3:
                            x, y, vid = args[0], args[1], args[2]
                            enemy_id_str = helper_enemy_map[fn_called]
                    elif isinstance(fn_called, str) and fn_called.startswith("Init_"):
                        enemy_id_str = fn_called.replace("Init_", "")
                        if len(args) >= 3:
                            x, y, vid = args[0], args[1], args[2]

                    if enemy_id_str is not None:
                        numeric_id = enum_to_id.get(enemy_id_str)
                        spawns.append({
                            "enemy_var": enemy_id_str,
                            "enemy_id": numeric_id,
                            "x": x,
                            "y": y,
                            "vid": vid
                        })
            battles_spawns[fn_name] = spawns
            if bgm_id > 0:
                battle_bgms[fn_name] = bgm_id

    # Combine: expand battle items into waves with enemy spawns, bgID, and bgmID
    layout = {}
    for sec_name, sequence in sections.items():
        result_items = []
        wave_counter = 0
        for item in sequence:
            if item["type"] == "story":
                result_items.append({"type": "story", "scenarioID": item["scenarioID"]})
            elif item["type"] == "battle":
                for b_name in item["battles"]:
                    wave_counter += 1
                    spawns = battles_spawns.get(b_name, [])
                    w_bgm = battle_bgms.get(b_name, 0)
                    result_items.append({
                        "type": "wave",
                        "wave_index": wave_counter,
                        "battle_name": b_name,
                        "bgID": chapter_bg,
                        "bgmID": w_bgm,
                        "enemies": spawns
                    })

        # Normalize section index
        match = re.search(r"\d+", sec_name)
        sec_idx = int(match.group()) if match else None
        if sec_idx is not None:
            layout[str(sec_idx)] = result_items

    return layout

def main():
    enum_names = get_enemies_enum()
    if not enum_names:
        return
        
    enum_to_id = build_enum_to_id_map(enum_names)
    decompile_all_chapters()
    
    decompiled_files = list(DECOMP_DIR.glob("Chapter*_decompiled.txt"))
    print(f"Parsing {len(decompiled_files)} decompiled text files...")
    
    stages_layout = {}
    for f in decompiled_files:
        # Extract chapter number, e.g., Chapter1_decompiled.txt -> 1
        match = re.search(r"Chapter(\d+)", f.name)
        if match:
            chapter_no = match.group(1)
            # Parse chapter
            layout = parse_decompiled_file(f, enum_to_id)
            if layout:
                stages_layout[chapter_no] = layout
                
    # Save output JSON
    with open(OUTPUT_LAYOUT_PATH, "w", encoding="utf-8") as out_f:
        json.dump(stages_layout, out_f, indent=2, ensure_ascii=False)
    print(f"Saved complete stages layout database to: {OUTPUT_LAYOUT_PATH}")

if __name__ == "__main__":
    main()
