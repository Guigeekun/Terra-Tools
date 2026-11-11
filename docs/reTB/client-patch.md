---
title: TB client patch
description: Patch your own APK into a tweaked reTB client with tb-client-patch — the maintained replacement for the prebuilt "working adult edition" downloads.
tags: reTB
---

[tb-client-patch](https://github.com/Nyquis/tb-client-patch) is a reproducible,
fully local patch recipe for the Terra Battle **5.5.7 (170)** Android client.
You feed it **your own APK**, and it outputs a client that talks to a reTB
server at `http://127.0.0.1:8080` (reTBhost on the phone, reTB / reTBpc on the
PC) — with a set of grind-free game mods built in.

> The repository stores no game files. It patches your APK on your machine,
> never touches the network, and patched clients may not be redistributed
> (the Apache-2.0 license covers the toolchain only — Terra Battle stays
> Mistwalker's). You must own the APK you patch.

## Why it replaces the "working adult edition"

Until now the tweaked-client route was a prebuilt download: the working adult
edition / grindless V3 or the patched client apk, all Google Drive copies
somebody else built. tb-client-patch replaces those downloads:

- **You build from your own APK** — no Drive links that rot or quietly change
- **Everything is declared and verified** — `verify` proves that every byte
  that differs from the original is a declared patch (and reverts them);
  `audit` structurally checks the binary hooks
- **The signing key is pinned and enforced**, so a rebuild keeps the same
  signature and `adb install -r` keeps your save — the trick the old patched
  apk relied on, now checked by the build instead of by convention
- **It is current**: 16 KB-page-compatible native libs, the Android 16 JNI
  fix, and WebView crash fixes that still hold on today's WebView builds
- **The grind-free mods are included** — 4× speed, guaranteed drops,
  auto trash-clear, one-hit kill, infinite time, invincibility, story skip

## What you get

### Connection & compatibility

What the old patched apk did, now applied to your own build:

- 12 endpoint literals rewritten to `http://127.0.0.1:8080` — API, assets,
  license and support pages all point at your reTB. The target lives in
  `patches/endpoints.json` if you need a different host.
- Google Mobile Ads stripped from the manifest (the WebView SIGTRAP at the
  splash) and UniWebView disabled (the in-game news screen goes away)
- Unity's JNI proxy taught to ignore Android 16's default interface methods,
  which otherwise kill the game when billing connects
- `libmain.so` / `libunity.so` repaired in place for 16 KB pages — no
  injected library, no memory-hogging shim (arm64-v8a only)
- the modal IAP-error dialog is skipped
- repacked, `zipalign -P 16`, signed with your local key

### The game mods

| Where | Toggle | What it does |
|---|---|---|
| Options | Speed row | cycles battle speed x2 → x3 → x4 (persisted) |
| Options | Auto row (crossed swords) | **Trash-clear**: at every enemy turn, visible non-boss enemies are cleared; bosses still die in one hit when you attack them. Works in Metal Zone. Set it before entering battle. |
| Battle menu | `1-Hit` | any hit kills enemies (red = on). While Auto is on, this row reads `Stop` and tapping it stops Auto. |
| Battle menu | Time | freezes the turn-time gauge |
| Battle menu | HP | invincibility — the party survives lethal hits at 1 HP (the game's own muteki) |
| Battle | Support button (now a treasure chest) | **Drop Rate x1 / x5 / Max** — item drop chance ×5 or guaranteed |
| Stories | Skip button | always shown, including the first viewing (chapter and in-battle stories; the story archive is not covered) |
| — | audio fix | attack sound effects no longer die after the app is minimised and resumed (vanilla bug) |

Caveats worth knowing:

- `1-Hit` also bypasses scripted invulnerability, so chapters where a boss
  must survive to a cutscene can behave oddly while it is on
- trash-clear deliberately spares bosses — several chapters script retreats,
  phase changes and revivals that killing them would break
- drop rate affects item drops only; monster recruits and buddies are
  separate rolls
- battle **EXP/coins are computed by the reTB server**, the patcher does not
  touch them. The old grindless knobs (EXP/coin multipliers, stamina, pact
  and luck boosts) remain server-side config — see
  [Custom reTB](custom-reTB.md), and [Enable events and
  collabs](enable_eventscollabs.md) for the retired-event switches.

## Build & install

You need a PC with:

- a pristine Terra Battle 5.5.7 APK — e.g.
  [vanilla from uptodown](https://terra-battle.uptodown.com/android). A
  damaged or partial copy is the single most common cause of confusing
  build failures; extract a fresh one rather than reusing an old download.
- [pixi](https://pixi.sh) — brings pinned Python 3.13 + JDK 21
- Android build-tools **35.0.0** (`zipalign`, `apksigner`, `aapt2`)
- the apktool **3.0.3** jar (its SHA-256 is pinned and checked)
- `adb` for the install step

`pixi run doctor` names whichever piece is missing.

```sh
git clone https://github.com/Nyquis/tb-client-patch
cd tb-client-patch
pixi install

# put your APK at input/terra-battle-5.5.7-170-original.apk, then:
pixi run unpack    # extract work/il2cpp/* from your APK (once per APK)
pixi run doctor    # validate inputs, toolchain, apktool pin, key, patch data
pixi run build     # -> dist/TerraBattle-5.5.7-170-patched.apk (arm64-only)
pixi run verify    # must print PASS: original in, every difference declared
pixi run install   # adb install -r
```

`pixi run dist` additionally produces a release folder (APK + SHA256SUMS +
NOTES); `pixi run audit` checks the declared hook sites in the binary;
`pixi run keycheck` proves a restored keystore is the pinned identity.

> `keys/` is gitignored and it *is* your save's identity — back it up. Same
> install rule as ever: the pinned signature lets `adb install -r --no-incremental`
> replace the build without wiping the save, and **never uninstall** to get
> around a signature error, that deletes the save.

With the client installed, start reTBhost (or reTB / reTBpc) on
`127.0.0.1:8080` and play — see the [quick setup guide](quick-setup-guide.md).

## Under the hood

Every transform is declared as data in `patches/*.json`: an offset, the
SHA-256 of the bytes expected to be there, and the replacement — 67 native
patch sites plus dex, smali and manifest rules, no game code in the repo.
The gameplay mods are hand-written arm64 hooks placed in verified-zero cave
padding in `libil2cpp.so`, and dead in-game UI is repurposed for them (the
old Kamcord record buttons, the Help options row, the Support URL button), so
nothing needs new art. The repo's own `docs/` go deep:
`patcher.md`, `native-mods.md`, `native-guards.md`, `verification.md`.

For the technical background on the WebView/ads crashes the compatibility
patches solve, see the [tb-client-patch
README](https://github.com/Nyquis/tb-client-patch#readme). The legacy
prebuilt patched apk (Drive download) applies the same four fixes —
[Patched game apk](patched-game-apk.md) keeps its pointer.
