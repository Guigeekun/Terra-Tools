import os
import re
import sys
import json
import zipfile
import subprocess
from pathlib import Path

# Load config
config_path = Path("config.json")
if config_path.exists():
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
else:
    config = {
        "dump_cs_path": "user-data/dump.cs",
        "apk_path": "local-input/terra-battle-5.5.7-170.apk",
        "lib_path": "user-data/libil2cpp.so",
        "objdump_cmd": "llvm-objdump",
        "stages_layout_path": "user-data/extracted-gamedata/game_data/StagesLayout.json"
    }

dump_cs_path = Path(config.get("dump_cs_path", "user-data/dump.cs"))
apk_path = Path(config.get("apk_path", "local-input/terra-battle-5.5.7-170.apk"))
lib_path = Path(config.get("lib_path", "user-data/libil2cpp.so"))
objdump_cmd = config.get("objdump_cmd", "llvm-objdump")
stages_layout_path = Path(config.get("stages_layout_path", "user-data/extracted-gamedata/game_data/StagesLayout.json"))

# Verify prerequisites and look for fallback dump.cs locations if needed
if not dump_cs_path.exists():
    fallback_paths = [
        Path("user-data/dump.cs"),
        Path("../project-liminal-gate/user-data/il2cpp/dump.cs"),
        Path("g:/Terra/project-liminal-gate/user-data/il2cpp/dump.cs"),
    ]
    for p in fallback_paths:
        if p.exists():
            print(f"Found dump.cs at fallback location: {p}")
            dump_cs_path.parent.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.copy2(p, dump_cs_path)
            print(f"Copied {p} -> {dump_cs_path}")
            break

if not dump_cs_path.exists():
    print(f"Error: dump.cs not found at {dump_cs_path}")
    print("Please copy it there or configure its path in config.json.")
    sys.exit(1)

if not apk_path.exists() and not lib_path.exists():
    print(f"Error: Neither APK ({apk_path}) nor extracted libil2cpp ({lib_path}) exists.")
    sys.exit(1)

# 1. Extract libil2cpp.so if not already present
if not lib_path.exists():
    print(f"Extracting libil2cpp.so from {apk_path} to {lib_path}...")
    lib_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(apk_path) as z:
        try:
            with z.open("lib/arm64-v8a/libil2cpp.so") as src, open(lib_path, "wb") as dest:
                dest.write(src.read())
            print("Successfully extracted libil2cpp.so.")
        except KeyError:
            print("Error: APK does not contain lib/arm64-v8a/libil2cpp.so.")
            sys.exit(1)

enemy_db_path = stages_layout_path.parent / "EnemyData.json"
enemy_list = []
if enemy_db_path.exists():
    try:
        with open(enemy_db_path, "r", encoding="utf-8") as f:
            enemy_list = json.load(f).get("data", [])
        print(f"Loaded EnemyData.json with {len(enemy_list)} enemy records.")
    except Exception as e:
        print(f"Warning: Could not read EnemyData.json: {e}")

def resolve_enemy_by_val(val):
    if 1 <= val <= len(enemy_list):
        edata = enemy_list[val - 1]
        return edata.get("ID"), enemies_by_id.get(val, f"E_{val}")
    return val, enemies_by_id.get(val, f"UNKNOWN_{val}")

def resolve_enemy_by_var(var_name):
    val = enemies.get(var_name)
    if not val:
        cleaned = re.sub(r'(_FIRST|_SECOND|_B|\d+)$', '', var_name)
        val = enemies.get(cleaned)
    if not val:
        base = re.sub(r'\d+$', '', var_name)
        val = enemies.get(base)
    if val:
        return resolve_enemy_by_val(val)
    return None, var_name

# 2. Parse Enemies and all RVAs from dump.cs
print("Parsing dump.cs for Enemies, RVAs, and generator classes...")
enemies = {}
enemies_by_id = {}
inside_enemies = False
all_rvas = set()

generators = [] # list of dicts: chapter, section, wave, rva, class_name
current_class = None
class_is_generator = False
generator_chapter = None
generator_section = None
generator_wave = None

slot_maps = {"ChapterBase": {}}
current_slots_type = None

# Regex patterns
class_decl_re = re.compile(
    r"^(?:public|private|internal|protected)?\s*"
    r"(?:sealed\s+|static\s+|abstract\s+)*"
    r"(?:class|struct|interface|enum)\s+(.+?)"
    r"(?:\s*:\s*.*?)?\s*// TypeDefIndex: \d+$"
)
rva_slot_re = re.compile(r"^\s*// RVA: 0x([0-9A-Fa-f]+).*?(?: Slot: (\d+))?$")

