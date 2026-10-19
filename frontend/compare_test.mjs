// Acceptance test for the Compare tab math (run: node compare_test.mjs)
// Drives compareCalc.js against the real served game data and asserts the
// numbers the UI will show: the documented growth curve, lambda skill pools,
// slot validation, companion bonuses and cumulated power sums.
import { readFileSync } from 'node:fs';
import {
  statAtLevel, buddyStatAtLevel, buddyBonuses,
  buildSkillPool, resolveSlotSkills, jobFixedSkills,
  jobStatsAtLevel, computeSide, powerFamilyOf, equipBoostLabel,
} from './src/utils/compareCalc.js';

const GAME = process.env.GAME_DATA_DIR || 'G:/Terra/Terra-Tools/user-data/extracted-gamedata/game_data';

const chrDb = JSON.parse(readFileSync(`${GAME}/ChrDatabase.json`, 'utf8'));
const skills = JSON.parse(readFileSync(`${GAME}/SkillData.json`, 'utf8')).types;
const buddies = JSON.parse(readFileSync(`${GAME}/BuddyDatabase.json`, 'utf8')).data;

const jobsById = Object.fromEntries(chrDb.data.map(j => [j.ID, j]));
const enriched = (info) => ({ ...info, JobsInfo: (info.Jobs || []).map(id => jobsById[id]).filter(Boolean) });
const infosById = Object.fromEntries(chrDb.infos.map(i => [i.ID, i]));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- growth curve: stat(L) = min + (max-min) * ((L-1)/89) ** coeff ----------
{
  const job = jobsById[1]; // Bahl job 1: HP 321..3210, coeff 0.95
  check('curve at Lv1 is min', statAtLevel(job.HPmin, job.HPmax, job.HPcoeff, 1), 321);
  check('curve at Lv90 (max level) is max', statAtLevel(job.HPmin, job.HPmax, job.HPcoeff, 90), 3210);
  check('curve beyond Lv90 clamps', statAtLevel(job.HPmin, job.HPmax, job.HPcoeff, 99), 3210);
  // (46-1)/89 = 45/89 ≈ 0.5056 -> 100 + 100*0.5056 ≈ 150.56 -> 151
  check('curve midpoint with coeff 1', statAtLevel(100, 200, 1, 46), 151);
}

// --- buddy curve -------------------------------------------------------------
{
  const buddy = buddies.find(b => b.ID === 1); // Healing Wand: DEF 1..15, MaxLevel 30
  check('buddy at max level is max', buddyStatAtLevel(buddy.DEFmin, buddy.DEFmax, buddy.Coeff, 30, 30), 15);
  check('buddy at level 1 is min', buddyStatAtLevel(buddy.DEFmin, buddy.DEFmax, buddy.Coeff, 1, 30), 1);
  const bonuses = buddyBonuses(buddy);
  check('buddy bonuses carry no HP', bonuses.HP, 0);
  check('buddy bonuses DEF at max', bonuses.DEF, 15);
}

// --- skill pool: lambda char inherits the recode-source jobs -----------------
{
  const lich = enriched(infosById[621]);   // Lich Λ — jobs [746,747,748]
  const lichSrc = enriched(infosById[163]); // Lich — jobs [354]
  // Samatha Λ: single-job lambda — its pre-lambda skills live on the source.
  const rebirth = chrDb.rebirthInfo.find(r => r.srcChrID && r.dstChrID
    && infosById[r.srcChrID]?.NameString?.en === 'Samatha'
    && infosById[r.dstChrID]?.isLambda);
  const samatha = enriched(infosById[rebirth.srcChrID]);
  const samathaL = enriched(infosById[rebirth.dstChrID]);

  const lichPool = buildSkillPool(lich, lichSrc);
  const lichSkillIds = new Set(lichPool.map(e => e.skillId));
  check('lambda pool covers own jobs', [...lich.JobsInfo.flatMap(j => j.skills)].every(id => lichSkillIds.has(id)), true);

  const samathaPoolIds = new Set(buildSkillPool(samathaL, samatha).map(e => e.skillId));
  const samathaJobSkills = samatha.JobsInfo.flatMap(j => j.skills);
  check('lambda pool includes pre-lambda skills', samathaJobSkills.every(id => samathaPoolIds.has(id)), true);
  const ownOnly = new Set(buildSkillPool(samathaL, null).map(e => e.skillId));
  check('lambda pool without ancestor misses pre-lambda skills', samathaJobSkills.some(id => !ownOnly.has(id)), true);
}

