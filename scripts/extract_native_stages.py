import os
import re
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
        "dump_cs_path": "local-input/dump.cs",
        "apk_path": "local-input/terra-battle-5.5.7-170.apk",
        "lib_path": "user-data/libil2cpp.so",
        "objdump_cmd": "llvm-objdump",
        "stages_layout_path": "user-data/extracted-gamedata/game_data/StagesLayout.json"
    }

dump_cs_path = Path(config["dump_cs_path"])
apk_path = Path(config["apk_path"])
lib_path = Path(config["lib_path"])
objdump_cmd = config["objdump_cmd"]
stages_layout_path = Path(config["stages_layout_path"])

# Verify prerequisites
if not dump_cs_path.exists():
    print(f"Error: dump.cs not found at {dump_cs_path}")
    print("Please copy it there or configure its path in config.json.")
    exit(1)

if not apk_path.exists() and not lib_path.exists():
    print(f"Error: Neither APK ({apk_path}) nor extracted libil2cpp ({lib_path}) exists.")
    exit(1)

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
            exit(1)

# 2. Parse Enemies and all RVAs from dump.cs
print("Parsing dump.cs for Enemies, RVAs, and generator classes...")
enemies = {}
inside_enemies = False
all_rvas = set()

# We will also parse generator classes in a state machine
# We need to map generator class name to its chapter, section, wave details
# Generator classes: Chapter8.$Battle3_1$25064.$
# Or: Chapter8.$Section1$25007.$
generators = [] # list of (chapter, section, wave, class_name)
current_class = None
class_is_generator = False
generator_chapter = None
generator_section = None
generator_wave = None

# Chapter method slot maps
# slot_maps[chapter_name_or_ChapterBase][slot_num] = (method_name, x_reg, y_reg, vid_reg)
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
        # Record RVA globally for method boundaries
        rva_match = re.search(r"// RVA: 0x([0-9A-Fa-f]+)", line)
        if rva_match:
            all_rvas.add(int(rva_match.group(1), 16))

        # Parse Enemies enum
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
                    enemies[enemy_match.group(1)] = int(enemy_match.group(2))
                continue

        # Stateful parsing for class definitions and their methods
        class_match = class_decl_re.match(line)
        if class_match:
            current_class = class_match.group(1)
            class_is_generator = False
            generator_chapter = None
            generator_section = None
            generator_wave = None
            
            # Check if this class is a generator we care about (Chapters 8 to 42)
            # Example: Chapter8.$Battle3_1$25064.$ or Chapter8.$Section1$25007.$
            # Pattern: class Chapter(8|9|[1-3][0-9]|4[0-2])\.\$(Battle|Section)(\d+)(?:_(\d+))?.*?\.\s*$
            # Ends with .$
            if current_class.endswith(".$"):
                gen_match = re.match(
                    r"^Chapter(8|9|[1-3][0-9]|4[0-2])\.\$*(Battle|Section)(\d+)(?:_(\d+))?.*?\.\$$",
                    current_class
                )
                if gen_match:
                    class_is_generator = True
                    generator_chapter = int(gen_match.group(1))
                    gen_type = gen_match.group(2)
                    sec_num = int(gen_match.group(3))
                    
                    if gen_type == "Section":
                        generator_section = sec_num
                        generator_wave = 1
                    else:
                        generator_section = sec_num
                        generator_wave = int(gen_match.group(4))
            
            # Reset vtable slot tracking for this class
            current_slots_type = None
            # We track slots for ChapterBase and Chapter8 through Chapter42
            if current_class == "ChapterBase":
                current_slots_type = "ChapterBase"
            else:
                chap_match = re.match(r"^Chapter(8|9|[1-3][0-9]|4[0-2])$", current_class)
                if chap_match:
                    current_slots_type = current_class
                    if current_slots_type not in slot_maps:
                        slot_maps[current_slots_type] = {}
            
            pending_rva_slot = None
            continue

        # Look for RVA/Slot inside classes
        rva_slot_match = rva_slot_re.match(line)
        if rva_slot_match:
            pending_rva_slot = (
                int(rva_slot_match.group(1), 16),
                int(rva_slot_match.group(2)) if rva_slot_match.group(2) else None
            )
            continue

        # If we have a pending method signature
        if pending_rva_slot is not None:
            stripped = line.strip()
            if stripped.endswith("{ }") and "(" in stripped:
                rva, slot = pending_rva_slot
                # Extract method name and parameters
                # Example: public override Entity Init_CH8_MECH_BAKU(int x, int y, int vid, int wait, int initialWait) { }
                method_part = stripped[:-3].strip() # remove { }
                method_name_sig = method_part.split("(", 1)
                method_name = method_name_sig[0].rsplit(" ", 1)[-1]
                
                # Parse parameter registers dynamically
                x_reg, y_reg, vid_reg = 1, 2, 3 # defaults
                if len(method_name_sig) > 1:
                    params_str = method_name_sig[1].rstrip(")")
                    # Split parameters
                    params = [p.strip() for p in params_str.split(",") if p.strip()]
                    param_names = []
                    for p in params:
                        parts = p.split()
                        if parts:
                            param_names.append(parts[-1])
                    
                    if "x" in param_names:
                        x_reg = 1 + param_names.index("x")
                    if "y" in param_names:
                        y_reg = 1 + param_names.index("y")
                    if "vid" in param_names:
                        vid_reg = 1 + param_names.index("vid")
                    else:
                        vid_reg = None # Default none if no vid param
                
                # If we are inside ChapterBase or Chapter8-42, record slot mapping
                if current_slots_type and slot is not None:
                    slot_maps[current_slots_type][slot] = (method_name, x_reg, y_reg, vid_reg)
                
                # If we are inside a generator class and this is MoveNext
                if class_is_generator and "bool MoveNext()" in stripped:
                    generators.append({
                        "chapter": generator_chapter,
                        "section": generator_section,
                        "wave": generator_wave,
                        "rva": rva,
                        "class_name": current_class
                    })
                
                pending_rva_slot = None

