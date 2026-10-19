// Pure math behind the Compare tab: level scaling, equipment configs and
// cumulated skill power. No React, no fetches — everything is derived from
// the served game data shapes so it can be unit-tested standalone.
//
// Stat growth (reTB): stat(L) = min + (max - min) * ((L - 1) / 89) ** coeff
// Jobs scale over levels 1..90; companions reuse the same curve over
// 1..MaxLevel with their single Coeff.

export const JOB_MAX_LEVEL = 90;

export function statAtLevel(min, max, coeff, level) {
  const lo = min || 0;
  const span = (max || 0) - lo;
  if (span === 0 || level <= 1) return Math.round(lo);
  const t = Math.min((level - 1) / (JOB_MAX_LEVEL - 1), 1);
  return Math.round(lo + span * Math.pow(t, coeff ?? 1));
}

export function buddyStatAtLevel(min, max, coeff, level, maxLevel) {
  const lo = min || 0;
  const span = (max || 0) - lo;
  if (span === 0 || level <= 1 || !maxLevel || maxLevel <= 1) return Math.round(lo);
  const t = Math.min((level - 1) / (maxLevel - 1), 1);
  return Math.round(lo + span * Math.pow(t, coeff ?? 1));
}

// Companion stats always count at full growth: the tool configures which
// companion is slotted, not its training level.
export function buddyBonuses(buddy) {
  if (!buddy) return null;
  const lvl = buddy.MaxLevel || 1;
  const c = buddy.Coeff;
  return {
    HP: 0,
    ATK: buddyStatAtLevel(buddy.ATKmin, buddy.ATKmax, c, lvl, lvl),
    DEF: buddyStatAtLevel(buddy.DEFmin, buddy.DEFmax, c, lvl, lvl),
    MATK: buddyStatAtLevel(buddy.SATKmin, buddy.SATKmax, c, lvl, lvl),
    MDEF: buddyStatAtLevel(buddy.SDEFmin, buddy.SDEFmax, c, lvl, lvl),
    boost: buddyStatAtLevel(buddy.BOOSTmin, buddy.BOOSTmax, c, lvl, lvl),
  };
}

// A companion can only be equipped when its exclusivity and level gates pass.
// Species lives on the job entries, not the character info.
export function buddyAvailability(buddy, char, job) {
  if (!buddy) return { ok: true };
  const blockers = [];
  if ((buddy.exclusiveChrID || 0) > 0 && buddy.exclusiveChrID !== char?.ID) {
    blockers.push({ kind: 'exclusive', chrID: buddy.exclusiveChrID });
  }
  const species = job?.Species;
  if ((buddy.exclusiveSpeciesID || 0) > 0 && species != null && buddy.exclusiveSpeciesID !== species) {
    blockers.push({ kind: 'species', speciesID: buddy.exclusiveSpeciesID });
  }
  return { ok: blockers.length === 0, blockers };
}

// ---- skill pool ------------------------------------------------------------
// A character can slot any skill it can learn: those of its own jobs plus —
// for recoded (Λ) characters — those of the pre-lambda jobs carried by the
// recode-source character (their job lists are disjoint; the Λ entry usually
// holds only the lambda job itself).

export function poolJobs(char, ancestor) {
  const jobs = [...(char?.JobsInfo || [])];
  if (char?.isLambda && ancestor?.JobsInfo?.length) jobs.push(...ancestor.JobsInfo);
  return jobs;
}

// One entry per distinct skill: minimum unlock level across the jobs that
// grant it, with the first granting job as the displayed source.
export function buildSkillPool(char, ancestor) {
  const bySkill = new Map();
  for (const job of poolJobs(char, ancestor)) {
    const levels = job.skillMasterLevel || [];
    (job.skills || []).forEach((skillId, i) => {
      if (!Number.isInteger(skillId) || skillId <= 0) return;
      const masterLevel = levels[i] || 1;
      const existing = bySkill.get(skillId);
      if (!existing) {
        bySkill.set(skillId, { skillId, masterLevel, sourceJob: job });
      } else if (masterLevel < existing.masterLevel) {
        existing.masterLevel = masterLevel;
      }
    });
  }
  return [...bySkill.values()];
}

// The selected job's own four skills — always active, never slotted away.
export function jobFixedSkills(job) {
  const levels = job?.skillMasterLevel || [];
  return (job?.skills || []).map((skillId, i) => ({
    skillId,
    masterLevel: levels[i] || 1,
    origin: 'job',
  }));
}