pending_rva_slot = None
with open(dump_cs_path, "r", encoding="utf-8", errors="replace") as f:
    for line_idx, line in enumerate(f):
        rva_match = re.search(r"// RVA: 0x([0-9A-Fa-f]+)", line)
        if rva_match:
            all_rvas.add(int(rva_match.group(1), 16))

        if not inside_enemies:
            if "enum Enemies" in line:
                inside_enemies = True
                continue
        else:
            if line.startswith("}"):
                inside_enemies = False
            else:
                enemy_match = re.search(r"Enemies\s+(\w+)\s*=\s*(-?\d+)\s*;", line)
                if enemy_match:
                    e_name = enemy_match.group(1)
                    e_id = int(enemy_match.group(2))
                    enemies[e_name] = e_id
                    enemies_by_id[e_id] = e_name
                continue

        class_match = class_decl_re.match(line)
        if class_match:
            current_class = class_match.group(1)
            class_is_generator = False
            generator_chapter = None
            generator_section = None
            generator_wave = None

            current_slots_type = None
            if current_class == "ChapterBase":
                current_slots_type = "ChapterBase"
            elif re.match(r"^Chapter\d+$", current_class):
                current_slots_type = current_class
                if current_slots_type not in slot_maps:
                    slot_maps[current_slots_type] = {}

            if current_class.endswith(".$"):
                gen_match = re.match(
                    r"^Chapter(\d+)\.\$*Battle(\d+)_(\d+).*?\.\$$",
                    current_class
                )
                if gen_match:
                    class_is_generator = True
                    generator_chapter = int(gen_match.group(1))
                    generator_section = int(gen_match.group(2))
                    generator_wave = int(gen_match.group(3))

            pending_rva_slot = None
            continue

        rva_slot_match = rva_slot_re.match(line)
        if rva_slot_match:
            pending_rva_slot = (
                int(rva_slot_match.group(1), 16),
                int(rva_slot_match.group(2)) if rva_slot_match.group(2) else None
            )
            continue

        if pending_rva_slot is not None:
            stripped = line.strip()
            if stripped.endswith("{ }") and "(" in stripped:
                rva, slot = pending_rva_slot
                method_part = stripped[:-3].strip()
                method_name_sig = method_part.split("(", 1)
                method_name = method_name_sig[0].rsplit(" ", 1)[-1]

                params_str = method_name_sig[1].rstrip(")") if len(method_name_sig) > 1 else ""
                param_names = [p.strip().split()[-1] for p in params_str.split(",") if p.strip()]

                if current_slots_type and slot is not None:
                    slot_maps[current_slots_type][slot] = (method_name, param_names)

                if class_is_generator and "bool MoveNext()" in stripped:
                    generators.append({
                        "chapter": generator_chapter,
                        "section": generator_section,
                        "wave": generator_wave,
                        "rva": rva,
                        "class_name": current_class
                    })

                pending_rva_slot = None

sorted_rvas = sorted(list(all_rvas))
rva_successors = {}
for i in range(len(sorted_rvas) - 1):
    rva_successors[sorted_rvas[i]] = sorted_rvas[i+1]

print(f"Loaded {len(enemies)} enemies from dump.cs")
print(f"Loaded {len(all_rvas)} RVAs from dump.cs")
print(f"Discovered {len(generators)} battle generator MoveNext methods.")

# 3. Disassemble each generator and extract spawns
extracted_layouts = {} # chapter -> section -> wave -> list of enemy spawns

