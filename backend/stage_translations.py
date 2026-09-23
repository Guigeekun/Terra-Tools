import re as _re

# ── Dynamic Translation Dictionary Builder ─────────────────────────────────────

# Internal developer notes & abbreviations that aren't user-facing strings in StringSet
DEV_TERMS_FALLBACK: dict[str, str] = {
    "バルちゃん": "Bahl", "パルパル": "Palpa", "お兄チャン": "Big Brother", "復讐": "Vengeance",
    "こども": "Children's", "ひげ": "Beard", "ブルーザー": "Bruiser", "ランラン": "Ranran",
    "メカ": "Mecha", "メビウスFF": "Mobius FF", "ジョーカーハント": "Joker Hunt",
    "山本クエスト": "Yamamoto Quest", "はじめの一歩": "First Steps", "空き": "Empty",
    "そのままススむ想定": "Linear Progression Test", "南国のかげろう": "Tropical Mirage",
    "隠された星": "Hidden Star", "キノ発売記念": "Kino Celebration", "竜王の思い出": "Dragon King's Memories",
    "マグマ": "Magma", "光子/重力属性テスト": "Photon / Graviton Attribute Test",
    "太陽/月属性テスト": "Solar / Lunar Attribute Test", "灼熱/月下テスト": "Scorching / Moonlit Test",
    "三すくみ：剣": "Weapon Triangle: Sword", "三すくみ：弓": "Weapon Triangle: Bow", "三すくみ：槍": "Weapon Triangle: Spear",
    "ケルベロス 三すくみ変化": "Cerberus: Triangle Shift", "マントルドラゴン マグマ床": "Mantle Dragon: Magma Floor",
    "マントルゴーレム  角に移動": "Mantle Golem: Corner Move", "ギガワーム パワードポイント取り合い": "Giga Worm: Power Point Contest",
    "タイムイーター 操作時間妨害": "Time Eater: Move Time Jammer", "ロックゴースト 枷が着地地点にダメージ": "Rock Ghost: Shackles",
    "ペペロペ ファーストコンタクト": "Péperope: First Contact", "古の鍵\u3000爆弾が効く": "Ancient Key: Bomb Vulnerable",
    "コルプエナジー 吸収＆放出": "Corp Energy: Absorb & Release", "ゼリエの真実": "Truth of Zerro",
    "パペット": "Puppet", "ヘッジホッグ": "Hedgehog",
}

SUFFIX_MAP: dict[str, str] = {
    "初級": "Easy", "中級": "Medium", "上級": "Hard", "超級": "Ultra Hard", "ハード": "Hard",
    "（シングル）": " (Single)", "(シングル)": " (Single)", "（ハード）": " (Hard)", "(ハード)": " (Hard)",
    "降臨": " Descent", "進化": " Evolution", "超進化": " Ultra Evolution", "再構築": " Recode",
    "杯": " Cup", "護衛": " Escort", "乱舞": " Wild Dance", "乱闘": " Brawl", "輪舞曲": " Rondo",
    "旋風": " Whirlwind", "大発生？": " Outbreak?", "爆発": " Explosion", "ロード": " Road",
}

ROMAN_MAP: dict[str, str] = {
    "Ⅰ": " I", "Ⅱ": " II", "Ⅲ": " III", "Ⅳ": " IV",
    "1": " 1", "2": " 2", "3": " 3", "4": " 4", "5": " 5",
    "・Ο": " · Λ", "・Λ": " · Λ"
}

# Section title substrings that indicate a provably random enemy layout.
RANDOM_LAYOUT_PATTERNS: dict[str, str] = {
    "メタルZONE": "Metal ZONE – enemy placement is random each run",
    "キング登場":  "Metal ZONE (King Appears) – enemy placement is random each run",
    "るつぼの都":  "Melting Pot – enemy placement is random each run",
}