// Validate the URL-supplied slot picks: unknown IDs, skills the character
// cannot learn, duplicates and skills already fixed by the job all drop.
export function resolveSlotSkills(char, ancestor, job, slotIds) {
  if (!Array.isArray(slotIds) || slotIds.length === 0) return [];
  const pool = new Map(buildSkillPool(char, ancestor).map(e => [e.skillId, e]));
  const fixed = new Set(jobFixedSkills(job).map(e => e.skillId));
  const used = new Set();
  const slots = [];
  for (const id of slotIds) {
    const entry = pool.get(id);
    if (!entry || fixed.has(id) || used.has(id)) continue;
    used.add(id);
    slots.push({ ...entry, origin: 'slot' });
    if (slots.length === 4) break;
  }
  return slots;
}

// ---- side computation ------------------------------------------------------

const STAT_ROWS = [
  ['HP', 'HP'], ['ATK', 'ATK'], ['DEF', 'DEF'], ['MATK', 'MATK'], ['MDEF', 'MDEF'],
];

export function jobStatsAtLevel(job, level) {
  return {
    HP: statAtLevel(job?.HPmin, job?.HPmax, job?.HPcoeff, level),
    ATK: statAtLevel(job?.ATKmin, job?.ATKmax, job?.ATKcoeff, level),
    DEF: statAtLevel(job?.DEFmin, job?.DEFmax, job?.DEFcoeff, level),
    MATK: statAtLevel(job?.SATKmin, job?.SATKmax, job?.SATKcoeff, level),
    MDEF: statAtLevel(job?.SDEFmin, job?.SDEFmax, job?.SDEFcoeff, level),
  };
}

// Cumulated power families. SkillData `attrib` folds the physical variants
// into their base element (12=Phys. Fire -> fire, ...), so a pincer attack
// and its physical twin accumulate together.
export const POWER_FAMILIES = {
  fire: { label: 'Fire', attrib: 1 },
  ice: { label: 'Ice', attrib: 2 },
  lightning: { label: 'Lightning', attrib: 3 },
  darkness: { label: 'Darkness', attrib: 4 },
  nonElem: { label: 'Non-elem.', attrib: 7 },
  photon: { label: 'Photon', attrib: 17 },
  graviton: { label: 'Graviton', attrib: 18 },
  solar: { label: 'Solar', attrib: 21 },
  lunar: { label: 'Lunar', attrib: 22 },
  absorb: { label: 'Absorb', attrib: 10 },
  none: { label: 'No element', attrib: 0 },
  heal: { label: 'Healing', attrib: 5 },
};

const FAMILY_BY_ATTRIB = {
  1: 'fire', 12: 'fire',
  2: 'ice', 13: 'ice',
  3: 'lightning', 14: 'lightning',
  4: 'darkness', 15: 'darkness',
  7: 'nonElem', 16: 'nonElem',
  17: 'photon', 19: 'photon',
  18: 'graviton', 20: 'graviton',
  21: 'solar', 23: 'solar',
  22: 'lunar', 24: 'lunar',
  10: 'absorb', 11: 'absorb',
  5: 'heal',
};

export function powerFamilyOf(skill) {
  return FAMILY_BY_ATTRIB[skill?.attrib] || 'none';
}

// ---- equip stat boosts -----------------------------------------------------
// True equips are SkillKind 5 with emitRatio 0; the boost magnitude lives in
// `spower` (10 = +10%) and `status` names the stat (from the served data:
// 5=ATK, 6=DEF, 7=MATK, 8=MDEF, 16=HP). The kind-4 twins of these skills
// ("Attack +10%", 30% trigger) are procable buffs — deliberately excluded.
export const EQUIP_STAT_STATUS = { 16: 'HP', 5: 'ATK', 6: 'DEF', 7: 'MATK', 8: 'MDEF' };

export function equipBoostLabel(skill) {
  if (skill?.kind !== 5 || (skill.emitRatio || 0) !== 0) return null;
  const stat = EQUIP_STAT_STATUS[skill.status];
  if (!stat || !(skill.spower > 0)) return null;
  const pct = Number(skill.spower) % 1 === 0 ? Number(skill.spower) : Number(skill.spower.toFixed(1));
  return `+${pct}% ${stat}`;
}

export function equipStatMultipliers(activeSkills) {
  const mult = { HP: 0, ATK: 0, DEF: 0, MATK: 0, MDEF: 0 };
  for (const e of activeSkills) {
    if (!e.skill || e.locked) continue;
    const label = equipBoostLabel(e.skill);
    if (!label) continue;
    mult[EQUIP_STAT_STATUS[e.skill.status]] += (e.skill.spower || 0) / 100;
  }
  return mult;
}

// ---- buffless damage estimate ----------------------------------------------
// Model (documented in the UI tooltip):
//   pincer  = ATK_total × (1 + Σ_physical w·(power − 1))
//   magic   = Σ_magical w·power × MATK_total        (each blame skill = one hit)
// with w the trigger weight (emitRatio/100; equips and untapped 0 → 1).
// Excluded: procable buffs (kind 4 — "buffless"), counters (kind 2/12),
// flat-damage skills (kind 7 — not stat-scaled), heals. Neutral element, no
// chain/level-gap scaling — a relative number, identical scale for both sides.
const NON_STAT_DAMAGE_KINDS = new Set([2, 7, 12]);