# Build sorted RVAs and boundary successor maps
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
    
    # Establish chapter slots
    chap_name = f"Chapter{chapter}"
    chapter_slots = slot_maps.get("ChapterBase", {}).copy()
    if chap_name in slot_maps:
        chapter_slots.update(slot_maps[chap_name])
        
    stop_rva = rva_successors.get(start_rva, start_rva + 0x20000)
    
    # Disassemble MoveNext
    cmd = [objdump_cmd, "--disassemble", f"--start-address={start_rva}", f"--stop-address={stop_rva}", str(lib_path)]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except (subprocess.CalledProcessError, OSError) as e:
        print(f"Error running objdump for RVA {hex(start_rva)}: {e}")
        continue
        
    registers = {}
    x9_offset = None
    spawns = []
    
    # Parse objdump output line by line
    for line in res.stdout.splitlines():
        match = re.match(r"^\s*([0-9a-f]+):\s+[0-9a-f]+\s+([.\w]+)\s*(.*?)\s*$", line, re.I)
        if not match:
            continue
        addr_hex, mnemonic, operands = match.group(1), match.group(2).lower(), match.group(3).lower()
        
        # Track registers
        if mnemonic == "mov":
            # mov wX, wzr -> wX = 0
            m = re.match(r"w(\d+),\s*wzr", operands)
            if m:
                registers[int(m.group(1))] = 0
            else:
                # mov wX, #val (hex or dec)
                m = re.match(r"w(\d+),\s*#0x([0-9a-f]+)", operands)
                if m:
                    registers[int(m.group(1))] = int(m.group(2), 16)
                else:
                    m = re.match(r"w(\d+),\s*#(\d+)", operands)
                    if m:
                        registers[int(m.group(1))] = int(m.group(2))
                    else:
                        # mov wX, wY
                        m = re.match(r"w(\d+),\s*w(\d+)", operands)
                        if m:
                            registers[int(m.group(1))] = registers.get(int(m.group(2)), 0)
        elif mnemonic == "orr":
            # orr wX, wzr, #val
            m = re.match(r"w(\d+),\s*wzr,\s*#0x([0-9a-f]+)", operands)
            if m:
                registers[int(m.group(1))] = int(m.group(2), 16)
            else:
                m = re.match(r"w(\d+),\s*wzr,\s*#(\d+)", operands)
                if m:
                    registers[int(m.group(1))] = int(m.group(2))
        elif mnemonic == "ldr":
            # ldr x9, [x8, #offset] or ldr x9, [x8]
            m = re.match(r"x9,\s*\[x\d+,\s*#0x([0-9a-f]+)\]", operands)
            if m:
                x9_offset = int(m.group(1), 16)
            elif re.match(r"x9,\s*\[x\d+\]", operands):
                x9_offset = 0
        elif mnemonic == "blr":
            m = re.match(r"x9", operands)
            if m and x9_offset is not None:
                slot = (x9_offset - 0x110) // 16
                slot_info = chapter_slots.get(slot)
                if slot_info:
                    method_name, x_reg, y_reg, vid_reg = slot_info
                    if method_name.startswith("Init_"):
                        enemy_var = method_name[len("Init_"):]
                        enemy_id = enemies.get(enemy_var)
                        
                        x = registers.get(x_reg, 0)
                        y = registers.get(y_reg, 0)
                        vid = registers.get(vid_reg, 0) if vid_reg is not None else 0
                        
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

# 4. Merge into existing StagesLayout.json
print("Merging extracted layouts into StagesLayout.json...")
existing_layouts = {}
if stages_layout_path.exists():
    try:
        with open(stages_layout_path, "r", encoding="utf-8") as f:
            existing_layouts = json.load(f)
        print(f"Loaded existing StagesLayout.json with chapters: {list(existing_layouts.keys())}")
    except Exception as e:
        print(f"Warning: Could not read existing StagesLayout.json: {e}. Starting fresh.")

# Merge extracted native stages (Chapters 8 to 42)
for chapter, sections in extracted_layouts.items():
    ch_key = str(chapter)
    existing_layouts[ch_key] = {}
    
    for section, waves in sections.items():
        sec_key = str(section)
        waves_list = []
        
        # Sort waves by index
        for wave_idx in sorted(waves.keys()):
            waves_list.append({
                "wave_index": wave_idx,
                "battle_name": f"Battle{wave_idx}",
                "enemies": waves[wave_idx]
            })
        
        existing_layouts[ch_key][sec_key] = waves_list

# Save updated StagesLayout.json
stages_layout_path.parent.mkdir(parents=True, exist_ok=True)
with open(stages_layout_path, "w", encoding="utf-8") as f:
    json.dump(existing_layouts, f, indent=2, sort_keys=True)

print(f"Successfully wrote updated StagesLayout.json to {stages_layout_path}!")
print(f"Chapters now in layout database: {sorted(list(int(k) for k in existing_layouts.keys()))}")