RANDOM_CHAPTER_RELATED: dict[int, list[int]] = {
    1000: [1001, 1002, 1003, 1004],
    3000: [3001, 3002, 3003, 3004],
}

# Fallback reasons for random sections that have no layout and no RELATED pool.
HARD_POOL_REASON = (
    "Hard mode – enemy placement is randomized each run; the pool mirrors the normal version."
)
SIBLING_POOL_REASON = (
    "Enemy placement is randomized each run; the pool mirrors the fixed-layout version of this stage."
)
RANDOM_FALLBACK_REASON = (
    "Enemy placement data isn't present in the game data – the game assigns spawns at run time."
)

# Title suffixes marking a difficulty variant of an otherwise identically-named stage.
_TITLE_VARIANT_SUFFIXES = ("（ハード）", "(ハード)")


def strip_title_variants(section_title: str) -> str:
    """Remove difficulty suffixes so e.g. 五覇降臨ガルーダ（ハード） matches 五覇降臨ガルーダ."""
    title = (section_title or "").strip()
    for suffix in _TITLE_VARIANT_SUFFIXES:
        if title.endswith(suffix):
            return title[: -len(suffix)].strip()
    return title


def is_random_section(section_title: str) -> str | None:
    """Return the random-layout reason string if the section title matches, else None."""
    for pattern, reason in RANDOM_LAYOUT_PATTERNS.items():
        if pattern in section_title:
            return reason
    return None


def build_dynamic_translation_lookup(gamedata: dict) -> dict[str, dict[str, str]]:
    """Build a comprehensive dynamic lookup table directly from decrypted game databases at startup."""
    lookup: dict[str, dict[str, str]] = {}

    def register_entry(loc_obj: dict | None):
        if not isinstance(loc_obj, dict):
            return
        ja = (loc_obj.get("ja") or "").strip()
        en = (loc_obj.get("en") or "").strip()
        if ja and en:
            lookup[ja] = {k: v.strip() for k, v in loc_obj.items() if isinstance(v, str) and v.strip()}
            # Also register clean versions without Japanese brackets
            clean_ja = _re.sub(r"^[【「\[\(](.+?)[】」\]\)]$", r"\1", ja).strip()
            clean_en = _re.sub(r"^[【「\[\(](.+?)[】」\]\)]$", r"\1", en).strip()
            if clean_ja and clean_en and clean_ja not in lookup:
                lookup[clean_ja] = {
                    k: _re.sub(r"^[【「\[\(](.+?)[】」\]\)]$", r"\1", v).strip()
                    for k, v in loc_obj.items()
                    if isinstance(v, str)
                }

    # 1. StringSet uiSet & scenarioSet
    strings = gamedata.get("strings", {})
    for item in strings.get("uiSet", []):
        register_entry(item)
    for item in strings.get("scenarioSet", []):
        register_entry(item)

    # 2. EnemyData
    for e in gamedata.get("enemies", {}).get("data", []):
        register_entry(e.get("NameString"))

    # 3. ChrDatabase
    for c in gamedata.get("characters", {}).get("data", []):
        register_entry(c.get("NameString"))

    # 4. BuddyDatabase
    for b in gamedata.get("buddies", {}).get("data", []):
        register_entry(b.get("NameString"))

    # 5. ItemSet
    for it in gamedata.get("items", {}).get("itemSet", []):
        register_entry(it.get("NameString"))

    # 6. Fallbacks for dev tags
    for k, v in DEV_TERMS_FALLBACK.items():
        if k not in lookup:
            lookup[k] = {"en": v, "ja": k}

    return lookup


# ── Dynamic Translation & Title Decomposition ─────────────────────────────────

