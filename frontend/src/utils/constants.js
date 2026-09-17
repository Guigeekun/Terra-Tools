export const rarityLabels = {
  2: 'D Class', 3: 'C Class', 4: 'B Class', 5: 'A Class',
  6: 'S Class', 7: 'SS Class', 8: 'Z Class'
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

export const TAB_META = {
  dashboard:   { title: 'Dashboard Overview', desc: 'High-level statistics and category index of the exported game data.', icon: 'fa-chart-pie', label: 'Dashboard' },
  storybook:   { title: 'Interactive Storybook', desc: 'Experience the full Terra Battle narrative with background art, soundtracks, and chapter timeline.', icon: 'fa-book-open-reader', label: 'Storybook' },
  characters:  { title: 'Characters Database', desc: 'Browse character stats, unlock jobs, active skills, and local art assets.', icon: 'fa-users', label: 'Characters' },
  buddies:     { title: 'Companions (Buddies)', desc: 'Explore the companion stats, description profiles, and thumbnails.', icon: 'fa-paw', label: 'Companions' },
  skills:      { title: 'Skills Catalog', desc: 'List of active skills, status triggers, powers, and area calculations.', icon: 'fa-wand-magic-sparkles', label: 'Skills' },
  items:       { title: 'Items Inventory', desc: 'Browse equipment, job evolve materials, tokens, and materials.', icon: 'fa-gem', label: 'Items' },
  stages:      { title: 'Chapters & Stages', desc: 'Select chapters to view sections, recommended levels, enemy detail and drops.', icon: 'fa-map-location-dot', label: 'Chapters & Stages' },
  audio:         { title: 'Audio Asset Player', desc: 'Stream background music and sound effects directly extracted from the game files.', icon: 'fa-music', label: 'Audio Player' },
  saveConverter: { title: 'Savefile Converter', desc: 'Swap and convert savefiles seamlessly between Project Liminal Gate and ReTB formats.', icon: 'fa-arrow-right-arrow-left', label: 'Save Converter' }
};

export const TAB_KEYS = Object.keys(TAB_META);
