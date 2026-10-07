// Gold-file acceptance test for Mod Studio (run: node gold_test.mjs)
// Rebuilds TerraMod's shipped Ma'curi Λ + Mech Arm mods (mods/10_*, mods/11_*,
// images.json, server/buddies.json) through the studio's draft state and
// compares the generated artifacts. Paths are overridable:
//   GAME_DATA_DIR=…/extracted-gamedata/game_data  TERRAMOD_DIR=…/TerraMod
import { readFileSync, writeFileSync } from 'node:fs';
import {
  emptyDraft, newSkill, newJob, newCharacter, newBuddy,
  buildModSpec, validateDraft, buildImagesRecipe, buildServerBuddies, draftFromSpec,
} from './src/utils/modSpec.js';

const GAME = process.env.GAME_DATA_DIR || 'G:/Terra/Terra-Tools/user-data/extracted-gamedata/game_data';
const MODS = process.env.TERRAMOD_DIR || 'G:/Terra/TerraMod-study';

const chrDb = JSON.parse(readFileSync(`${GAME}/ChrDatabase.json`, 'utf8'));
const jobsById = Object.fromEntries(chrDb.data.map(j => [j.ID, j]));
const characters = chrDb.infos.map(info => ({
  ...info,
  JobsInfo: (info.Jobs || []).map(id => jobsById[id]).filter(Boolean),
}));
const skills = JSON.parse(readFileSync(`${GAME}/SkillData.json`, 'utf8')).types;
const buddies = JSON.parse(readFileSync(`${GAME}/BuddyDatabase.json`, 'utf8')).data;
const items = JSON.parse(readFileSync(`${GAME}/ItemSet.json`, 'utf8')).itemSet;
const catalogs = { characters, skills, buddies, items };

const langs = (v) => {
  if (typeof v === 'string') return { en: v };
  return v;
};

// Gold files sometimes carry multilingual objects whose every value is ""
// (TerraMod fills those from English) — normalize them away.
const stripEmptyLang = (obj) => {
  const out = { ...obj };
  for (const field of ['name', 'desc', 'range']) {
    const v = out[field];
    if (v && typeof v === 'object' && Object.values(v).every(x => x === '')) delete out[field];
  }
  return out;
};

const sortKeysDeep = (x) => {
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, sortKeysDeep(v)]));
  }
  return x;
};

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

function compareSkills(built, gold, label) {
  if (built.length !== gold.length) return fail(`${label}: skill count ${built.length} != ${gold.length}`);
  for (let i = 0; i < gold.length; i++) {
    const g = gold[i];
    const b = built.find(s => s.key === g.key);
    if (!b) return fail(`${label}/${g.key}: missing`);
    if (b.template !== g.template) fail(`${label}/${g.key}: template ${b.template} != ${g.template}`);
    const tpl = skills[g.template];
    for (const [k, v] of Object.entries(g.set || {})) {
      if (!(k in (b.set || {}))) {
        if (Number(tpl[k]) !== Number(v)) fail(`${label}/${g.key}.set.${k}: omitted but not the template value`);
      } else if (Number(b.set[k]) !== Number(v)) {
        fail(`${label}/${g.key}.set.${k}: ${b.set[k]} != ${v}`);
      }
    }
    for (const k of Object.keys(b.set || {})) {
      if (!(k in (g.set || {}))) fail(`${label}/${g.key}.set.${k}: extra key not in gold`);
    }
    if (JSON.stringify(b.name || null) !== JSON.stringify(g.name ? langs(g.name) : null)
      && Object.keys(b.name || {}).length !== Object.keys(langs(g.name)).length) {
      fail(`${label}/${g.key}: name mismatch`);
    }
    for (const field of ['name', 'desc', 'range']) {
      const gv = g[field] ? langs(g[field]) : null;
      const bv = b[field] || null;
      const emptyG = gv && Object.values(gv).every(x => x === '');
      if (!emptyG && JSON.stringify(gv) !== JSON.stringify(bv)) fail(`${label}/${g.key}.${field}: ${JSON.stringify(bv)} != ${JSON.stringify(gv)}`);
    }
  }
  ok(`${label}: skills match (${built.length})`);
}