def translate_stage_title(raw_title: str, dynamic_lookup: dict | None = None) -> str:
    """Translate Japanese stage and section titles using the dynamic game database lookup."""
    if not raw_title:
        return ""
    t = raw_title.strip()
    if dynamic_lookup and t in dynamic_lookup:
        return dynamic_lookup[t].get("en", t)

    # Prefix decomposition: [Prefix] Body
    m = _re.match(r"^\[(.+?)\]\s*(.+)$", t)
    if m:
        prefix_ja, body_ja = m.group(1).strip(), m.group(2).strip()
        prefix_en = dynamic_lookup.get(prefix_ja, {}).get("en", prefix_ja) if dynamic_lookup else prefix_ja
        # Species counter pattern: [Melting Pot] Species - N
        sm = _re.match(r"^(.+?)\s*-\s*(\d+)$", body_ja)
        if sm:
            sp_ja, num = sm.group(1).strip(), sm.group(2)
            sp_en = dynamic_lookup.get(sp_ja, {}).get("en", sp_ja) if dynamic_lookup else sp_ja
            return f"[{prefix_en}] {sp_en} - {num}"
        body_en = translate_stage_title(body_ja, dynamic_lookup)
        return f"[{prefix_en}] {body_en}"

    # Prefix decomposition: 逆襲降臨 (with or without brackets)
    m = _re.match(r"^\[?逆襲降臨\]?\s*(.+)$", t)
    if m:
        body_ja = m.group(1).strip()
        sm = _re.match(r"^(\d+-\d+)$", body_ja)
        if sm:
            return f"Counterattack {sm.group(1)}"
        body_en = translate_stage_title(body_ja, dynamic_lookup)
        return f"[Counterattack] {body_en}"

    # Prefix decomposition: 五覇降臨 Body
    if t.startswith("五覇降臨"):
        rest = t[4:].strip()
        hard = " (Hard)" if ("ハード" in rest or "（ハード）" in rest) else ""
        clean_boss = _re.sub(r"[\(（]?ハード[\)）]?", "", rest).strip()
        boss_en = dynamic_lookup.get(clean_boss, {}).get("en", clean_boss) if dynamic_lookup else clean_boss
        return f"Descent of the Five: {boss_en}{hard}"

    # Prefix decomposition: リトルノア： Body
    m = _re.match(r"^リトルノア[：:]\s*(.+?)(Ⅰ|Ⅱ|Ⅲ|I|II|III)?$", t)
    if m:
        boss_ja, num = m.group(1).strip(), m.group(2) or ""
        boss_en = dynamic_lookup.get(boss_ja, {}).get("en", boss_ja) if dynamic_lookup else boss_ja
        r_num = ROMAN_MAP.get(num, f" {num}" if num else "")
        return f"Little Noah: {boss_en}{r_num}"

    # Prefix decomposition: FFXV
    m = _re.match(r"^FF15\s+(.+)$", t)
    if m:
        char_ja = m.group(1).strip()
        char_en = dynamic_lookup.get(char_ja, {}).get("en", char_ja) if dynamic_lookup else char_ja
        return f"FFXV: {char_en}"

    # Suffix decomposition: Diff (初級/中級/上級/超級)
    m = _re.match(r"^(.+?)\s+(初級|中級|上級|超級)$", t)
    if m:
        base_ja, diff_ja = m.group(1).strip(), m.group(2).strip()
        base_en = translate_stage_title(base_ja, dynamic_lookup)
        diff_en = SUFFIX_MAP.get(diff_ja, diff_ja)
        return f"{base_en} ({diff_en})"

    # Suffix decomposition: Single (シングル)
    m = _re.match(r"^(.+?)(Ⅰ|Ⅱ|Ⅲ|Ⅳ|I|II|III|IV)?(?:（|\()(シングル)(?:）|\))$", t)
    if m:
        base_ja, num = m.group(1).strip(), m.group(2) or ""
        base_en = translate_stage_title(base_ja, dynamic_lookup)
        r_num = ROMAN_MAP.get(num, f" {num}" if num else "")
        return f"{base_en}{r_num} (Single)"

    # Suffix decomposition: Roman numerals (Ⅰ|Ⅱ|Ⅲ|Ⅳ)
    m = _re.match(r"^(.+?)(Ⅰ|Ⅱ|Ⅲ|Ⅳ)$", t)
    if m:
        base_ja, num = m.group(1).strip(), m.group(2)
        base_en = translate_stage_title(base_ja, dynamic_lookup)
        r_num = ROMAN_MAP.get(num, f" {num}")
        return f"{base_en}{r_num}"

    # Story/Battle patterns: メカチュラ物語N, シンエン戦N, ムトウ戦N, 竜王N, ブレアソールN-N
    m = _re.match(r"^シンエン戦(\d+)$", t)
    if m: return f"Shin'en Battle {m.group(1)}"
    m = _re.match(r"^ムトウ戦(\d+)$", t)
    if m: return f"Mutoh Battle {m.group(1)}"
    m = _re.match(r"^メカチュラ物語(\d+)$", t)
    if m: return f"Mechathura Tales {m.group(1)}"
    m = _re.match(r"^竜王(\d+)$", t)
    if m: return f"Dragon King {m.group(1)}"
    m = _re.match(r"^ブレアソール(\d+-\d+)$", t)
    if m: return f"Braarsoul {m.group(1)}"

    # Check suffix maps
    for suf_ja, suf_en in SUFFIX_MAP.items():
        if t.endswith(suf_ja):
            base = t[:-len(suf_ja)].strip()
            base_en = translate_stage_title(base, dynamic_lookup)
            return f"{base_en}{suf_en}"

    # Check roman / symbol suffix
    for sym_ja, sym_en in ROMAN_MAP.items():
        if t.endswith(sym_ja):
            base = t[:-len(sym_ja)].strip()
            base_en = translate_stage_title(base, dynamic_lookup)
            return f"{base_en}{sym_en}"

    # Space-separated token prefix matching (e.g. "メビウスFF RECODE" -> "Mobius FF RECODE")
    if " " in t:
        parts = t.split(" ", 1)
        if dynamic_lookup and parts[0] in dynamic_lookup:
            part0_en = dynamic_lookup[parts[0]].get("en", parts[0])
            part1_en = translate_stage_title(parts[1], dynamic_lookup)
            return f"{part0_en} {part1_en}"

    return t



