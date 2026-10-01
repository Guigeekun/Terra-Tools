#  TerraTools
<img src="frontend/public/TerraToolbox.png" width="200" height="200" align="center" alt="Terra Toolbox Icon">
An interactive web-based toolbox for *Terra Battle*.

Browse the game's assets and databases, explore chapters and battle layouts, experience the story with its original art and music, listen to the extracted soundtrack, edit and convert save files — and follow the built-in docs to set up your own server emulator.

Live version : https://terratools.ggkfigment.fr/
---

## Key Features

### 1. Asset & Database Browsing
* **Characters**: full character database — stats, classes, skills, and rarities, with job artwork.
* **Companions**: companion (buddy) metadata, stats and granted skills, with thumbnails and full artwork.
* **Skills**: every skill lists its potential sources — characters (with granting jobs), companions, and enemies (aggregated variants, boss-flagged) — with clickable links.
* **Items**: browse all game items with their "Where to Obtain" drop sources.
* **Bestiary**: every enemy grouped by name with all its level variants — per-variant stats, skills, resistances, loot (including event-boss drop tables) and clickable stage occurrences.
* Server-side filtering (source type, element, skill kind, trigger type, search across entries *and* source names), column sorting, and dynamic translation support (English, Japanese, French, German, Spanish, Traditional Chinese).

### 2. Chapter Information & Stage Layouts
* **Chapter browser**: every chapter with its sections — banner art, level ranges, tips, and vulnerability hints.
* **Visual grid board**: interactive 6x8 board visualizer matching the precise battle grid coordinates of Terra Battle, rendering the layout of each section's waves.
* **Wave selection tabs**: Switch between battle waves (`Wave 1`, `Wave 2`, `Wave 3`...) to view changes in enemy layout positions.
* **Interactive enemy tokens**: custom tokens for spawned enemies (red glowing pulses for Bosses, orange for normal enemies), with hover tooltips showing name, level, HP, ATK, DEF and spawn counts.
* **Side-by-side list**: detailed list of all enemies spawning in the currently active wave.
![wave_layout](/res/wave_layout.png)

### 3. Story Book
* Experience the main story chapters scene by scene, with the original scene backgrounds and each scene's background music synced automatically.
* Fullscreen reading mode, hide-text mode, and auto-play.
* Reading position is remembered, so you can pick up where you left off.

### 4. Music Player
* Play the game's extracted music (BGM) and sound effects (SE) directly through the browser.
* Searchable playlists and a persistent player that keeps playing while you browse other tabs.

