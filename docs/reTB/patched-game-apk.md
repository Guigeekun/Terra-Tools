---
title: Patched game apk - Technical detail
description: What was modified in the reTB game apk.
tags: reTB
---

This document is detailing the different patches for [Patched reTB client apk](https://drive.google.com/file/d/1Qef0VvL3I1Si1CjXiLdfZd20f0yp2MnC/view?usp=drive_link)

# @_titten's patch
This is a standalone consolidator for the four client-side jobs:
  1. repoint Terra Battle's il2cpp metadata endpoints at reTB Host
     (default: http://127.0.0.1:8080),
  2. keep/fix the bundled arm64-v8a build for modern Android (libmain stub,
     high-address soak, 16 KB page alignment),
  3. strip the AdMob auto-init <provider> from the manifest, whose WebView
     SIGTRAPs at the splash on current WebView builds, and
  4. guard Unity's JNIBridge proxy against Android 16's new default interface
     method, which otherwise kills the game when billing connects.

The required arm64 native helper payloads are embedded in this file. It still
needs normal external build tools: Java/keytool, patchelf, zipalign, and
apksigner. Job 4 additionally needs the smali/baksmali jars; point --dex-tools
at a directory holding them, or run once with --fetch-dex-tools to download
them (pinned by SHA-256) into the patcher's data directory. --skip-dex builds
without job 4 -- fine for Android 14/15, crashes on Android 16.

The signing key lives at a fixed, location-independent path (see
`default_keystore`), so rebuilding from any working directory produces an APK
with the SAME signature and `adb install -r` keeps the player's save.

# Terra Battle / reTB — WebView patch scripts

Two post-processing scripts for the APK that `reTB-patch.py` produces. Both
prevent the game from dying with `SIGTRAP` inside `libwebviewchromium.so` on
modern Android.

## Why this is needed

`reTB-patch.py` bundles `libhighaddressfix.so`, which soaks roughly 480 GiB of
high virtual address space at startup so that il2cpp's allocations stay below
4 GB. Chromium's browser-process init wants one contiguous reservation above
4 GB — it asks for ~32 GiB, falls back to 16 GiB, and traps when both fail.
The two requirements are mutually exclusive, so the only fix is to make sure
nothing in the game process ever asks for a WebView.

## Which script to use

| | `webview_light.py` | `webview_full.py` |
|---|---|---|
| Stubs `MobileAds.initialize()` + `MobileAdsInitProvider.onCreate()` | yes | yes |
| Neutralises the Unity AdMob bridges (`RewardBasedVideo`, `Interstitial`, `Banner`) | no | yes |
| Neutralises `UniWebViewInterface` (in-game news screen) | no | yes, unless `--keep-uniwebview` |
| Works on WebView 151+ | **no** | yes |
| In-game news screen still works | yes | no |

**Use `webview_full.py`.** `webview_light.py` is the minimal historical fix; it
was enough up to about WebView 150 and is kept for reference and for the case
where you deliberately want to keep the news screen and pin an old WebView
version on the device.

## Prerequisites

On the build machine:

- **Python 3.10+**
- **A JDK 11 or newer** — `java` and `keytool` must be on `PATH`
- **`patchelf`** — from the package manager, or `pip install patchelf`
- **Android SDK build-tools** — `zipalign` and `apksigner`. Either on `PATH`,
  or reachable via `ANDROID_HOME` / `ANDROID_SDK_ROOT`, or passed to
  `reTB-patch.py` with `--build-tools`
- **The smali/baksmali jars** — not installed manually; `reTB-patch.py`
  downloads them (pinned by SHA-256) when run once with `--fetch-dex-tools`
- **A pristine Terra Battle 5.5.7 APK.** A damaged or partial copy is the
  single most common cause of confusing build failures — extract a fresh one
  from the Play Store install rather than reusing an old download

On the phone:

- **USB debugging** enabled, and the device authorised (`adb devices` shows it
  as `device`, not `unauthorized`)
- **reTB Host** installed and its server running on `http://127.0.0.1:8080`

File layout — all four in the same folder, this matters:

```
reTB-patch.py
webview_light.py
webview_full.py
Terra_Battle_5.5.7_170....apk
```

The patch scripts load `reTB-patch.py` via `runpy` to reuse its tool
resolution, keystore and signing logic. That is what keeps the signature
identical across rebuilds, which is what lets `adb install -r` replace an
installed build **without wiping the save**.

## Build and install

```bash
# 1. Base patch. --fetch-dex-tools is only needed the first time.
python3 reTB-patch.py --fetch-dex-tools Terra_Battle_5.5.7_170....apk
#    -> Terra_Battle_5.5.7_170....-reTB-64bit.apk

# 2. WebView pass.
python3 webview_full.py Terra_Battle_5.5.7_170....-reTB-64bit.apk
#    -> Terra_Battle_5.5.7_170....-reTB-64bit-webview-full.apk

# 3. Install.
adb install -r --no-incremental "Terra_Battle_5.5.7_170....-reTB-64bit-webview-full.apk"
```

`-r` replaces the installed build and keeps app data (the save). It only works
because both builds are signed with the same key — never uninstall to get
around a signature error, that deletes the save. `--no-incremental` forces a
classic full transfer; without it newer `adb` versions try a streaming install
that needs a v4 signature the APK does not have.

Useful flags:

- `--dry-run` — reports which target classes were found in which dex and
  builds nothing. Run this first if you are unsure the APK is the right one.
- `--keep-uniwebview` — leaves the news screen intact. The resulting build then
  only runs on a WebView version old enough to start without the big
  reservation.

## Verifying

```bash
adb logcat -d -b crash
```

Empty output after a test run means no crash. For a stronger check, confirm
that a full session log contains **no** `WebViewFactory: Loading` line — that
proves no WebView was even attempted, rather than merely not crashing:

```bash
adb logcat -c -b all
# start the game, play for a moment
adb logcat -d -b all > session.txt
grep -E "WebViewFactory|Fatal signal" session.txt
```

## If a future WebView update breaks it again

The crash always has the same fingerprint, and the log tells you the culprit
directly:

1. `adb logcat -d -b all > crash.txt` right after the crash.
2. Find the `F DEBUG` block. `signal 5 (SIGTRAP), code 1 (TRAP_BRKPT)` with
   frame `#00` in `libwebviewchromium.so` confirms it is this same problem.
   Register `x1` holds the reservation size Chromium was asking for.
3. Read the backtrace downwards past `android.webkit.WebViewFactory.getProvider`.
   The first frame below it that lives in the game's own `base.odex` — or in a
   GMS module called from it — names the class that asked for the WebView.
4. Add that class to the neutralise list in `webview_full.py`.

Known culprits, all already handled: `com.google.unity.ads.RewardBasedVideo`,
`com.google.unity.ads.Interstitial`, `com.google.unity.ads.Banner`,
`com.onevcat.uniwebview.UniWebViewInterface`.