def derive_chapter_display_name(ch: dict, ch_no: int, strings_db: dict, dynamic_lookup: dict | None = None) -> str:
    """Derive the best human-readable English name for a chapter using official game string sets."""
    scenario_set = strings_db.get("scenarioSet") or []

    # Main Story 1-42
    if 1 <= ch_no <= 42:
        idx = ch_no - 1
        if idx < len(scenario_set):
            name = (scenario_set[idx].get("en") or "").strip()
            if name and not name.startswith("MAP"):
                return name

    # New Chapters 100-104 (The Rusty Swordsman, etc.)
    if 100 <= ch_no <= 104:
        idx = 42 + (ch_no - 100)
        if idx < len(scenario_set):
            name = (scenario_set[idx].get("en") or "").strip()
            if name:
                return name

    # Descent of the Five 110-114
    if 110 <= ch_no <= 114:
        idx = 47 + (ch_no - 110)
        if idx < len(scenario_set):
            boss = (scenario_set[idx].get("en") or "").strip()
            if boss:
                return f"Descent of the Five: {boss}"

    # Descent of the Five Hard 115-119
    if 115 <= ch_no <= 119:
        idx = 52 + (ch_no - 115)
        if idx < len(scenario_set):
            boss = (scenario_set[idx].get("en") or "").strip()
            if boss:
                return f"Descent of the Five: {boss} (Hard)"

    # Special Chapters: derive from translating the first non-empty section title
    for sec in ch.get("sections", []):
        raw_t = (sec.get("title") or "").strip()
        if raw_t:
            trans = translate_stage_title(raw_t, dynamic_lookup)
            if trans:
                return trans

    return f"Chapter {ch_no}"
