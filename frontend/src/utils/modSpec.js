// Pure logic for authoring TerraMod mod files (https://github.com/iaydios/TerraMod).
// A mod file is the JSON spec consumed by `terra_mod.py build --mod mods/` —
// new skills, companions and characters cloned from game entries. The studio
// keeps a rich draft state, then builds the spec (emitting only diffs against
// the template entries, which TerraMod deep-copies), validates it against the
// game catalogs, and derives the side artifacts (images.json recipe for
// `make_images.py`, server/buddies.json for `host_mod.py --buddies`).
// No fetching here: catalogs come from GameDataContext via the caller.

export const LANGS = ['en', 'ja', 'fr', 'de', 'es', 'zh_tw'];

// Skill IDs 3843-3852 are served by the game from a runtime array of nulls —
// pointing a job there freezes the character page. TerraMod pads those slots
// and assigns new IDs after the band automatically, so the studio never picks
// skill IDs: new skills are referenced by their spec `key` instead.
export const RESERVED_SKILL_ID_BASE = 3843;
export const RESERVED_SKILL_ID_COUNT = 10;

// TerraMod's opt-in native patch: a skill with successRate == 4242 gets its
// damage multiplied by a synced random factor.
export const RANDOM_POWER_SENTINEL = 4242;

// Every new image must be registered in the client's asset index with a cache
// version; new files have no cached copy, so any version works.
export const DEFAULT_ASSET_VER = 131;

// Stat names of a job, in display order.
export const JOB_STATS = ['HP', 'ATK', 'DEF', 'SATK', 'SDEF'];

// Buddy stats are min/max pairs in the database; the studio edits one value
// and emits both.
export const BUDDY_STATS = ['ATK', 'DEF', 'SATK', 'SDEF', 'BOOST'];

const DRAFT_VERSION = 1;

