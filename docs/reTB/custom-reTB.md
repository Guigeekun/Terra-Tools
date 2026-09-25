---
title: Custom reTB
description: A custom version of ReTB to allow tweaking of the game.
tags: reTB
---

> Warning, on both Android or PC, updating reTB might revert your tweaks

# PC
[ReTB working adult edition](https://drive.google.com/file/d/104JdNuJGXweYtxK7dyg3WzqoFri8O9aQ/view?usp=sharing)

Install reTBpc by following the guide and replace the `reTB` folder within the installation folder with this one

# Tweak further
Look for `reTB/tb_server/config.py` in reTBpc installation folder
```py
_ = apply_config({
    "enforce_stamina": False, # disabling stamina, feel free to not add
    "chapter_clear_energy": 50, # makes a chapter clear give 50 energy, feel free to not add
    "enable_retired_events": True,
    "enable_licensed_collabs": True,

    # x5 job EXP on every quest clear.
    "exp_multiplier": 5.0,
    # x5 coins on every quest clear (battle money only; spends untouched).
    "coin_multiplier": 5.0,
    # SS/Z recruit tiers pull 3x their normal weight in every pact; same for
    # the companion pacts.
    "pact_high_tier_boost": 3.0,
    "buddy_high_tier_boost": 3.0,
    # Dupe pulls: +12% SB per Z dupe becomes +36% (etc. per rarity rank).
    "dupe_sb_multiplier": 3.0,
    # Pact of Fate dupes: +5 Luck displayed becomes +15.
    "dupe_luck_multiplier": 3.0,
    # Battle-end Luck-up rolls twice as often, and every Luck gain (battle-end,
    # Orbling kills, Λ dupes) is worth 3x.
    "luckup_chance_multiplier": 2.0,
    "luck_gain_multiplier": 3.0,
    # All four Luck Treasure Chests win twice as often at any squad Luck.
    "chest_drop_multiplier": 4.0,
})
```
Modify anything you want and restart the server

# Android
## Download & setup
[ReTBhost working adult edition](https://drive.google.com/file/d/1iAZeYuXFGkLbsX4UoDS55oG6gEeLJmFu/view?usp=drive_link)
Follow the guide for reTBhost and use this apk instead of the vanilla reTBhost

## Tweak further
> Warning, this may be complicated if you're unsure of what you are doing

If you don't wanna play with some of the default modifier (or want to tweak it even harder), you may want to make your own apk for the server
For this, clone reTBhost source
```bash
git clone https://codeberg.org/WkmKsk/reTBHost.git
```
Now follow the [documentation to build the apk](https://codeberg.org/WkmKsk/reTBHost#build) with the [ReTB working adult edition](https://drive.google.com/file/d/104JdNuJGXweYtxK7dyg3WzqoFri8O9aQ/view?usp=sharing), you might want to use `-PretbRoot=/abs/path/to/reTB`

This will outputs an apk that can be used in place of the vanilla reTBhost apk