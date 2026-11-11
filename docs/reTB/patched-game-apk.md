---
title: Patched game apk - Technical detail
description: What was modified in the reTB game apk.
tags: reTB
---

This document is detailing the different patches for [Patched reTB client apk](https://drive.google.com/file/d/1Qef0VvL3I1Si1CjXiLdfZd20f0yp2MnC/view?usp=drive_link)

> Rather build the same kind of client yourself? [TB client patch](client-patch.md) applies these fixes reproducibly to your own APK, plus in-game tweaks.

The prebuilt apk bundles four client-side jobs:

1. repoint Terra Battle's il2cpp metadata endpoints at the reTB host (default `http://127.0.0.1:8080`)
2. keep/fix the bundled arm64-v8a build for modern Android (libmain stub, high-address soak, 16 KB page alignment)
3. strip the AdMob auto-init `<provider>` from the manifest, whose WebView SIGTRAPs at the splash on current WebView builds
4. guard Unity's JNIBridge proxy against Android 16's new default interface method, which otherwise kills the game when billing connects

The full technical write-up — patch mechanics, the webview fix scripts, build
and install steps, crash diagnostics and memory-soak guidance — now lives in
the [tb-client-patch README](https://github.com/Nyquis/tb-client-patch#readme),
the maintained and reproducible implementation of the same fixes.