let uidCounter = 0;
export const nextUid = () => `e${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function emptyDraft() {
  return {
    v: DRAFT_VERSION,
    fileName: '10_my_mod',
    assetVer: DEFAULT_ASSET_VER,
    native: [],
    skills: [],
    characters: [],
    buddies: [],
  };
}

export function isCurrentDraft(draft) {
  return Boolean(draft) && draft.v === DRAFT_VERSION;
}

// ---------------------------------------------------------------- draft helpers

export function newSkill(templateSkillId) {
  return {
    _uid: nextUid(),
    key: '',
    templateSkillId,
    set: {},
    name: {},
    desc: {},
    range: {},
    randomPower: false,
  };
}

export function newJob(templateJobId, templateJob) {
  const stats = {};
  for (const s of JOB_STATS) {
    stats[s] = { min: templateJob?.[`${s}min`] ?? 0, max: templateJob?.[`${s}max`] ?? 0 };
  }
  return {
    _uid: nextUid(),
    jobId: null,
    templateJobId,
    templateImageId: templateJob?.ImageID ?? null,
    name: {},
    imageId: null,
    imageDims: {},
    imageTemplateOverride: '',
    // Editable job fields (delta vs the template job at build time).
    fields: {
      Gender: templateJob?.Gender ?? 0,
      Species: templateJob?.Species ?? 0,
      Attrib: templateJob?.Attrib ?? 0,
      SkillAttrib: templateJob?.SkillAttrib ?? 0,
      RANGE: templateJob?.RANGE ?? 0,
      HPcoeff: templateJob?.HPcoeff ?? 1,
      ATKcoeff: templateJob?.ATKcoeff ?? 1,
      DEFcoeff: templateJob?.DEFcoeff ?? 1,
      SATKcoeff: templateJob?.SATKcoeff ?? 1,
      SDEFcoeff: templateJob?.SDEFcoeff ?? 1,
      EXPcoeff: templateJob?.EXPcoeff ?? 2,
      EXPmax: templateJob?.EXPmax ?? 1000000,
    },
    extraFields: {},
    stats,
    skillSlots: (templateJob?.skills || []).map(id => ({ type: 'keep', key: '', skillId: id })),
    skillLevels: [...(templateJob?.skillMasterLevel || [])],
    profile: {},
  };
}

export function newCharacter(templateChrId, templateInfo, templateJobs) {
  const firstJob = templateJobs[0];
  return {
    _uid: nextUid(),
    chrId: null,
    templateChrId,
    name: {},
    rarity: templateInfo?.rarity ?? 6,
    generation: templateInfo?.generation ?? 2,
    isLambda: templateInfo?.isLambda ?? false,
    jobs: firstJob ? [newJob(firstJob.ID, firstJob)] : [],
    recode: {
      enabled: false,
      fromChrId: null,
      coins: 20000,
      items: [null, null, null].map(() => ({ itemId: null, count: 1 })),
      mons: [null, null].map(() => ({ chrId: null, level: 50 })),
    },
  };
}

export function newBuddy(templateBuddyId, templateBuddy) {
  const stats = {};
  for (const s of BUDDY_STATS) {
    stats[s] = templateBuddy?.[`${s}max`] ?? templateBuddy?.[`${s}min`] ?? 10;
  }
  return {
    _uid: nextUid(),
    buddyId: null,
    templateBuddyId,
    name: {},
    desc: {},
    exclusiveChrId: null,
    rarity: templateBuddy?.rarity ?? 4,
    type: templateBuddy?.type ?? 0,
    attrib: templateBuddy?.attrib ?? 0,
    kind: templateBuddy?.kind ?? 0,
    maxLevel: templateBuddy?.MaxLevel ?? 99,
    requiredLevel: templateBuddy?.RequiredLevel ?? 1,
    sortId: null,
    canDrop: 0,
    stats,
    imageId: null,
    templateImageId: templateBuddy?.ImageID ?? null,
    imageDims: {},
    imageTemplateOverride: '',
    skillMode: 'keep', // keep | new | existing
    skillKey: '',
    skillId: null,
    extraFields: {},
    server: { used: false, rarityLetter: 'Z', unique: false, pool: '', afterChrId: null,
              maxLevel: 1, expMax: 0, baseExp: 1, baseCoin: 1, expCoeff: 2.1,
              evolveId: 0, coinsToEvolve: 0, sameBonusBias: 1 },
  };
}

// ---------------------------------------------------------------- catalog helpers

// Next free IDs, computed from the catalogs so suggestions never collide.
export function nextFreeIds(characters = [], buddies = []) {
  let chrId = 1;
  let jobId = 1;
  for (const c of characters) {
    if (Number.isInteger(c?.ID)) chrId = Math.max(chrId, c.ID + 1);
    for (const jid of c?.Jobs || []) {
      if (Number.isInteger(jid)) jobId = Math.max(jobId, jid + 1);
    }
  }
  let buddyId = 1;
  let sortId = 0;
  for (const b of buddies) {
    if (Number.isInteger(b?.ID)) buddyId = Math.max(buddyId, b.ID + 1);
    if (Number.isInteger(b?.SortID)) sortId = Math.max(sortId, b.SortID + 1);
  }
  return { chrId, jobId, buddyId, sortId };
}

// Character catalog entries that are recode sources already have an active
// `recode` payload (placeholders are filtered serve-time).
export function isRecodedSource(characters, chrId) {
  const src = characters.find(c => c?.ID === chrId);
  return Boolean(src?.recode?.length);
}

// ---------------------------------------------------------------- build

// {'en': 'X', 'ja': '', 'fr': null} -> {'en': 'X'}; undefined when empty.
// TerraMod fills missing languages from English.
function cleanMultilingual(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'string' && v.trim() !== '') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function numberChanged(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a !== b;
  return na !== nb;
}

// Build one spec file from the draft. Catalogs (characters list with JobsInfo,
// raw skill array) provide the template values, so only genuine diffs land in
// the `set` / `fields` objects — TerraMod deep-copies the template first.
export function buildModSpec(draft, catalogs = {}) {
  const skills = catalogs.skills || [];
  const jobsById = jobLookup(catalogs.characters);
  const infosById = {};
  for (const c of catalogs.characters || []) {
    if (c?.ID !== undefined) infosById[c.ID] = c;
  }
  const spec = {};

  if (draft.skills.length) {
    spec.skills = draft.skills.map(sk => {
      const template = skills[sk.templateSkillId - 1] || {};
      const out = { key: sk.key, template: sk.templateSkillId - 1 };
      const set = {};
      for (const [k, v] of Object.entries(sk.set || {})) {
        if (v !== '' && v !== null && v !== undefined && numberChanged(v, template[k])) set[k] = v;
      }
      if (sk.randomPower) set.successRate = RANDOM_POWER_SENTINEL;
      if (Object.keys(set).length) out.set = set;
      const name = cleanMultilingual(sk.name);
      const desc = cleanMultilingual(sk.desc);
      const range = cleanMultilingual(sk.range);
      if (name) out.name = name;
      if (desc) out.desc = desc;
      if (range) out.range = range;
      return out;
    });
  }

  if (draft.buddies.length) {
    spec.buddies = draft.buddies.map(b => buildBuddyEntry(b));
  }

  if (draft.characters.length) {
    spec.characters = draft.characters.map(c => buildCharacterEntry(c, jobsById, infosById));
  }

  const assetDb = buildAssetDb(draft);
  if (assetDb) spec.asset_db = assetDb;
  if (draft.native?.length) spec.native = [...draft.native];
  return spec;
}

function jobLookup(characters = []) {
  const map = {};
  for (const c of characters) {
    for (const j of c?.JobsInfo || []) {
      if (j?.ID !== undefined) map[j.ID] = j;
    }
  }
  return map;
}

function buildCharacterEntry(c, jobsById, infosById) {
  const out = { id: c.chrId, template_character: c.templateChrId };
  const name = cleanMultilingual(c.name);
  if (name) out.name = name;
  for (const k of ['rarity', 'generation']) {
    if (c[k] !== null && c[k] !== undefined && c[k] !== '') out[k] = c[k];
  }
  // Λ is only emitted when it differs from the template (the flag is cloned).
  const tplLambda = infosById[c.templateChrId]?.isLambda;
  if (c.isLambda === true && tplLambda !== true) out.isLambda = true;
  out.jobs = (c.jobs || []).map(j => buildJobEntry(j, jobsById));
  const rc = c.recode;
  if (rc?.enabled && rc.fromChrId) {
    out.recode = {
      from: rc.fromChrId,
      coins: rc.coins,
      items: rc.items.map(i => [i.itemId, i.count]),
      mons: rc.mons.map(m => [m.chrId, m.level]),
    };
  }
  return out;
}

function buildJobEntry(j, jobsById) {
  const out = { id: j.jobId, template_job: j.templateJobId };
  const name = cleanMultilingual(j.name);
  if (name) out.name = name;
  if (j.imageId) out.image_id = j.imageId;

  const template = jobsById[j.templateJobId] || {};
  const fields = { ...(j.extraFields || {}) };
  for (const [k, v] of Object.entries(j.fields || {})) {
    if (v === '' || v === null || v === undefined) continue;
    if (numberChanged(v, template[k])) fields[k] = v;
  }
  if (Object.keys(fields).length) out.fields = fields;

  const stats = {};
  for (const s of JOB_STATS) {
    const st = j.stats?.[s];
    if (st && Number.isFinite(Number(st.min)) && Number.isFinite(Number(st.max))) {
      stats[s] = [Number(st.min), Number(st.max)];
    }
  }
  if (Object.keys(stats).length) out.stats = stats;

  out.skills = (j.skillSlots || []).map(slot => {
    if (slot.type === 'new') return `@${slot.key}`;
    return Number(slot.skillId);
  });
  if (j.skillLevels?.length) out.skill_levels = j.skillLevels.map(Number);

  const profile = cleanMultilingual(j.profile);
  if (profile) out.profile = profile;
  return out;
}

function buildBuddyEntry(b) {
  const out = { id: b.buddyId, template: b.templateBuddyId };
  const name = cleanMultilingual(b.name);
  const desc = cleanMultilingual(b.desc);
  if (name) out.name = name;
  if (desc) out.desc = desc;
  if (b.exclusiveChrId) out.exclusiveChrID = b.exclusiveChrId;
  for (const k of ['rarity', 'type', 'attrib', 'kind']) {
    if (b[k] !== null && b[k] !== undefined && b[k] !== '') out[k] = b[k];
  }
  // The draft uses camelCase for these two; the spec wants the DB names.
  if (b.maxLevel !== null && b.maxLevel !== undefined && b.maxLevel !== '') out.MaxLevel = b.maxLevel;
  if (b.requiredLevel !== null && b.requiredLevel !== undefined && b.requiredLevel !== '') out.RequiredLevel = b.requiredLevel;
  for (const s of BUDDY_STATS) {
    const v = b.stats?.[s];
    if (v !== null && v !== undefined && v !== '') {
      out[`${s}min`] = Number(v);
      out[`${s}max`] = Number(v);
    }
  }
  if (b.sortId) out.SortID = b.sortId;
  if (b.canDrop != null && b.canDrop !== '') out.canDrop = b.canDrop;
  if (b.imageId) out.image_id = b.imageId;
  if (b.skillMode === 'new' && b.skillKey) out.skill = `@${b.skillKey}`;
  if (b.skillMode === 'existing' && b.skillId) out.skill = Number(b.skillId);
  for (const [k, v] of Object.entries(b.extraFields || {})) {
    if (v !== '' && v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

// asset_db registers every new image in the client's AssetVersions index —
// images not listed there are never downloaded by the game.
function buildAssetDb(draft) {
  const ver = Number(draft.assetVer) || DEFAULT_ASSET_VER;
  const pieces = [];
  const illusts = [];
  const buddyImages = [];
  const buddyThumbs = [];
  for (const c of draft.characters) {
    for (const j of c.jobs || []) {
      if (!j.imageId) continue;
      const d = j.imageDims || {};
      if (d.piece?.w && d.piece?.h) pieces.push({ id: j.imageId, w: d.piece.w, h: d.piece.h, ver });
      if (d.illust?.w && d.illust?.h) illusts.push({ id: j.imageId, w: d.illust.w, h: d.illust.h, ver });
    }
  }
  for (const b of draft.buddies) {
    if (!b.imageId) continue;
    const d = b.imageDims || {};
    if (d.large?.w && d.large?.h) {
      buddyImages.push({ id: 0, name: `buddy_${b.imageId}a`, w: d.large.w, h: d.large.h, ver });
      const small = d.small?.w && d.small?.h ? d.small : d.large;
      buddyImages.push({ id: 0, name: `buddy_${b.imageId}b`, w: small.w, h: small.h, ver });
    }
    if (d.thumb?.w && d.thumb?.h) buddyThumbs.push({ id: b.imageId, w: d.thumb.w, h: d.thumb.h, ver });
  }
  const out = {};
  if (pieces.length) out.Pieces = pieces;
  if (illusts.length) out.Illusts = illusts;
  if (buddyImages.length) out.BuddyImages = buddyImages;
  if (buddyThumbs.length) out.BuddyThumbs = buddyThumbs;
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------- artifacts

// Recipe for TerraMod's make_images.py: one entry per downloadable file.
// Unity-bundle images are rebuilt in place from a template whose name has the
// same length; profiles are plain JPEGs and need no template.
export function buildImagesRecipe(draft) {
  const out = [];
  for (const c of draft.characters) {
    for (const j of c.jobs || []) {
      if (!j.imageId) continue;
      const tpl = j.imageTemplateOverride || j.templateImageId;
      const pieceSrc = `art/img_${j.imageId}.png`;
      const illustSrc = `art/illust_${j.imageId}.png`;
      if (tpl) {
        out.push({ new: `img_${j.imageId}`, template: `img_${tpl}`, src: pieceSrc });
        out.push({ new: `illust_${j.imageId}`, template: `illust_${tpl}`, src: illustSrc });
      } else {
        out.push({ new: `img_${j.imageId}`, template: '', src: pieceSrc });
        out.push({ new: `illust_${j.imageId}`, template: '', src: illustSrc });
      }
      out.push({ new: `profile_${j.imageId}`, src: `art/profile_${j.imageId}.jpg` });
      out.push({ new: `profile_${j.imageId}_m`, src: `art/profile_${j.imageId}_m.jpg`, prefix_of: `profile_${j.imageId}` });
    }
  }
  for (const b of draft.buddies) {
    if (!b.imageId) continue;
    const tpl = b.imageTemplateOverride || b.templateImageId || b.templateBuddyId;
    const templates = tpl
      ? { a: `buddy_${tpl}a`, b: `buddy_${tpl}b`, t: `bimg_${tpl}` }
      : { a: '', b: '', t: '' };
    out.push({ new: `buddy_${b.imageId}a`, template: templates.a, src: `art/buddy_${b.imageId}a.png` });
    out.push({ new: `buddy_${b.imageId}b`, template: templates.b, src: `art/buddy_${b.imageId}b.png` });
    out.push({ new: `bimg_${b.imageId}`, template: templates.t, src: `art/bimg_${b.imageId}.png` });
  }
  return out;
}

// Optional server-side companion rules for `host_mod.py --buddies` (draw pools,
// unique companions, the guaranteed coin draw).
export function buildServerBuddies(draft) {
  const out = [];
  for (const b of draft.buddies) {
    const s = b.server;
    if (!s?.used) continue;
    out.push({
      id: b.buddyId,
      rarity_letter: s.rarityLetter || 'Z',
      unique: Boolean(s.unique),
      pool: s.pool || null,
      name: cleanMultilingual(b.name) || { en: `Companion ${b.buddyId}` },
      max_level: Number(s.maxLevel ?? 1),
      exp_max: Number(s.expMax ?? 0),
      base_exp: Number(s.baseExp ?? 1),
      base_coin: Number(s.baseCoin ?? 1),
      exp_coeff: Number(s.expCoeff ?? 2.1),
      evolve_id: Number(s.evolveId ?? 0),
      coins_to_evolve: Number(s.coinsToEvolve ?? 0),
      same_bonus_bias: Number(s.sameBonusBias ?? 1),
      after_chr: s.afterChrId || null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- validation

// Returns a list of { level: 'error' | 'warning', section, message }.
// Errors block the download; warnings don't.
export function validateDraft(draft, catalogs = {}) {
  const issues = [];
  const characters = catalogs.characters || [];
  const skills = catalogs.skills || [];
  const buddies = catalogs.buddies || [];
  const items = catalogs.items || [];
  const jobsById = jobLookup(characters);

  const err = (section, message) => issues.push({ level: 'error', section, message });
  const warn = (section, message) => issues.push({ level: 'warning', section, message });

  const fileName = (draft.fileName || '').trim();
  if (!fileName) err('Mod file', 'Pick a file name (e.g. 10_my_mod).');
  else if (!/^[0-9]+[a-z0-9_-]*$/i.test(fileName)) {
    warn('Mod file', 'TerraMod applies mods/ files in name order — starting with a number (10_my_mod) keeps the order predictable.');
  }

  if (!draft.skills.length && !draft.characters.length && !draft.buddies.length) {
    err('Mod', 'This mod is empty — add a skill, character or companion.');
  }

  // Skills
  const skillKeys = new Set();
  for (const sk of draft.skills) {
    const label = sk.key || `#${sk.templateSkillId}`;
    if (!sk.key) err('Skills', `A skill has no key — give it a name key (e.g. my_skill).`);
    else if (!/^[A-Za-z0-9_]+$/.test(sk.key)) err('Skills', `Skill key "${sk.key}" may only use letters, digits and _.`);
    else if (skillKeys.has(sk.key)) err('Skills', `Duplicate skill key "${sk.key}".`);
    skillKeys.add(sk.key);
    if (!(sk.templateSkillId >= 1 && sk.templateSkillId <= skills.length)) {
      err('Skills', `Skill "${label}" has an invalid template skill.`);
    }
    const hasName = cleanMultilingual(sk.name);
    const hasSet = Object.keys(sk.set || {}).some(k => sk.set[k] !== '' && sk.set[k] !== null) || sk.randomPower;
    if (!hasName && !hasSet) warn('Skills', `Skill "${label}" is identical to its template — it will still be added as a new skill.`);
  }

  // Characters
  const usedChr = new Set(characters.map(c => c?.ID));
  const usedJob = new Set();
  for (const c of characters) for (const jid of c?.Jobs || []) usedJob.add(jid);
  const claimedChr = new Set();
  const claimedJob = new Set();

  for (const c of draft.characters) {
    const label = cleanMultilingual(c.name)?.en || `character #${c.chrId ?? '?'}`;
    if (!cleanMultilingual(c.name)?.en) err('Characters', `${label}: the English name is required.`);
    if (!Number.isInteger(c.chrId) || c.chrId < 1) err('Characters', `${label}: pick a character ID.`);
    else {
      if (usedChr.has(c.chrId)) err('Characters', `Character ID ${c.chrId} already exists in the game (${nameOf(characters, c.chrId)}).`);
      if (claimedChr.has(c.chrId)) err('Characters', `Character ID ${c.chrId} is used twice in this mod.`);
      claimedChr.add(c.chrId);
    }
    if (!characters.some(t => t?.ID === c.templateChrId)) err('Characters', `${label}: invalid template character.`);

    if (!c.jobs?.length) err('Characters', `${label}: add at least one job.`);
    for (const j of c.jobs || []) {
      const jobLabel = cleanMultilingual(j.name)?.en || label;
      if (!Number.isInteger(j.jobId) || j.jobId < 1) err('Characters', `${jobLabel}: pick a job ID.`);
      else {
        if (usedJob.has(j.jobId)) err('Characters', `Job ID ${j.jobId} already exists in the game.`);
        if (claimedJob.has(j.jobId)) err('Characters', `Job ID ${j.jobId} is used twice in this mod.`);
        claimedJob.add(j.jobId);
      }
      if (!jobsById[j.templateJobId]) err('Characters', `${jobLabel}: invalid template job.`);

      const template = jobsById[j.templateJobId];
      const slotCount = j.skillSlots?.length ?? 0;
      if (template && slotCount !== (template.skills?.length ?? 0)) {
        err('Characters', `${jobLabel}: the skill list must have exactly ${template.skills?.length ?? 0} entries (template job has that many slots).`);
      }
      (j.skillSlots || []).forEach((slot, i) => {
        if (slot.type === 'new') {
          if (!slot.key) err('Characters', `${jobLabel}: skill slot ${i + 1} is set to a new skill but has no key.`);
          else if (!skillKeys.has(slot.key)) err('Characters', `${jobLabel}: skill slot ${i + 1} references unknown skill key "${slot.key}".`);
        } else if (slot.type === 'existing') {
          if (!(slot.skillId >= 1 && slot.skillId <= skills.length)) {
            err('Characters', `${jobLabel}: skill slot ${i + 1} has an invalid skill ID.`);
          }
        }
      });
      (j.skillLevels || []).forEach((lv, i) => {
        if (!(Number(lv) >= 1 && Number(lv) <= 99)) {
          err('Characters', `${jobLabel}: skill unlock level ${i + 1} must be between 1 and 99.`);
        }
      });
      if (!j.imageId) warn('Characters', `${jobLabel}: no image ID — the job will reuse the template's art.`);
      else if (j.imageTaken) err('Characters', `Image ID ${j.imageId} is already used by existing game art (img_${j.imageId}).`);
      else if (!j.imageDims?.piece?.w || !j.imageDims?.illust?.w) {
        warn('Images', `Image ID ${j.imageId}: piece/illustration dimensions are missing — fill them in the Images section or the game client won't download the art.`);
      }
    }

    const rc = c.recode;
    if (rc?.enabled) {
      if (!characters.some(t => t?.ID === rc.fromChrId)) {
        err('Characters', `${label}: the recode source character does not exist.`);
      } else if (isRecodedSource(characters, rc.fromChrId)) {
        err('Characters', `${label}: ${nameOf(characters, rc.fromChrId)} already has a DNA recode.`);
      } else if (rc.fromChrId === c.chrId) {
        err('Characters', `${label}: the recode source must be a different character.`);
      }
      if (!(Number(rc.coins) >= 0)) err('Characters', `${label}: recode coin cost must be 0 or more.`);
      rc.items?.forEach((it, i) => {
        if (!(it.itemId >= 1 && it.itemId <= items.length)) err('Characters', `${label}: recode item ${i + 1} is missing.`);
        else if (!(Number(it.count) >= 1 && Number(it.count) <= 255)) err('Characters', `${label}: recode item ${i + 1} count must be 1-255 (it is packed into one byte).`);
      });
      rc.mons?.forEach((m, i) => {
        if (!usedChr.has(m.chrId)) err('Characters', `${label}: recode companion ${i + 1} must be an existing character.`);
        if (!(Number(m.level) >= 1 && Number(m.level) <= 99)) err('Characters', `${label}: recode companion ${i + 1} level must be 1-99.`);
      });
    }
  }

  // Companions
  const usedBuddy = new Set(buddies.map(b => b?.ID));
  const claimedBuddy = new Set();
  for (const b of draft.buddies) {
    const label = cleanMultilingual(b.name)?.en || `companion #${b.buddyId ?? '?'}`;
    if (!cleanMultilingual(b.name)?.en) err('Companions', `${label}: the English name is required.`);
    if (!Number.isInteger(b.buddyId) || b.buddyId < 1) err('Companions', `${label}: pick a companion ID.`);
    else {
      if (usedBuddy.has(b.buddyId)) err('Companions', `Companion ID ${b.buddyId} already exists in the game.`);
      if (claimedBuddy.has(b.buddyId)) err('Companions', `Companion ID ${b.buddyId} is used twice in this mod.`);
      claimedBuddy.add(b.buddyId);
    }
    if (!buddies.some(t => t?.ID === b.templateBuddyId)) err('Companions', `${label}: invalid template companion.`);
    if (b.skillMode === 'new') {
      if (!b.skillKey) err('Companions', `${label}: the skill is set to a new skill but has no key.`);
      else if (!skillKeys.has(b.skillKey)) err('Companions', `${label}: references unknown skill key "${b.skillKey}".`);
    } else if (b.skillMode === 'existing') {
      if (!(b.skillId >= 1 && b.skillId <= skills.length)) err('Companions', `${label}: invalid skill ID.`);
    }
    if (b.exclusiveChrId && !usedChr.has(b.exclusiveChrId)) {
      err('Companions', `${label}: the exclusive character does not exist.`);
    }

    const s = b.server;
    if (s?.used) {
      // The guaranteed-draw character may be one this same mod adds.
      if (s.afterChrId && !usedChr.has(s.afterChrId) && !claimedChr.has(s.afterChrId)) {
        err('Companions', `${label}: the "guaranteed after character" ID does not exist in the game or this mod.`);
      }
      if (s.pool && !['truth', 'fellowship'].includes(s.pool)) err('Companions', `${label}: the draw pool must be truth, fellowship or empty.`);
    }
  }

  // Native patches
  const needsRandomPower = draft.skills.some(sk => sk.randomPower)
    || draft.buddies.some(b => b.skillMode === 'new' && b.skillKey
      && draft.skills.find(sk => sk.key === b.skillKey)?.randomPower);
  if (needsRandomPower && !draft.native.includes('random_power')) {
    err('Native', 'A skill uses random damage — enable the random_power native patch (Advanced section).');
  }
  if (draft.native.includes('star_range')) {
    warn('Native', 'star_range is active only for skills with range 10 and sx >= 7 — make sure at least one skill uses that shape.');
  }
  if (draft.native.length) {
    warn('Native', 'Native patches change libil2cpp.so and drop armeabi-v7a from the APK — everyone using the mod must install the modded game APK.');
  }

  // Image recipes need a same-length template; without one make_images fails.
  for (const c of draft.characters) {
    for (const j of c.jobs || []) {
      if (j.imageId && !(j.imageTemplateOverride || j.templateImageId)) {
        warn('Images', `Image ID ${j.imageId}: no template — set one in the Images section (same digit count as ${j.imageId}).`);
      }
    }
  }
  for (const b of draft.buddies) {
    if (b.imageId && !(b.imageTemplateOverride || b.templateImageId || b.templateBuddyId)) {
      warn('Images', `Image ID ${b.imageId}: no template — set one in the Images section.`);
    }
    if (b.imageId && (!b.imageDims?.large?.w || !b.imageDims?.thumb?.w)) {
      warn('Images', `Companion image ID ${b.imageId}: large/thumb dimensions are missing — fill them in the Images section or the game client won't download the art.`);
    }
  }

  return issues;
}