print("Starting layout extraction via llvm-objdump...")
for idx, gen in enumerate(generators):
    chapter = gen["chapter"]
    section = gen["section"]
    wave = gen["wave"]
    start_rva = gen["rva"]

    chap_name = f"Chapter{chapter}"
    chapter_slots = slot_maps.get("ChapterBase", {}).copy()
    if chap_name in slot_maps:
        chapter_slots.update(slot_maps[chap_name])

    stop_rva = rva_successors.get(start_rva, start_rva + 0x1000)

    cmd = [objdump_cmd, "--disassemble", f"--start-address={start_rva}", f"--stop-address={stop_rva}", str(lib_path)]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except (subprocess.CalledProcessError, OSError) as e:
        print(f"Error running objdump for RVA {hex(start_rva)}: {e}")
        continue

    registers = {}
    x9_offset = None
    spawns = []

    for line in res.stdout.splitlines():
        match = re.match(r"^\s*([0-9a-f]+):\s+[0-9a-f]+\s+([.\w]+)\s*(.*?)\s*$", line, re.I)
        if not match:
            continue
        addr_hex, mnemonic, operands = match.group(1), match.group(2).lower(), match.group(3).lower()

        if mnemonic == "mov":
            m = re.match(r"[wx](\d+),\s*([wx]zr)", operands)
            if m:
                registers[int(m.group(1))] = 0
            else:
                m = re.match(r"[wx](\d+),\s*#0x([0-9a-f]+)", operands)
                if m:
                    registers[int(m.group(1))] = int(m.group(2), 16)
                else:
                    m = re.match(r"[wx](\d+),\s*#(\d+)", operands)
                    if m:
                        registers[int(m.group(1))] = int(m.group(2))
                    else:
                        m = re.match(r"[wx](\d+),\s*[wx](\d+)", operands)
                        if m:
                            registers[int(m.group(1))] = registers.get(int(m.group(2)), 0)
        elif mnemonic == "orr":
            m = re.match(r"[wx](\d+),\s*[wx]zr,\s*#0x([0-9a-f]+)", operands)
            if m:
                registers[int(m.group(1))] = int(m.group(2), 16)
            else:
                m = re.match(r"[wx](\d+),\s*[wx]zr,\s*#(\d+)", operands)
                if m:
                    registers[int(m.group(1))] = int(m.group(2))
        elif mnemonic == "ldr":
            m = re.match(r"x9,\s*\[x\d+,\s*#0x([0-9a-f]+)\]", operands)
            if m:
                x9_offset = int(m.group(1), 16)
            elif re.match(r"x9,\s*\[x\d+\]", operands):
                x9_offset = 0
        elif mnemonic == "blr":
            if "x9" in operands and x9_offset is not None:
                # Correct VTable base offset: In ARM64 IL2CPP, ChapterX_c vtable starts at offset 0x110 (272)
                slot = (x9_offset - 0x110) // 16
                slot_info = chapter_slots.get(slot)

                if slot in (66, 67, 68):
                    # CreateParty / CreateExtraParty / CreatePartyForMultiplay - player characters, ignore!
                    pass
                elif slot in (69, 70, 71, 72):
                    val = registers.get(3, 0)
                    enemy_id, enemy_var = resolve_enemy_by_val(val)
                    x = registers.get(1, 0)
                    y = registers.get(2, 0)
                    spawns.append({
                        "enemy_var": enemy_var,
                        "enemy_id": enemy_id,
                        "x": x,
                        "y": y,
                        "vid": len(spawns) + 1
                    })
                elif slot_info:
                    method_name, param_names = slot_info
                    x = registers.get(1, 0)
                    y = registers.get(2, 0)

                    if method_name.startswith("Init_"):
                        enemy_var = method_name[len("Init_"):]
                        enemy_id, resolved_var = resolve_enemy_by_var(enemy_var)
                        vid = registers.get(3, 0) if "vid" in param_names else (len(spawns) + 1)

                        spawns.append({
                            "enemy_var": enemy_var,
                            "enemy_id": enemy_id,
                            "x": x,
                            "y": y,
                            "vid": vid
                        })
                    elif method_name == "CreateEnemy" or method_name.startswith("CreateEnemyAt"):
                        val = registers.get(3, 0)
                        enemy_id, enemy_var = resolve_enemy_by_val(val)
                        vid = len(spawns) + 1

                        spawns.append({
                            "enemy_var": enemy_var,
                            "enemy_id": enemy_id,
                            "x": x,
                            "y": y,
                            "vid": vid
                        })
                x9_offset = None

    if spawns:
        extracted_layouts.setdefault(chapter, {}).setdefault(section, {})[wave] = spawns

print(f"Extracted enemy layouts across {len(extracted_layouts)} chapters.")

# 4. Merge into existing StagesLayout.json
print("Merging extracted layouts into StagesLayout.json...")
existing_layouts = {}
if stages_layout_path.exists():
    try:
        with open(stages_layout_path, "r", encoding="utf-8") as f:
            existing_layouts = json.load(f)
        print(f"Loaded existing StagesLayout.json with {len(existing_layouts)} chapters.")
    except Exception as e:
        print(f"Warning: Could not read existing StagesLayout.json: {e}. Starting fresh.")

total_merged_spawns = 0
for chapter, sections in extracted_layouts.items():
    ch_key = str(chapter)
    if ch_key not in existing_layouts:
        existing_layouts[ch_key] = {}

    for section, waves in sections.items():
        sec_key = str(section)
        waves_list = []

        for wave_idx in sorted(waves.keys()):
            spawns_for_wave = waves[wave_idx]
            total_merged_spawns += len(spawns_for_wave)
            waves_list.append({
                "type": "wave",
                "wave_index": wave_idx,
                "battle_name": f"Battle{section}_{wave_idx}",
                "bgID": 0,
                "bgmID": 0,
                "enemies": spawns_for_wave
            })

        existing_layouts[ch_key][sec_key] = waves_list

stages_layout_path.parent.mkdir(parents=True, exist_ok=True)
with open(stages_layout_path, "w", encoding="utf-8") as f:
    json.dump(existing_layouts, f, indent=2, sort_keys=True)

print(f"Successfully wrote updated StagesLayout.json to {stages_layout_path}!")
print(f"Total enemy spawns merged: {total_merged_spawns}")
sorted_ch_keys = sorted(list(existing_layouts.keys()), key=lambda x: int(x) if x.isdigit() else 9999)
print(f"Chapters now in layout database: {len(sorted_ch_keys)} chapters")