// --- slot validation ----------------------------------------------------------
{
  const bahl = enriched(infosById[1]);
  const job1 = bahl.JobsInfo[0];
  const fixed = jobFixedSkills(job1).map(e => e.skillId);
  const pool = buildSkillPool(bahl, null).map(e => e.skillId);
  const fromOtherJobs = pool.filter(id => !fixed.includes(id));

  check('fixed skills accepted', resolveSlotSkills(bahl, null, job1, [fixed[0]]).length, 0);
  const slots = resolveSlotSkills(bahl, null, job1, fromOtherJobs.slice(0, 5));
  check('slots cap at four', slots.length, 4);
  check('slots preserve order', slots.map(e => e.skillId), fromOtherJobs.slice(0, 4));
  const dup = resolveSlotSkills(bahl, null, job1, [fromOtherJobs[0], fromOtherJobs[0]]);
  check('duplicate slot picks collapse', dup.map(e => e.skillId), [fromOtherJobs[0]]);
  check('non-pool skills drop', resolveSlotSkills(bahl, null, job1, [999999, fromOtherJobs[0]]).map(e => e.skillId), [fromOtherJobs[0]]);
}

// --- computeSide ---------------------------------------------------------------
{
  const bahl = enriched(infosById[1]);
  const job1 = bahl.JobsInfo[0];
  const side = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [], buddy: null, level: 90 });
  const expected = jobStatsAtLevel(job1, 90);
  check('side stats match job stats without companion', side.stats.ATK.total, expected.ATK);
  check('side has four fixed skills', side.fixed.length, job1.skills.length);
  check('power sums skip zero-power skills', Object.values(side.power).every(f => f.count === 0 || f.total > 0), true);

  const withBuddy = computeSide({
    char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [],
    buddy: { ...buddies.find(b => b.ID === 1), ATKmax: 7, ATKmin: 0, MaxLevel: 30, Coeff: 1, skill: 11, RequiredLevel: 15 },
    level: 90,
  });
  check('companion ATK joins the total', withBuddy.stats.ATK, { job: expected.ATK, buddy: 7, equip: 0, total: expected.ATK + 7 });
  check('companion skill enters the kit', withBuddy.activeSkills.at(-1)?.origin, 'buddy');

  const lowLevel = computeSide({
    char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [],
    buddy: { ...buddies.find(b => b.ID === 1), RequiredLevel: 15, skill: 11 },
    level: 10,
  });
  check('companion gated by RequiredLevel', lowLevel.buddy, null);
  check('gated companion contributes nothing', lowLevel.stats.ATK.buddy, 0);
  check('locked skills flagged below unlock level', lowLevel.activeSkills.filter(e => e.masterLevel > 10).every(e => e.locked), true);

  // Skill 11 is the Healing Wand's Heal (attrib 5) — lands in the heal family.
  check('heal attribution maps to heal family', powerFamilyOf(skills[10]), 'heal');
  // Slot a learnable power skill (not one of the job's fixed four) and
  // confirm it accumulates into its family on top of the fixed kit.
  const fixedIds = new Set(jobFixedSkills(bahl.JobsInfo[0]).map(e => e.skillId));
  const slottable = buildSkillPool(bahl, null).find(e => !fixedIds.has(e.skillId) && (skills[e.skillId - 1]?.power || 0) > 0);
  const famKey = powerFamilyOf(skills[slottable.skillId - 1]);
  const skillPower = skills[slottable.skillId - 1].power;
  const baseline = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [], buddy: null, level: 90 });
  const sideWithSlot = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [slottable.skillId], buddy: null, level: 90 });
  check('slotted skill accumulates into its family',
    {
      delta: +(sideWithSlot.power[famKey].total - baseline.power[famKey].total).toFixed(4),
      count: sideWithSlot.power[famKey].count - baseline.power[famKey].count,
    },
    { delta: skillPower, count: 1 });

  // --- equip stat boosts -----------------------------------------------------
  // Skill 191 "Attack +10%" (Bahl job 3): kind 5 equip, status 5 (ATK),
  // spower 10. Skill 212 is its kind-4 PROC twin — must NOT touch stats.
  check('equip boost label parses', equipBoostLabel(skills[190]), '+10% ATK');
  check('proc twin has no equip label', equipBoostLabel(skills[211]), null);
  const withEquip = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [191], buddy: null, level: 90 });
  check('equipped +10% ATK lands in stats', withEquip.stats.ATK.equip, 0.10);
  check('equip multiplies the total', withEquip.stats.ATK.total, Math.round((expected.ATK) * 1.10));
  const withProc = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [212], buddy: null, level: 90 });
  check('procable buff does not touch stats', withProc.stats.ATK.equip, 0);

  // --- buffless damage estimate ----------------------------------------------
  // Bahl job 1 fixed: Counterattack x1.5 (kind 2 counter — excluded),
  // Attack +10% (kind 4 proc — power 0), Gigasword x2 (40% phys),
  // Counterattack x2 (kind 2 — excluded). Slot Gigasword-like 1055 is
  // already fixed, so expected pincer = ATK × (1 + 0.4×(2−1)).
  const gigasword = 1055;
  check('Gigasword is physical x2 at 40%', {
    weap: skills[gigasword - 1].weap, power: skills[gigasword - 1].power, emit: skills[gigasword - 1].emitRatio,
  }, { weap: 1, power: 2.0, emit: 40 });
  const dmg = side.damage;
  check('buffless expected damage', +dmg.expected.toFixed(4), +(expected.ATK * (1 + 0.4)).toFixed(4));
  check('all-proc ceiling doubles the pincer', +dmg.burst.toFixed(4), +(expected.ATK * 2).toFixed(4));
  check('counters and proc buffs stay out of the pincer multiplier',
    { multExp: dmg.pincerMultExp, multMax: dmg.pincerMultMax }, { multExp: 1.4, multMax: 2 });

  // Magic: Lich Λ lambda job (748) carries Dark Matter x3 (30%, weap 0).
  const lich = enriched(infosById[621]);
  const lichSide = computeSide({ char: lich, ancestor: null, skills, jobIndex: 2, slotIds: [], buddy: null, level: 90 });
  const lichStats = lichSide.stats;
  const darkMatter = skills[1336]; // id 1337
  check('Dark Matter is magical x3 at 30%', {
    weap: darkMatter.weap, power: darkMatter.power, emit: darkMatter.emitRatio,
  }, { weap: 0, power: 3.0, emit: 30 });
  check('magic estimate adds w·power×MATK', +lichSide.damage.magic.toFixed(4), +(0.9 * lichStats.MATK.total).toFixed(4));
  check('magic expected total', +lichSide.damage.expected.toFixed(4),
    +(lichStats.ATK.total + 0.9 * lichStats.MATK.total).toFixed(4));
  // --- companion exclusivity across recodes ----------------------------------
  // "Bahl ΟⅢ" (buddy 294) is exclusive to Bahl (ID 1); Bahl Λ (ID 920) is
  // Bahl's recode (ancestorChrID 1). In game the recoded form may equip the
  // pre-recode form's exclusive companions — one-way, never the reverse.
  const bahlLambda = enriched(infosById[920]);
  const bahl3 = buddies.find(b => b.NameString?.en === 'Bahl ΟⅢ');
  check('Bahl ΟⅢ exists and is Bahl-exclusive', { id: bahl3?.ID, exclusive: bahl3?.exclusiveChrID }, { id: 294, exclusive: 1 });
  const lambdaWithBahlBuddy = computeSide({
    char: bahlLambda, ancestor: bahl, skills, jobIndex: 0, slotIds: [],
    buddy: { ...bahl3, skill: 0, RequiredLevel: 1 }, level: 90,
  });
  check('recode source companions are equippable by the lambda form', lambdaWithBahlBuddy.buddy != null, true);
  const bahlWithBahlBuddy = computeSide({
    char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [],
    buddy: { ...bahl3, skill: 0, RequiredLevel: 1 }, level: 90,
  });
  check('the exclusive owner itself can still equip it', bahlWithBahlBuddy.buddy != null, true);
  // One-way inheritance: a companion exclusive to a Λ character stays
  // locked for that Λ character's pre-recode form. Only Λ characters with a
  // real ancestor qualify (the Kino Λ / 8-Bit Λ families are standalone,
  // ancestorChrID 0 — no pre-recode form exists to test).
  const lambdaExclusive = buddies.find(b => {
    const owner = infosById[b.exclusiveChrID || 0];
    return owner && owner.isLambda && owner.ID !== 920 && infosById[owner.ancestorChrID || 0];
  });
  const lambdaOwner = infosById[lambdaExclusive.exclusiveChrID];
  const preRecode = enriched(infosById[lambdaOwner.ancestorChrID]);
  const preRecodeSide = computeSide({
    char: preRecode, ancestor: null, skills, jobIndex: 0, slotIds: [],
    buddy: { ...lambdaExclusive, skill: 0, RequiredLevel: 1 }, level: 90,
  });
  check('lambda-exclusives stay locked for the pre-recode form', preRecodeSide.buddy, null);
  const lambdaWithForeignLambdaBuddy = computeSide({
    char: bahlLambda, ancestor: bahl, skills, jobIndex: 0, slotIds: [],
    buddy: { ...lambdaExclusive, skill: 0, RequiredLevel: 1 }, level: 90,
  });
  check('lambda-exclusives of other characters stay locked', lambdaWithForeignLambdaBuddy.buddy, null);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll compare math checks passed.');
