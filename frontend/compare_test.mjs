// Acceptance test for the Compare tab math (run: node compare_test.mjs)
// Drives compareCalc.js against the real served game data and asserts the
// numbers the UI will show: the documented growth curve, lambda skill pools,
// slot validation, companion bonuses and cumulated power sums.
import { readFileSync } from 'node:fs';
import {
  statAtLevel, buddyStatAtLevel, buddyBonuses,
  buildSkillPool, resolveSlotSkills, jobFixedSkills,
  jobStatsAtLevel, computeSide, powerFamilyOf,
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

// --- growth curve: stat(L) = min + (max-min) * ((L-1)/98) ** coeff ----------
{
  const job = jobsById[1]; // Bahl job 1: HP 321..3210, coeff 0.95
  check('curve at Lv1 is min', statAtLevel(job.HPmin, job.HPmax, job.HPcoeff, 1), 321);
  check('curve at Lv99 is max', statAtLevel(job.HPmin, job.HPmax, job.HPcoeff, 99), 3210);
  check('curve beyond Lv99 clamps', statAtLevel(job.HPmin, job.HPmax, job.HPcoeff, 150), 3210);
  const linear = statAtLevel(100, 200, 1, 50); // (49/98)**1 = 0.5 -> 150
  check('curve midpoint with coeff 1', linear, 150);
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
  const side = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [], buddy: null, level: 99 });
  const expected = jobStatsAtLevel(job1, 99);
  check('side stats match job stats without companion', side.stats.ATK.total, expected.ATK);
  check('side has four fixed skills', side.fixed.length, job1.skills.length);
  check('power sums skip zero-power skills', Object.values(side.power).every(f => f.count === 0 || f.total > 0), true);

  const withBuddy = computeSide({
    char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [],
    buddy: { ...buddies.find(b => b.ID === 1), ATKmax: 7, ATKmin: 0, MaxLevel: 30, Coeff: 1, skill: 11, RequiredLevel: 15 },
    level: 99,
  });
  check('companion ATK joins the total', withBuddy.stats.ATK, { job: expected.ATK, buddy: 7, total: expected.ATK + 7 });
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
  const baseline = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [], buddy: null, level: 99 });
  const sideWithSlot = computeSide({ char: bahl, ancestor: null, skills, jobIndex: 0, slotIds: [slottable.skillId], buddy: null, level: 99 });
  check('slotted skill accumulates into its family',
    {
      delta: +(sideWithSlot.power[famKey].total - baseline.power[famKey].total).toFixed(4),
      count: sideWithSlot.power[famKey].count - baseline.power[famKey].count,
    },
    { delta: skillPower, count: 1 });
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll compare math checks passed.');