export function damageEstimate(activeSkills, stats) {
  let physExcessExp = 0, physExcessMax = 0, magPowerExp = 0, magPowerMax = 0, nPhys = 0, nMag = 0;
  for (const e of activeSkills) {
    if (!e.skill || e.locked) continue;
    const p = e.skill.power || 0;
    if (p <= 0) continue;
    if (powerFamilyOf(e.skill) === 'heal') continue;
    if (NON_STAT_DAMAGE_KINDS.has(e.skill.kind)) continue;
    const magical = (e.skill.weap || 0) === 0;
    const w = (e.skill.emitRatio || 0) > 0 ? e.skill.emitRatio / 100 : 1;
    if (magical) {
      magPowerExp += w * p;
      magPowerMax += p;
      nMag += 1;
    } else {
      physExcessExp += w * (p - 1);
      physExcessMax += (p - 1);
      nPhys += 1;
    }
  }
  const atk = stats.ATK.total;
  const matk = stats.MATK.total;
  return {
    pincer: atk * (1 + physExcessExp),
    magic: magPowerExp * matk,
    expected: atk * (1 + physExcessExp) + magPowerExp * matk,
    burst: atk * (1 + physExcessMax) + magPowerMax * matk,
    pincerExp: atk * (1 + physExcessExp),
    pincerMax: atk * (1 + physExcessMax),
    magicExp: magPowerExp * matk,
    magicMax: magPowerMax * matk,
    pincerMultExp: 1 + physExcessExp,
    pincerMultMax: 1 + physExcessMax,
    nPhys, nMag,
  };
}

export function computeSide({ char, ancestor, skills, jobIndex, slotIds, buddy, level }) {
  const jobs = char?.JobsInfo || [];
  const job = jobs[jobIndex] || jobs[0] || null;
  const fixed = job ? jobFixedSkills(job) : [];
  const slots = job ? resolveSlotSkills(char, ancestor, job, slotIds) : [];

  const availability = buddyAvailability(buddy, char, job);
  const levelGateOk = !buddy || level >= (buddy.RequiredLevel || 1);
  const bonuses = buddy && availability.ok && levelGateOk ? buddyBonuses(buddy) : null;

  // Full active kit: the job's fixed skills, the slotted picks, then the
  // companion's skill. Locked entries stay visible (dimmed) but are excluded
  // from the power sums — at this job level the unit does not have them yet.
  const buddySkillId = buddy && availability.ok && levelGateOk && (buddy.skill || 0) > 0 ? buddy.skill : null;
  const activeSkills = [
    ...fixed.map(e => ({ ...e, sourceJob: job })),
    ...slots.map(e => ({ ...e })),
    ...(buddySkillId ? [{ skillId: buddySkillId, masterLevel: 1, origin: 'buddy', sourceJob: null }] : []),
  ].map(e => {
    const skill = skills[e.skillId - 1] || null;
    return { ...e, skill, locked: level < e.masterLevel };
  });

  const equipMult = equipStatMultipliers(activeSkills);

  const jobStats = job ? jobStatsAtLevel(job, level) : { HP: 0, ATK: 0, DEF: 0, MATK: 0, MDEF: 0 };
  const stats = {};
  for (const [key] of STAT_ROWS) {
    const jobVal = jobStats[key];
    const buddyVal = bonuses?.[key] || 0;
    const mult = 1 + (equipMult[key] || 0);
    stats[key] = {
      job: jobVal,
      buddy: buddyVal,
      equip: equipMult[key] || 0,
      total: Math.round((jobVal + buddyVal) * mult),
    };
  }
  stats.boost = { job: 0, buddy: bonuses?.boost || 0, equip: 0, total: bonuses?.boost || 0 };

  const power = {};
  for (const [key, meta] of Object.entries(POWER_FAMILIES)) {
    power[key] = { label: meta.label, total: 0, count: 0 };
  }
  for (const e of activeSkills) {
    if (!e.skill || e.locked) continue;
    const p = e.skill.power || 0;
    if (p <= 0) continue;
    const fam = power[powerFamilyOf(e.skill)];
    fam.total += p;
    fam.count += 1;
  }

  return {
    char, job, jobIndex: job ? jobs.indexOf(job) : jobIndex,
    fixed, slots, activeSkills,
    buddy: buddy && availability.ok && levelGateOk ? buddy : null,
    availability, levelGateOk,
    stats, power,
    damage: damageEstimate(activeSkills, stats),
  };
}