function compareCharacters(built, gold, label) {
  if (built.length !== gold.length) return fail(`${label}: character count ${built.length} != ${gold.length}`);
  for (let i = 0; i < gold.length; i++) {
    const g = gold[i];
    const b = built.find(c => c.id === g.id);
    if (!b) return fail(`${label}: missing character ${g.id}`);
    for (const k of ['id', 'template_character', 'rarity', 'generation']) {
      if (JSON.stringify(b[k]) !== JSON.stringify(g[k])) fail(`${label}/${g.id}.${k}: ${JSON.stringify(b[k])} != ${JSON.stringify(g[k])}`);
    }
    if (JSON.stringify(b.name) !== JSON.stringify(langs(g.name))) fail(`${label}/${g.id}: name mismatch`);
    // jobs
    if (b.jobs.length !== g.jobs.length) return fail(`${label}/${g.id}: job count`);
    for (let j = 0; j < g.jobs.length; j++) {
      const gj = g.jobs[j];
      const bj = b.jobs[j];
      for (const k of ['id', 'template_job', 'image_id']) {
        if (JSON.stringify(bj[k]) !== JSON.stringify(gj[k])) fail(`${label}/${g.id}/job.${k}: ${JSON.stringify(bj[k])} != ${JSON.stringify(gj[k])}`);
      }
      if (JSON.stringify(bj.name) !== JSON.stringify(langs(gj.name))) fail(`${label}/${g.id}/job: name mismatch`);
      const tpl = jobsById[gj.template_job];
      for (const [k, v] of Object.entries(gj.fields || {})) {
        if (!(k in (bj.fields || {}))) {
          if (Number(tpl[k]) !== Number(v)) fail(`${label}/${g.id}/job.fields.${k}: omitted but not template value (${tpl[k]})`);
        } else if (Number(bj.fields[k]) !== Number(v)) {
          fail(`${label}/${g.id}/job.fields.${k}: ${bj.fields[k]} != ${v}`);
        }
      }
      for (const [k, v] of Object.entries(gj.stats || {})) {
        if (JSON.stringify(bj.stats?.[k]) !== JSON.stringify(v)) fail(`${label}/${g.id}/job.stats.${k}: ${JSON.stringify(bj.stats?.[k])} != ${JSON.stringify(v)}`);
      }
      if (JSON.stringify(bj.skills) !== JSON.stringify(gj.skills)) fail(`${label}/${g.id}/job.skills: ${JSON.stringify(bj.skills)} != ${JSON.stringify(gj.skills)}`);
      if (JSON.stringify(bj.skill_levels) !== JSON.stringify(gj.skill_levels)) fail(`${label}/${g.id}/job.skill_levels mismatch`);
      if (JSON.stringify(bj.profile) !== JSON.stringify(langs(gj.profile))) fail(`${label}/${g.id}/job.profile mismatch`);
    }
    // recode
    const brc = b.recode;
    const grc = g.recode;
    if (JSON.stringify(brc) !== JSON.stringify(grc)) {
      fail(`${label}/${g.id}: recode ${JSON.stringify(brc)} != ${JSON.stringify(grc)}`);
    }
  }
  ok(`${label}: characters match`);
}

function compareBuddies(built, gold, label) {
  if (built.length !== gold.length) return fail(`${label}: buddy count ${built.length} != ${gold.length}`);
  for (let i = 0; i < gold.length; i++) {
    const g = gold[i];
    const b = built[i];
    for (const [k, v] of Object.entries(g)) {
      if (['name', 'desc'].includes(k)) {
        if (JSON.stringify(b[k]) !== JSON.stringify(langs(v))) fail(`${label}/${g.id}.${k} mismatch`);
      } else if (k === 'template') {
        if (b.template !== v) fail(`${label}/${g.id}.template mismatch`);
      } else if (JSON.stringify(b[k]) !== JSON.stringify(v)) {
        fail(`${label}/${g.id}.${k}: ${JSON.stringify(b[k])} != ${JSON.stringify(v)}`);
      }
    }
  }
  ok(`${label}: buddies match`);
}

// ---------------------------------------------------------------- draft

