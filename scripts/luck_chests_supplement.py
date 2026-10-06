"""Luck Treasure Chest pools the donor record misses: the descent quests per section.

The primary chest record lives in the sibling project (project-liminal-gate,
``liminal_gate.luck_pool_data.DOCUMENTED_CHEST_POOLS``). For the three descent
chapters it documents (2000 Bahamut, 2001 Leviathan, 2002 Odin) that record
encodes the *first* quest's table once and serves it for all four sections --
its own stated rule that "a chapter whose page carries a single table gives one
entry and it answers for every section". But each section is its own quest with
its own wiki page and its own table, and section 4 (バハムート再構築, "Bahamut
Recoded") pays what the first quest never does: the family's Recode DNA
(Bahamut's/Leviathan's/Odin's Fang) and the Lambda characters.

The nine tables below are those per-section pages, transcribed in the donor's
own wire encoding (``C`` coins, ``I`` item, ``O`` Companion, ``M`` character)
and with every name resolved by exact match against this repo's decoded
``ItemSet`` / ``ChrDatabase`` / ``BuddyDatabase`` positions and IDs. Names the
wiki renders with ``{{Character icon|...}}`` but that exist only as Companions
(Bahamut Ο, Bahamut ΟII, A'merpact ΟII, ...) resolve to the Companion, per the
donor's own convention; the recruits resolve to the character where both exist.

Merging: these keys override the donor's. Everything else is untouched.
"""

from __future__ import annotations

#: ``(chapter, section) -> {tier -> rewards}``.
SUPPLEMENT_CHEST_POOLS: dict[tuple[int, int], dict[str, tuple[str, ...]]] = {
    # -- Chapter 2000, Bahamut -- section 1 (Descended) stays with the donor --
    # Bahamut Evolved, rev 84017.
    (2000, 2): {
        "A": ('C500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "B": ('C500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "C": ('I48', 'M524', 'M519',),  # Caladbolg, Suzaku, Kujata
        "D": ('I50', 'I81', 'I112',),  # Metal / Fellowship / Companion Ticket
        "Luck 80": ('M148', 'O8', 'O9',),  # Bahamut, Blazing Wand, Inferno Rod
        "Luck 100": ('M148', 'O9',),
    },
    # Bahamut Ultra, rev 84018.
    (2000, 3): {
        "A": ('C1000', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "B": ('C1000', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "C": ('I48', 'I49', 'M524',),  # Caladbolg, Caladcholg, Suzaku
        "D": ('I50', 'I81', 'I112',),
        "Luck 80": ('M148', 'O9', 'O12',),  # Bahamut, Inferno Rod, Mantle Staff
        "Luck 100": ('M148', 'O337', 'O12',),  # Bahamut, Daiana ΟII, Mantle Staff
    },
    # Bahamut Recoded, rev 84154.
    (2000, 4): {
        "A": ('C1500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "B": ('C1500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "C": ('I48', 'I49', 'M524', 'M519',),
        "D": ('I134', 'I50', 'I112', 'I81',),  # Bahamut's Fang + tickets
        "Luck 80": ('I134', 'M632', 'O311',),  # Fang, Bahamut Λ, Bahamut ΟII
        "Luck 100": ('I134', 'M632', 'O275', 'O311',),  # Fang, Bahamut Λ, Bahamut Ο, Bahamut ΟII
    },

    # -- Chapter 2001, Leviathan --
    # Leviathan Evolved, rev 84022.
    (2001, 2): {
        "A": ('C500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "B": ('C500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "C": ('I51', 'M671',),  # Cobalt Goblet, Chiton
        "D": ('I50', 'I81', 'I112',),
        "Luck 80": ('M144', 'O14', 'O15',),  # Leviathan, Glacial Wand, Blizzard Rod
        "Luck 100": ('M144', 'O15',),
    },
    # Leviathan Ultra, rev 84023.
    (2001, 3): {
        "A": ('C1000', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "B": ('C1000', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "C": ('C2000', 'I51', 'I52',),  # Cobalt Goblet, Trident (the item)
        "D": ('I50', 'I81', 'I112',),
        "Luck 80": ('M144', 'O15', 'O18',),  # Leviathan, Blizzard Rod, Comet Staff
        "Luck 100": ('M144', 'O353', 'O18',),  # Leviathan, A'merpact ΟII, Comet Staff
    },
    # Leviathan Recoded, rev 84024.
    (2001, 4): {
        "A": ('C1500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "B": ('C1500', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I46',),
        "C": ('I51', 'I52', 'M671',),
        "D": ('I135',),  # Leviathan's Fang, alone as the page lists it
        "Luck 80": ('I135', 'M634', 'O312',),  # Fang, Leviathan Λ, Leviathan ΟII
        "Luck 100": ('I135', 'M634', 'O276',),  # Fang, Leviathan Λ, Leviathan Ο
    },

    # -- Chapter 2002, Odin --
    # Odin Evolved, rev 84027.
    (2002, 2): {
        "A": ('C500', 'I9', 'I10', 'I11', 'I12',),
        "B": ('C500', 'I9', 'I10', 'I11', 'I12',),
        "C": ('I57', 'M463',),  # Amethyst Flame, Wailing Wall
        "D": ('I50', 'I81', 'I112',),
        "Luck 80": ('M151', 'O37', 'O40',),  # Odin, Iron Spear, Silver Spear
        "Luck 100": ('M151', 'O40',),
    },
    # Odin Ultra, rev 84026.
    (2002, 3): {
        "A": ('C1000', 'I9', 'I10', 'I11', 'I12',),
        "B": ('C1000', 'I9', 'I10', 'I11', 'I12',),
        "C": ('C2000', 'I57', 'I58',),  # Amethyst Flame, Rune
        "D": ('I50', 'I81', 'I112',),
        "Luck 80": ('M151', 'O40', 'O85',),  # Odin, Silver Spear, Trident (the Companion)
        "Luck 100": ('M151', 'O355', 'O85',),  # Odin, Ra'prow ΟII, Trident
    },
    # Odin Recoded, rev 84028.
    (2002, 4): {
        "A": ('C1500', 'I9', 'I10', 'I11', 'I12',),
        "B": ('C1500', 'I9', 'I10', 'I11', 'I12',),
        "C": ('I57', 'I58', 'M463',),
        "D": ('I136', 'I50', 'I81', 'I112',),  # Odin's Fang + tickets
        "Luck 80": ('I136', 'M633', 'O313',),  # Fang, Odin Λ, Odin ΟII
        "Luck 100": ('I136', 'M633', 'O277',),  # Fang, Odin Λ, Odin Ο
    },
}