### 5. Save Editor & Converter
* Load and inspect save files from both server emulators: **Project Liminal Gate** and **reTB**.
* Edit your progress: username, coins, energy, character job levels and newly recruited characters, companion levels, and item counts (capped at the game's real stack limits).
* Convert saves between the two formats in either direction.

### 6. Community Docs
* A built-in collection of documents covering server emulator setup and tweaking: reTB quick setup, patched game APK, enabling events & collabs, custom reTB builds, and more.
* Tag filtering, shareable deep links to any document or section, and embedded YouTube guides.
* Docs are plain markdown files under `docs/` — drop one in a pull request and it goes live.

---

## Project Structure

```text
TerraTools/
├── app.py                      # FastAPI Web Server (main entry point)
├── config.json.example         # Example path configuration template
├── requirements.txt            # Python dependencies (FastAPI, Uvicorn, UnityPy, capstone)
├── local-input/                # User-supplied raw game assets (gitignored)
│   ├── terra-battle-5.5.7-170.apk # Terra Battle v5.5.7 APK
│   └── gdresources/            # Vanilla game client asset bundles (data_u2017/android/...)
├── scripts/                    # Code extraction & decompilation utilities
│   ├── Decompiler.cs           # C# MoonSharp bytecode parser source
│   ├── Decompiler.exe          # Compiled MoonSharp bytecode dumper
│   ├── MoonSharp.Interpreter.dll # Official MoonSharp interpreter library
│   ├── decompile_and_parse_all.py # Automates decompilation and generates StagesLayout.json
│   ├── parse_stages_layout.py  # VM instruction stack-based parser (test script)
│   ├── extract_everything.py   # Extracts and decrypts game database from APK
│   ├── extract_native_stages.py# Extracts native ARM64 stage layouts (Ch 8-42)
│   ├── extract_native_drops.py # Extracts runtime-configured event boss drops into StageDrops.json
│   ├── validate_stage_drops.py # Validates StageDrops.json against the game databases
│   ├── extract_gamedata.py     # Fallback extractor for raw asset files
│   ├── recompile_everything.py # Recompiles modified assets back into APK
│   ├── download_user_data.py   # Fetches user-data / gdresources from GitHub releases
│   ├── create_gdresources_release.py # Packages gdresources + user-data and publishes a release
│   ├── search_enemy.py         # Utility to search EnemyData.json NameStrings
│   ├── verify_mapping.py       # Utility to verify metadata enum-to-ID alignment
│   └── test_hash.py            # .NET String.GetHashCode tester
├── docs/                       # Community docs shown on the Docs tab (server setup guides, ...)
│   └── reTB/                   # reTB guides (quick setup, patched APK, events & collabs, ...)
├── frontend/                   # React + Vite frontend source code
│   └── public/
│       └── TerraToolbox.png    # App icon and browser favicon
└── user-data/                  # Extracted assets, databases, and runtime output (gitignored)
    ├── dump.cs                 # Auto-generated C# structure dump (via Il2CppDumper)
    ├── libil2cpp.so            # Extracted ARM64 binary (from APK)
    ├── global-metadata.dat     # Extracted IL2CPP metadata (from APK)
    └── extracted-gamedata/
        └── game_data/
            └── StagesLayout.json # Wave configurations database mapping
```

---

## Local Input Directory (`local-input/`)

`local-input/` is a gitignored drop-zone for the raw game files:

* **`terra-battle-5.5.7-170.apk`** *(required)* — Terra Battle v5.5.7 APK. The extraction pipeline pulls everything out of it: the game databases, the Lua stage scripts (Chapters 1–7), and the native ARM64 binary (Chapters 8–42 layouts and event boss drops).
* **`gdresources/`** *(optional, recommended)* — vanilla client asset bundles (`data_u2017/android/...`): stage backgrounds, BGM/SE audio, banners, companion artwork and thumbnails, character job artwork, grid token sprites, and scenario files. These feed the media features (artwork, music player, story backgrounds). The trimmed `gdresources-light` variant distributed for the reTB emulator works too.

No fixed path is assumed: `backend/config.py` scans `local-input/` for any
`gdresources*` folder and picks the platform directory holding the most asset
categories (preferring `data_u2017` on ties), so you can swap the full
resources for the much smaller `gdresources-light` by simply dropping it in —
no configuration change needed. The extraction pipeline itself still reads
`gdresources/data_u2017/android` directly.

---

## Extraction & Decompilation Pipeline

The layout coordinates and battle configuration files are scripted inside compiled MoonSharp Lua chunks (`Chapter*.luac`). We parse these compiled instruction streams to reconstruct the stage coordinates:

1. **Extracting Enum Metadata**:
   We search `global-metadata.dat` inside the game APK to read the C# `Enemies` enum. We resolved that the indices align exactly with the database `ID`s inside `EnemyData.json` (`ID = enum_index + 1`).
2. **Lua Bytecode Decompilation**:
   `Decompiler.exe` loads compiled `.luac` bytecode chunks and hooks into MoonSharp's virtual machine debugger interface, capturing the disassembled instructions stream.
3. **Instruction Stack Parsing**:
   `decompile_and_parse_all.py` performs stack analysis on the bytecode to resolve calls to `CreateEnemy(x, y, enemy_id, vid)`. It replaces string variable references with numeric database IDs and saves coordinates to `StagesLayout.json`.

To run the full extraction and parsing pipeline, place your game APK under `local-input/terra-battle-5.5.7-170.apk` and run:

```bash
# Extract asset databases
python scripts/extract_everything.py

# Decompile chapter scripts and generate wave coordinates database (Chapters 1-7)
python scripts/decompile_and_parse_all.py
```

### Native Stage Extraction (Chapters 8 to 42)

For Chapters 8-42, battle scripts are compiled directly into the ARM64 C++ binary (`libil2cpp.so`). Reconstructing these layouts requires binary disassembly analysis:

#### Prerequisites
1. **`llvm-objdump`**: Must be installed and available on your system `PATH`.
2. **`Il2CppDumper`**: Must be available on your system `PATH`. The extraction pipeline automatically runs it to generate `dump.cs` from the APK's `libil2cpp.so` and `global-metadata.dat`.

#### Configuration
A `config.json` file is located in the root of the project to manage paths (defaults to `./user-data/`):
* `dump_cs_path`: Path to the auto-generated `dump.cs`.
* `apk_path`: Path to your Terra Battle APK.
* `lib_path`: Path to extract `libil2cpp.so` to.
* `objdump_cmd`: Name of the objdump command (defaults to `llvm-objdump`).
* `stages_layout_path`: Output path to update `StagesLayout.json`.

Just rename `config.json.example` to `config.json` and update the paths to match your system configuration.

#### Extraction Execution
To extract native coordinates for Chapters 8+ and merge them into your layout database:
```bash
# Disassemble and extract Chapter 8-42 battle layouts
python scripts/extract_native_stages.py
```

### Event Boss Drop Extraction (StageDrops.json)

Some bosses roll their item drops at spawn time from compiled code instead of
the `EnemyData` drop tables — the Eidolon quest bosses, the Odin Descended
job materials, and several hunt/crossover bosses. Without this data those
items (e.g. *The Emperor*, *The Hierophant*) show no obtain sources.

`scripts/extract_native_drops.py` disassembles the `Init_*` spawner methods
of every native `ChapterXXX` class and recovers the `SetItemDropRatio`
configurations (item ids, drop slot, and chance), then attributes them to
quest stages via the `enemy_var` spawns recorded in `StagesLayout.json`.
The result is written to `user-data/extracted-gamedata/game_data/StageDrops.json`,
which the items endpoint merges into its "Where to Obtain" sources.

Run it manually with:
```bash
python scripts/extract_native_drops.py
```
`scripts/extract_everything.py` runs it automatically as step 9. To verify
the generated data against the game databases (plus the wiki-documented
Eidolon card rates as a fixture), run:
```bash
python scripts/validate_stage_drops.py
```


---

## Resources & User-Data Releases

The repository's GitHub releases carry everything the toolbox needs to run
without holding raw assets in git:

| Asset | Contents | Consumed by |
|---|---|---|
| `user-data.zip` (`.001`, `.002`, ... when split) | Pre-extracted game data generated by the extraction pipeline | Docker build & `docker-entrypoint.sh` (deployed containers) |
| `gdresources*.zip` (`.001`, `.002`, ... when split) | Raw client asset bundles (e.g. `gdresources-light`) | Opt-in dev fetch only — deployed containers never download resources |

Deployed containers stay light: they only ever fetch `user-data`. The raw
`gdresources` are a dev asset for experiencing/testing the data pipeline.

### Refreshing user-data in deployed containers

The container entrypoint picks its startup build mode from the `BUILD_MODE`
environment variable:

| `BUILD_MODE` | Behavior |
|---|---|
| `auto` (default) | Fetch from GitHub releases (then fall back to local extraction) only when extracted game data is missing |
| `force-download` | Always fetch the latest release user-data, replacing the data already in `user-data/` |

Since compose mounts `./user-data` as a volume, existing data would normally
never be re-fetched. To refresh it from the latest release, start the
containers once with the variable overridden:

```bash
BUILD_MODE=force-download docker compose up -d
```

### Creating a release (light resources + generated user-data)

1. Place the light resources under `local-input/gdresources-light`.
2. Run the extraction pipeline with them in place (see the pipeline section above)
   so `user-data/` is generated from the light resources.
3. Package and publish both in one release:
   ```bash
   python scripts/create_gdresources_release.py --tag gdresources-light-<date>
   ```
   The script zips `local-input/gdresources-light` (as `gdresources-light.zip`)
   and `user-data/` (as `user-data.zip`), splits any archive beyond GitHub's
   2 GB asset limit into `.001`/`.002` parts, and publishes them via the
   `gh` CLI (must be installed and authenticated).

Because the fetchers resolve the *latest* release, publishing makes the new
light user-data the one deployed containers download.

### Fetching release assets manually

```bash
# Pre-extracted user-data (what deployed containers use)
python scripts/download_user_data.py

# Raw resources into local-input/ (dev only; supports any gdresources* asset)
python scripts/download_user_data.py --asset gdresources
```

Both support `--repo`, `--target-dir`, `--force` and `--check-only`, handle
multi-part archives transparently, and reuse local `.zip`/`.zip.00N` archives
found next to the target directory when available.

Fetches normally resolve the release through `api.github.com`, which allows
only 60 unauthenticated requests/hour per IP — shared build hosts often
exhaust that quota. When the API is rate-limited, the fetcher falls back to
the API-less `releases/latest/download/...` URLs (not subject to that quota),
and an optional `GITHUB_TOKEN` environment variable raises the API limit:
the Docker build accepts it as a secret, e.g.
`docker build --secret id=github_token,env=GITHUB_TOKEN .`

---

## Running the Web Server

### With Docker Compose (recommended)

The container image builds the frontend, installs the backend, and fetches the pre-extracted user-data from the latest GitHub release on first start — no local Python or Node required, and no need to run the extraction pipeline yourself.

```bash
docker compose up -d
```

Then open [http://127.0.0.1:5001](http://127.0.0.1:5001) in your browser.

* `user-data/`, `scripts/` and `local-input/` are volume-mounted from the working tree, so dropping a `gdresources*` folder into `local-input/` enables the media features (artwork, music player, story backgrounds) without rebuilding.
* The entrypoint honors `BUILD_MODE`: `auto` (default) fetches user-data only when missing, `force-download` replaces existing data with the latest release (see [Refreshing user-data in deployed containers](#refreshing-user-data-in-deployed-containers)).
* `docker compose watch` syncs backend code and a rebuilt `frontend/dist` into the running container for development.

### Observability (Datadog)

Compose ships an optional `datadog` service (the official `agent:7` container) that collects host & container metrics, APM traces, and every container's stdout logs. To enable it, create a `.env` file next to `docker-compose.yml` (see [`.env.example`](.env.example)) with your key:

```bash
cp .env.example .env   # then fill in DD_API_KEY
docker compose up -d
```

* Without `DD_API_KEY` the agent container simply exits — the rest of the stack is unaffected.
* Traces and continuous profiling are emitted by the backend through Unix sockets shared with the agent (`datadog-sockets` volume, no published ports); disable them by setting `DD_TRACE_ENABLED=false`. If `ddtrace` slows startup in a dev-only scenario, also unset `DD_PROFILING_ENABLED` by setting it to `false`.
* Logs are the container stdout (JSON access logs in the deployed image), auto-multi-line detected and tagged `source:python`, `service:terra-tools`.
* Intake site defaults to `datadoghq.eu`; override with `DD_SITE`.

### Without Docker (local Python)

1. **Install the backend dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Build the frontend** (the server serves `frontend/dist`):
   ```bash
   cd frontend && npm install && npm run build && cd ..
   ```
3. **Start the server**:
   ```bash
   python app.py
   ```
4. Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.