const g10 = JSON.parse(readFileSync(`${MODS}/mods/10_macuri_lambda.json`, 'utf8'));
const g11 = JSON.parse(readFileSync(`${MODS}/mods/11_macuri_mech_arm.json`, 'utf8'));

const draft = emptyDraft();
draft.fileName = '10_macuri_lambda';
draft.native = ['random_power'];

for (const gs of [...g10.skills, ...g11.skills]) {
  const sk = newSkill(gs.template + 1);
  sk.key = gs.key;
  sk.set = {};
  for (const [k, v] of Object.entries(gs.set || {})) {
    if (k === 'successRate' && v === 4242) sk.randomPower = true;
    else sk.set[k] = v;
  }
  sk.name = { ...(gs.name || {}) };
  sk.desc = { ...(gs.desc || {}) };
  sk.range = { ...(gs.range || {}) };
  draft.skills.push(sk);
}

const gc = g10.characters[0];
const tplInfo = characters.find(c => c.ID === gc.template_character);
const chr = newCharacter(gc.template_character, tplInfo, tplInfo.JobsInfo);
chr.chrId = gc.id;
chr.name = { ...gc.name };
chr.rarity = gc.rarity;
chr.generation = gc.generation;
chr.jobs = gc.jobs.map(gj => {
  const job = newJob(gj.template_job, jobsById[gj.template_job]);
  job.jobId = gj.id;
  job.name = { ...gj.name };
  job.imageId = gj.image_id;
  job.templateImageId = 2124;
  job.fields = { ...gj.fields };
  job.stats = Object.fromEntries(Object.entries(gj.stats).map(([k, [min, max]]) => [k, { min, max }]));
  job.skillSlots = gj.skills.map(id => (typeof id === 'string' ? { type: 'new', key: id.slice(1), skillId: null } : { type: 'existing', key: '', skillId: id }));
  job.skillLevels = [...gj.skill_levels];
  job.profile = { ...gj.profile };
  job.imageDims = { piece: { w: 106, h: 106 }, illust: { w: 878, h: 1024 } };
  return job;
});
chr.recode = {
  enabled: true,
  fromChrId: gc.recode.from,
  coins: gc.recode.coins,
  items: gc.recode.items.map(([itemId, count]) => ({ itemId, count })),
  mons: gc.recode.mons.map(([chrId, level]) => ({ chrId, level })),
};
draft.characters.push(chr);

const gb = g11.buddies[0];
const gbTpl = buddies.find(b => b.ID === gb.template);
const buddy = newBuddy(gb.template, gbTpl);
buddy.buddyId = gb.id;
buddy.name = { ...gb.name };
buddy.desc = { ...gb.desc };
buddy.exclusiveChrId = gb.exclusiveChrID;
buddy.rarity = gb.rarity;
buddy.type = gb.type;
buddy.attrib = gb.attrib;
buddy.kind = gb.kind;
buddy.maxLevel = gb.MaxLevel;
buddy.requiredLevel = gb.RequiredLevel;
buddy.sortId = gb.SortID;
buddy.canDrop = gb.canDrop;
buddy.stats = Object.fromEntries(['ATK', 'DEF', 'SATK', 'SDEF', 'BOOST'].map(s => [s, gb[`${s}max`]]));
buddy.imageId = gb.image_id;
buddy.skillMode = 'new';
buddy.skillKey = gb.skill.slice(1);
buddy.extraFields = { sortNameJa: gb.sortNameJa, exclusiveSpeciesID: gb.exclusiveSpeciesID, EXPmax: gb.EXPmax, BaseEXP: gb.BaseEXP, BaseCOIN: gb.BaseCOIN, evolveID: gb.evolveID, coinsToEvolve: gb.coinsToEvolve };
buddy.imageDims = { large: { w: 367, h: 605 }, small: { w: 235, h: 327 }, thumb: { w: 106, h: 106 } };
buddy.server = {
  used: true, rarityLetter: 'Z', unique: true, pool: '', afterChrId: 1289,
  maxLevel: 1, expMax: 0, baseExp: 1, baseCoin: 1, expCoeff: 2.0999999046325684,
  evolveId: 0, coinsToEvolve: 0, sameBonusBias: 1,
};
draft.buddies.push(buddy);

// ---------------------------------------------------------------- run

