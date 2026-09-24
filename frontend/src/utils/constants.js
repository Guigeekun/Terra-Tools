export const rarityLabels = {
  2: 'D Class', 3: 'C Class', 4: 'B Class', 5: 'A Class',
  6: 'S Class', 7: 'SS Class', 8: 'Z Class'
};

export const rarityShortLabels = {
  2: 'D', 3: 'C', 4: 'B', 5: 'A', 6: 'S', 7: 'SS', 8: 'Z'
};

export const speciesTranslations = {
  0: { en: 'Human', ja: 'ヒト', fr: 'Humain', de: 'Mensch', es: 'Humano', zh_tw: '人族' },
  1: { en: 'Lizardfolk', ja: 'トカゲ', fr: 'Saurien', de: 'Echsenvolk', es: 'Lagarto', zh_tw: '爬蟲族' },
  2: { en: 'Beastfolk', ja: 'ケモノ', fr: 'Sauvage', de: 'Biestvolk', es: 'Bestia', zh_tw: '獸人族' },
  3: { en: 'Stonefolk', ja: '岩人', fr: 'Rocheux', de: 'Steinvolk', es: 'Pétreo', zh_tw: '岩人族' }
};

export const weaponMeta = {
  0: { name: 'Staff', color: '#c084fc', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/icon_wand_02.png' },
  1: { name: 'Sword', color: '#f87171', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/icon_sword_02.png' },
  2: { name: 'Spear', color: '#60a5fa', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/icon_spear_02.png' },
  3: { name: 'Bow', color: '#34d399', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/icon_bow_02.png' },
  4: { name: 'None', color: '#9ca3af', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/icon_other_02.png' }
};

export const elementMeta = {
  0:  { name: 'None', color: '#6b7280', svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><circle cx="12" cy="12" r="8" stroke-dasharray="2 2"></circle></svg>` },
  1:  { name: 'Fire', color: '#fb923c', icon: '/api/assets/image?path=user-data/extracted-gamedata/element_icons/icon_m_fire.png' },
  2:  { name: 'Ice', color: '#38bdf8', icon: '/api/assets/image?path=user-data/extracted-gamedata/element_icons/icon_m_ice.png' },
  3:  { name: 'Lightning', color: '#fde047', icon: '/api/assets/image?path=user-data/extracted-gamedata/element_icons/icon_m_thunder.png' },
  4:  { name: 'Darkness', color: '#c084fc', icon: '/api/assets/image?path=user-data/extracted-gamedata/element_icons/icon_m_darkness.png' },
  5:  { name: 'Healing', color: '#22c55e', svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));"><path d="M12 5v14M5 12h14" stroke="#22c55e" stroke-width="3"></path></svg>` },
  6:  { name: 'Remedy', color: '#06b6d4', svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));"><rect x="5" y="9" width="14" height="10" rx="2"></rect><path d="M9 9V5a2 2 0 0 1 4 0v4"></path><circle cx="12" cy="14" r="2" fill="currentColor"></circle></svg>` },
  17: { name: 'Photon', color: '#fbbf24', svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));"><circle cx="12" cy="12" r="5" fill="currentColor"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` },
  18: { name: 'Graviton', color: '#818cf8', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/gravity.png' },
  21: { name: 'Solar', color: '#fda4af', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/sun_02.png' },
  22: { name: 'Lunar', color: '#e9d5ff', icon: '/api/assets/image?path=user-data/extracted-gamedata/ui_icons/moon_01.png' }
};

// SkillAttrib enum values (SkillData `attrib` field), with visual styling.
// Physical variants reuse their base element color with a lighter shade.
export const skillAttribMeta = {
  0:  { name: 'None', color: '#6b7280' },
  1:  { name: 'Fire', color: '#fb923c', ...pickElementIcon(1) },
  2:  { name: 'Ice', color: '#38bdf8', ...pickElementIcon(2) },
  3:  { name: 'Lightning', color: '#fde047', ...pickElementIcon(3) },
  4:  { name: 'Darkness', color: '#c084fc', ...pickElementIcon(4) },
  5:  { name: 'Healing', color: '#22c55e', ...pickElementIcon(5) },
  6:  { name: 'Status', color: '#e879f9', svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><path d="M12 3l1.9 4.6L19 9l-4 3.4.9 5.1-3.9-2.7-3.9 2.7.9-5.1L5 9l5.1-1.4z"></path></svg>` },
  7:  { name: 'Non-elem. Magic', color: '#94a3b8' },
  10: { name: 'Absorb', color: '#f43f5e' },
  11: { name: 'Absorb (No Kill)', color: '#fb7185' },
  12: { name: 'Phys. Fire', color: '#fdba74', ...pickElementIcon(1) },
  13: { name: 'Phys. Ice', color: '#7dd3fc', ...pickElementIcon(2) },
  14: { name: 'Phys. Lightning', color: '#fef08a', ...pickElementIcon(3) },
  15: { name: 'Phys. Darkness', color: '#d8b4fe', ...pickElementIcon(4) },
  16: { name: 'Phys. Non-elem.', color: '#cbd5e1' },
  17: { name: 'Photon', color: '#fbbf24', ...pickElementIcon(17) },
  18: { name: 'Graviton', color: '#818cf8', ...pickElementIcon(18) },
  19: { name: 'Phys. Photon', color: '#fcd34d', ...pickElementIcon(17) },
  20: { name: 'Phys. Graviton', color: '#a5b4fc', ...pickElementIcon(18) },
  21: { name: 'Solar', color: '#fda4af', ...pickElementIcon(21) },
  22: { name: 'Lunar', color: '#e9d5ff', ...pickElementIcon(22) },
  23: { name: 'Phys. Solar', color: '#fecdd3', ...pickElementIcon(21) },
  24: { name: 'Phys. Lunar', color: '#f3e8ff', ...pickElementIcon(22) }
};

function pickElementIcon(attribId) {
  const meta = elementMeta[attribId] || {};
  const out = {};
  if (meta.icon) out.icon = meta.icon;
  if (meta.svg) out.svg = meta.svg;
  return out;
}

// SkillKind enum values (SkillData `kind` field)
export const skillKindLabels = {
  0: 'Attack', 1: 'Heal', 2: 'Counter', 3: 'Status Attack', 4: 'Status Apply',
  5: 'Equip Status', 6: 'Chain Point', 7: 'Constant Damage', 8: 'Constant Heal',
  9: 'Capsule', 10: 'Text', 11: 'Special', 12: 'Party Counter', 13: 'Powered Point',
  14: 'Lockon', 15: 'Emit Lockon', 16: 'Time Bomb', 17: 'Special Effect', 18: 'Gather',
  19: 'Magic Bomb', 20: 'Hop Break', 21: 'Fixed Lockon', 22: 'Attack + Status',
  23: 'Equip Display', 24: 'Wildcard', 25: 'Attack + Resist'
};

// SkillKind 20 ("Hop Break") skills are tap-activated: the player taps the unit
// before it moves. Their `emitRatio` holds the number of charges (uses per
// battle), not a proc percentage.
export const TAP_SKILL_KIND = 20;

export const isTapSkill = (skill) => skill?.kind === TAP_SKILL_KIND;

export function triggerText(skill) {
  if (!skill) return '—';
  if (isTapSkill(skill)) {
    const n = skill.emitRatio || 0;
    return `Tap · ${n} charge${n === 1 ? '' : 's'}`;
  }
  return (skill.emitRatio || 0) === 0 ? 'Equip' : `${skill.emitRatio}%`;
}

// Where a skill can come from
export const sourceTypeMeta = {
  character: { label: 'Character', icon: 'fa-user', color: '#38bdf8' },
  buddy:     { label: 'Companion', icon: 'fa-paw', color: '#34d399' },
  enemy:     { label: 'Enemy', icon: 'fa-skull', color: '#f87171' }
};

export const TAB_META = {
  dashboard:   { title: 'Dashboard Overview', desc: 'High-level statistics and category index of the exported game data.', icon: 'fa-chart-pie', label: 'Dashboard' },
  storybook:   { title: 'Interactive Storybook', desc: 'Experience the full Terra Battle narrative with background art, soundtracks, and chapter timeline.', icon: 'fa-book-open-reader', label: 'Storybook' },
  characters:  { title: 'Characters Database', desc: 'Browse character stats, unlock jobs, active skills, and local art assets.', icon: 'fa-users', label: 'Characters' },
  buddies:     { title: 'Companions (Buddies)', desc: 'Explore the companion stats, description profiles, and thumbnails.', icon: 'fa-paw', label: 'Companions' },
  skills:      { title: 'Skills Catalog', desc: 'List of active skills, status triggers, powers, and area calculations.', icon: 'fa-wand-magic-sparkles', label: 'Skills' },
  items:       { title: 'Items Inventory', desc: 'Browse equipment, job evolve materials, tokens, and materials.', icon: 'fa-gem', label: 'Items' },
  stages:      { title: 'Chapters & Stages', desc: 'Select chapters to view sections, recommended levels, enemy detail and drops.', icon: 'fa-map-location-dot', label: 'Chapters & Stages' },
  audio:         { title: 'Audio Asset Player', desc: 'Stream background music and sound effects directly extracted from the game files.', icon: 'fa-music', label: 'Audio Player' },
  saveEditor: { title: 'Savefile Editor', desc: 'Edit savefiles — characters, companions, items and more — and export them in their own format or convert between Project Liminal Gate and ReTB.', icon: 'fa-arrow-right-arrow-left', label: 'Save Editor' }
};

export const TAB_KEYS = Object.keys(TAB_META);