function nameOf(characters, id) {
  const c = characters.find(x => x?.ID === id);
  return c?.NameString?.en || `character ${id}`;
}

// ---------------------------------------------------------------- import

// Best-effort reverse mapping of an existing spec file into a draft, so
// shared mods can be loaded and tweaked. Round-trips through buildModSpec.
export function draftFromSpec(spec) {
  const draft = emptyDraft();
  draft.native = Array.isArray(spec.native) ? spec.native.filter(n => typeof n === 'string') : [];
  const pieces = spec.asset_db?.Pieces || [];
  if (pieces[0]?.ver) draft.assetVer = pieces[0].ver;
  else if (spec.asset_db?.Illusts?.[0]?.ver) draft.assetVer = spec.asset_db.Illusts[0].ver;

  for (const sk of spec.skills || []) {
    const skill = newSkill((sk.template ?? 0) + 1);
    skill.key = sk.key || '';
    skill.set = {};
    for (const [k, v] of Object.entries(sk.set || {})) {
      if (k === 'successRate' && v === RANDOM_POWER_SENTINEL) skill.randomPower = true;
      else skill.set[k] = v;
    }
    skill.name = { ...(sk.name || {}) };
    skill.desc = { ...(sk.desc || {}) };
    skill.range = { ...(sk.range || {}) };
    draft.skills.push(skill);
  }

  for (const b of spec.buddies || []) {
    const buddy = newBuddy(b.template, null);
    buddy.buddyId = b.id;
    buddy.name = { ...(b.name || {}) };
    buddy.desc = { ...(b.desc || {}) };
    buddy.exclusiveChrId = b.exclusiveChrID || null;
    buddy.rarity = b.rarity ?? buddy.rarity;
    buddy.type = b.type ?? 0;
    buddy.attrib = b.attrib ?? 0;
    buddy.kind = b.kind ?? 0;
    buddy.maxLevel = b.MaxLevel ?? 99;
    buddy.requiredLevel = b.RequiredLevel ?? 1;
    buddy.sortId = b.SortID ?? null;
    buddy.canDrop = b.canDrop ?? 0;
    for (const s of BUDDY_STATS) {
      if (b[`${s}max`] !== undefined) buddy.stats[s] = b[`${s}max`];
    }
    buddy.imageId = b.image_id ?? null;
    if (typeof b.skill === 'string' && b.skill.startsWith('@')) {
      buddy.skillMode = 'new';
      buddy.skillKey = b.skill.slice(1);
    } else if (b.skill) {
      buddy.skillMode = 'existing';
      buddy.skillId = b.skill;
    }
    const extra = {};
    for (const [k, v] of Object.entries(b)) {
      if (!['id', 'template', 'name', 'desc', 'exclusiveChrID', 'rarity', 'type', 'attrib', 'kind',
        'MaxLevel', 'RequiredLevel', 'SortID', 'canDrop', 'image_id', 'skill',
        ...BUDDY_STATS.flatMap(s => [`${s}min`, `${s}max`])].includes(k)) {
        extra[k] = v;
      }
    }
    if (Object.keys(extra).length) buddy.extraFields = extra;
    draft.buddies.push(buddy);
  }

  for (const c of spec.characters || []) {
    const templateInfo = null;
    const character = newCharacter(c.template_character, templateInfo, []);
    character.chrId = c.id;
    character.name = { ...(c.name || {}) };
    character.rarity = c.rarity ?? character.rarity;
    character.generation = c.generation ?? character.generation;
    character.isLambda = c.isLambda ?? false;
    character.jobs = (c.jobs || []).map(j => {
      const job = newJob(j.template_job, null);
      job.jobId = j.id;
      job.name = { ...(j.name || {}) };
      job.imageId = j.image_id ?? null;
      job.fields = {};
      const extra = {};
      for (const [k, v] of Object.entries(j.fields || {})) {
        if (k in job.fields) job.fields[k] = v;
        else extra[k] = v;
      }
      if (Object.keys(extra).length) job.extraFields = extra;
      if (j.stats) {
        for (const s of JOB_STATS) {
          if (Array.isArray(j.stats[s])) job.stats[s] = { min: j.stats[s][0], max: j.stats[s][1] };
        }
      }
      job.skillSlots = (j.skills || []).map(id => (
        typeof id === 'string' && id.startsWith('@')
          ? { type: 'new', key: id.slice(1), skillId: null }
          : { type: 'existing', key: '', skillId: id }
      ));
      job.skillLevels = [...(j.skill_levels || [])];
      job.profile = { ...(j.profile || {}) };
      return job;
    });
    if (c.recode) {
      character.recode = {
        enabled: true,
        fromChrId: c.recode.from,
        coins: c.recode.coins ?? 20000,
        items: [0, 1, 2].map(i => ({
          itemId: Array.isArray(c.recode.items?.[i]) ? c.recode.items[i][0] : null,
          count: Array.isArray(c.recode.items?.[i]) ? c.recode.items[i][1] : 1,
        })),
        mons: [0, 1].map(i => ({
          chrId: Array.isArray(c.recode.mons?.[i]) ? c.recode.mons[i][0] : null,
          level: Array.isArray(c.recode.mons?.[i]) ? c.recode.mons[i][1] : 50,
        })),
      };
    }
    draft.characters.push(character);
  }

  // Reconstruct image dimensions from the asset_db block so the imported
  // draft rebuilds the same asset_db (template image IDs aren't in the spec
  // file and stay empty — the Images section flags them).
  const pieceById = {};
  for (const e of spec.asset_db?.Pieces || []) pieceById[e.id] = { w: e.w, h: e.h };
  const illustById = {};
  for (const e of spec.asset_db?.Illusts || []) illustById[e.id] = { w: e.w, h: e.h };
  const buddyImgByName = {};
  for (const e of spec.asset_db?.BuddyImages || []) buddyImgByName[e.name] = { w: e.w, h: e.h };
  const buddyThumbById = {};
  for (const e of spec.asset_db?.BuddyThumbs || []) buddyThumbById[e.id] = { w: e.w, h: e.h };
  for (const c of draft.characters) {
    for (const j of c.jobs) {
      if (!j.imageId) continue;
      const dims = {};
      if (pieceById[j.imageId]) dims.piece = pieceById[j.imageId];
      if (illustById[j.imageId]) dims.illust = illustById[j.imageId];
      if (Object.keys(dims).length) j.imageDims = dims;
    }
  }
  for (const b of draft.buddies) {
    if (!b.imageId) continue;
    const dims = {};
    if (buddyImgByName[`buddy_${b.imageId}a`]) {
      dims.large = buddyImgByName[`buddy_${b.imageId}a`];
      dims.small = buddyImgByName[`buddy_${b.imageId}b`] || { ...dims.large };
    }
    if (buddyThumbById[b.imageId]) dims.thumb = buddyThumbById[b.imageId];
    if (Object.keys(dims).length) b.imageDims = dims;
  }

  return draft;
}