console.log('== validateDraft ==');
const issues = validateDraft(draft, catalogs);
const errors = issues.filter(i => i.level === 'error');
if (errors.length) {
  for (const e of errors) fail(`validation error: ${e.section} — ${e.message}`);
} else {
  ok('no validation errors');
}
const unexpectedWarnings = issues.filter(i => i.level === 'warning'
  && !i.message.includes('Native patches change libil2cpp'));
if (unexpectedWarnings.length) {
  for (const w of unexpectedWarnings) console.log(`  warn ${w.section} — ${w.message}`);
}

console.log('== buildModSpec vs gold ==');
const spec = buildModSpec(draft, catalogs);
compareSkills(spec.skills || [], [...g10.skills, ...g11.skills], 'skills');
compareCharacters(spec.characters || [], g10.characters, 'characters');
compareBuddies(spec.buddies || [], g11.buddies, 'buddies');
const goldAsset = {
  Pieces: g10.asset_db.Pieces, Illusts: g10.asset_db.Illusts,
  BuddyImages: g11.asset_db.BuddyImages, BuddyThumbs: g11.asset_db.BuddyThumbs,
};
if (JSON.stringify(spec.asset_db) !== JSON.stringify(goldAsset)) {
  fail(`asset_db:\n  got  ${JSON.stringify(spec.asset_db)}\n  want ${JSON.stringify(goldAsset)}`);
} else ok('asset_db matches');
if (JSON.stringify(spec.native) !== JSON.stringify(g11.native)) fail(`native: ${JSON.stringify(spec.native)} != ${JSON.stringify(g11.native)}`);
else ok('native matches');

console.log('== buildImagesRecipe vs gold ==');
const recipe = buildImagesRecipe(draft);
const goldRecipe = JSON.parse(readFileSync(`${MODS}/images.json`, 'utf8')).filter(e => !e._note);
for (let i = 0; i < goldRecipe.length; i++) {
  const g = goldRecipe[i];
  const b = recipe[i];
  if (!b) { fail(`recipe: missing entry ${i}`); continue; }
  if (b.new !== g.new) fail(`recipe[${i}].new: ${b.new} != ${g.new}`);
  const gTpl = g.template ? g.template : undefined;
  const bTpl = b.template || undefined;
  if ((gTpl ?? undefined) !== (bTpl ?? undefined)) fail(`recipe[${i}].template: ${b.template} != ${g.template}`);
  if ((g.prefix_of ?? null) !== (b.prefix_of ?? null)) fail(`recipe[${i}].prefix_of mismatch`);
}
if (recipe.length !== goldRecipe.length) fail(`recipe length ${recipe.length} != ${goldRecipe.length}`);
else ok(`recipe matches (${recipe.length} entries)`);

console.log('== buildServerBuddies vs gold ==');
const serverB = buildServerBuddies(draft);
const goldServerB = JSON.parse(readFileSync(`${MODS}/server/buddies.json`, 'utf8'));
// gold keeps all six languages; ours emits only filled ones — normalize.
const normName = (n) => Object.fromEntries(Object.entries(n).filter(([, v]) => v !== ''));
if (serverB.length !== goldServerB.length) fail('server buddies length');
else {
  const a = sortKeysDeep({ ...serverB[0], name: normName(serverB[0].name) });
  const e = sortKeysDeep({ ...goldServerB[0], name: normName(goldServerB[0].name) });
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    fail(`server buddies:\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(e)}`);
  } else ok('server buddies match');
}

console.log('== import round-trip ==');
const redraft = draftFromSpec(spec);
const respec = buildModSpec(redraft, catalogs);
if (JSON.stringify(respec) === JSON.stringify(spec)) {
  ok('import(build(draft)) round-trips exactly');
} else {
  // Find the first differing path for a readable failure.
  const sa = JSON.stringify(spec, null, 1).split('\n');
  const sb = JSON.stringify(respec, null, 1).split('\n');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] !== sb[i]) { fail(`round-trip differs at line ${i}: ${sa[i]} vs ${sb[i]}`); break; }
  }
}

writeFileSync('gold_test_output.json', JSON.stringify(spec, null, 2));
console.log(failures === 0 ? '\nALL GOLD CHECKS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
