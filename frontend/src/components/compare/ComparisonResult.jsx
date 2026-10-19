import { loc } from '../../utils/localization';
import { rarityShortLabels, skillAttribMeta, triggerText } from '../../utils/constants';
import { POWER_FAMILIES, EQUIP_STAT_STATUS, equipBoostLabel } from '../../utils/compareCalc';
import SkillIcon from '../shared/SkillIcon';
import EmitConditionBadge from '../shared/EmitConditionBadge';

const fmtPct = (v) => (Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(1));

// "+10% ATK/proc" for stackable stat buffs (kind 4 with a stat status).
function stackBuffLabel(skill) {
  if (skill?.kind !== 4 || (skill.emitRatio || 0) <= 0) return null;
  const stat = EQUIP_STAT_STATUS[skill.status];
  if (!stat || !(skill.spower > 0)) return null;
  return `+${fmtPct(skill.spower)}% ${stat}/proc`;
}

const STAT_LABELS = [
  ['HP', 'HP'], ['ATK', 'ATK'], ['DEF', 'DEF'], ['MATK', 'MATK'], ['MDEF', 'MDEF'],
  ['boost', 'Skill Boost'],
];

const FAMILY_ORDER = [
  'fire', 'ice', 'lightning', 'darkness', 'nonElem', 'photon',
  'graviton', 'solar', 'lunar', 'absorb', 'none', 'heal',
];

const fmtPower = (n) => Number(n.toFixed(2));

// Diff arrow: green when the right side is ahead, red when the left is
// (every compared number here is higher-is-better), muted on ties.
function Diff({ right, left }) {
  const d = +(right - left).toFixed(2);
  if (d === 0) return <span className="diff diff-zero">±0</span>;
  const cls = d > 0 ? 'diff-pos' : 'diff-neg';
  return <span className={`diff ${cls}`}>{d > 0 ? '+' : ''}{d} {d > 0 ? '▶ R' : '◀ L'}</span>;
}

function SideCell({ value, alt }) {
  return (
    <td className="compare-val">
      <span className="compare-val-main">{value}</span>
      {alt ? <span className="compare-val-alt">{alt}</span> : null}
    </td>
  );
}

export default function ComparisonResult({ left, right, lang, level, stacks = 0, onOpenSkill }) {
  const configured = left?.char || right?.char;
  if (!configured) {
    return (
      <div className="compare-results-empty">
        <i className="fa-solid fa-scale-balanced"></i>
        <p>Configure at least one side above — pick a character, its job, up to four slotted skills and a companion.</p>
      </div>
    );
  }

  const powerRows = familiesOf(left, right);
  const bothPresent = Boolean(left?.char && right?.char);
  const stacksLabel = stacks > 0 ? `${stacks}× stacked buffs` : 'buffless';

  return (
    <div className="compare-results">
      {!bothPresent && (
        <p className="compare-partial-note">
          <i className="fa-solid fa-circle-info"></i> Only one side is configured — the diff column compares against zero.
        </p>
      )}

      {/* --- stat diff --- */}
      <div className="compare-table-box">
        <h5
          title={
            'Stat buffs: always-on equips count fully; each stackable proc buff\n' +
            '(e.g. the Skullsplitter companion\'s "Attack +10%", 30%) is assumed to\n' +
            `have proc'd ${stacks} time(s) — ${stacks} × its magnitude per skill, all skills stacked.`
          }
        >
          <i className="fa-solid fa-chart-simple"></i> Stats
          <span className="compare-hint">Lv {level} · job growth + companion bonuses · {stacksLabel}</span>
        </h5>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Stat</th>
              <th className="compare-col-side">{sideHeader(left, lang)}</th>
              <th className="compare-col-side">{sideHeader(right, lang)}</th>
              <th>Right − Left</th>
            </tr>
          </thead>
          <tbody>
            {STAT_LABELS.map(([key, label]) => {
              const l = left?.stats?.[key] || { total: 0, job: 0, buddy: 0, equip: 0, buffs: 0 };
              const r = right?.stats?.[key] || { total: 0, job: 0, buddy: 0, equip: 0, buffs: 0 };
              const alt = (s) => {
                const parts = [];
                if (s.job) parts.push(`job ${s.job}`);
                if (s.buddy) parts.push(`+${s.buddy} companion`);
                if (s.equip > 0) parts.push(`equip +${Math.round(s.equip * 100)}%`);
                if (s.buffs > 0) parts.push(`buffs +${Math.round(s.buffs * 100)}%`);
                return parts.join(' · ');
              };
              return (
                <tr key={key}>
                  <td className="compare-stat-label">{label}</td>
                  <SideCell value={l.total} alt={alt(l)} />
                  <SideCell value={r.total} alt={alt(r)} />
                  <td><Diff right={r.total} left={l.total} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- cumulated skill power --- */}
      {powerRows.length > 0 && (
        <div className="compare-table-box">
          <h5><i className="fa-solid fa-burst"></i> Cumulated skill power <span className="compare-hint">Σ power of the active kit, by element</span></h5>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Element</th>
                <th className="compare-col-side">{sideHeader(left, lang)}</th>
                <th className="compare-col-side">{sideHeader(right, lang)}</th>
                <th>Right − Left</th>
              </tr>
            </thead>
            <tbody>
              {powerRows.map(key => {
                const meta = POWER_FAMILIES[key];
                const color = skillAttribMeta[meta.attrib]?.color || '#6b7280';
                const l = left?.power?.[key] || { total: 0, count: 0 };
                const r = right?.power?.[key] || { total: 0, count: 0 };
                return (
                  <tr key={key}>
                    <td className="compare-stat-label">
                      <span className="compare-family-chip" style={{ background: `${color}22`, borderColor: `${color}55`, color }}>{meta.label}</span>
                    </td>
                    <SideCell value={fmtPower(l.total)} alt={l.count ? `${l.count} skill${l.count === 1 ? '' : 's'}` : null} />
                    <SideCell value={fmtPower(r.total)} alt={r.count ? `${r.count} skill${r.count === 1 ? '' : 's'}` : null} />
                    <td><Diff right={r.total} left={l.total} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- damage estimate --- */}
      <div className="compare-table-box">
        <h5
          title={
            (stacks > 0
              ? `Damage estimate with ${stacks} proc(s) of each stackable stat buff folded into the stats:\n`
              : 'Buffless estimate of the damage this kit deals in one pincer it initiates:\n') +
            'pincer = ATK × (1 + Σ trigger-weighted (power − 1) of physical skills)\n' +
            'magic  = Σ trigger-weighted power × MATK (each magical skill is one separate hit)\n' +
            'Trigger weight = emitRatio/100; equips count at full weight.\n' +
            'Excluded: counters, flat-damage skills, heals; damage-magnitude buffs ("Physical Damage ×1.5") stay out.\n' +
            'Neutral element, single pincer, no chain or level-gap scaling — a relative number on the same scale for both sides.'
          }
        >
          <i className="fa-solid fa-burst"></i> Estimated damage ({stacksLabel})
          <span className="compare-hint">expected &amp; all-proc ceiling — hover for the model</span>
        </h5>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th className="compare-col-side">{sideHeader(left, lang)}</th>
              <th className="compare-col-side">{sideHeader(right, lang)}</th>
              <th>Right − Left</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['expected', 'Expected per pincer'],
              ['burst', 'All skills proc (ceiling)'],
            ].map(([key, label]) => {
              const isBurst = key === 'burst';
              const l = left?.damage || null;
              const r = right?.damage || null;
              const lv = l ? Math.round(l[key]) : 0;
              const rv = r ? Math.round(r[key]) : 0;
              const alt = (d) => {
                if (!d) return null;
                if (d.nPhys === 0 && d.nMag === 0) return 'no damage skills';
                const bits = [`pincer ×${Number(isBurst ? d.pincerMultMax : d.pincerMultExp).toFixed(2)}`];
                const magicPart = isBurst ? d.magicMax : d.magicExp;
                if (d.nMag > 0) bits.push(`magic +${Math.round(magicPart).toLocaleString()}`);
                return bits.join(' · ');
              };
              return (
                <tr key={key}>
                  <td className="compare-stat-label">{label}</td>
                  <SideCell value={lv.toLocaleString()} alt={alt(l)} />
                  <SideCell value={rv.toLocaleString()} alt={alt(r)} />
                  <td><Diff right={rv} left={lv} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- full kit breakdown --- */}
      <div className="compare-kit-grid">
        <KitList side={left} label="Left" lang={lang} onOpenSkill={onOpenSkill} />
        <KitList side={right} label="Right" lang={lang} onOpenSkill={onOpenSkill} />
      </div>
    </div>
  );
}

function sideHeader(side, lang) {
  const c = side?.char;
  if (!c) return <span className="compare-empty-side">— empty —</span>;
  return (
    <span className="compare-col-head">
      {loc(c.NameString, lang)}
      <span className="badge badge-rarity static">{rarityShortLabels[c.rarity] || c.rarity}</span>
    </span>
  );
}

// Families with any accumulated power on either side, in display order.
function familiesOf(left, right) {
  const keys = [];
  for (const key of FAMILY_ORDER) {
    const l = left?.power?.[key]?.total || 0;
    const r = right?.power?.[key]?.total || 0;
    if (l > 0 || r > 0) keys.push(key);
  }
  return keys;
}

function KitList({ side, label, lang, onOpenSkill }) {
  const char = side?.char;
  if (!char) {
    return (
      <div className="compare-kit">
        <h5>{label}</h5>
        <p className="compare-picker-empty">No character configured.</p>
      </div>
    );
  }
  const kit = side.activeSkills || [];
  // The lambda job's data name usually repeats the character name ("Samatha Λ")
  // — only show the job title when it adds information.
  const jobTitle = side.job ? loc(side.job.NameString, lang, '') : '';
  const charName = loc(char.NameString, lang);
  return (
    <div className="compare-kit">
      <h5>
        {label}: {charName}
        {jobTitle && jobTitle !== charName && <span className="compare-hint"> · {jobTitle}</span>}
      </h5>
      <ul className="compare-skill-list">
        {kit.map((e, i) => {
          const skill = e.skill;
          const equipLabel = skill ? equipBoostLabel(skill) : null;
          const buffLabel = skill ? stackBuffLabel(skill) : null;
          const power = skill?.power > 0
            ? `×${Number(skill.power.toFixed(2))}`
            : equipLabel || buffLabel;
          const chipKind = skill?.power > 0 ? '' : equipLabel ? ' equip' : buffLabel ? ' buff' : '';
          const originLabel = e.origin === 'job' ? 'Job' : e.origin === 'buddy' ? 'Companion' : 'Slot';
          return (
            <li
              key={`${e.origin}-${e.skillId}-${i}`}
              className={`compare-skill-row kit ${e.locked ? 'locked' : ''}`}
              {...(onOpenSkill && skill ? { onClick: () => onOpenSkill(e.skillId, skill) } : {})}
            >
              {skill
                ? <SkillIcon skill={skill} size={26} title={loc(skill.nameString, lang, '')} />
                : <span className="compare-slot-name">Unknown (ID {e.skillId})</span>}
              <div className="compare-slot-info">
                <span className="compare-slot-name">{skill ? loc(skill.nameString, lang) : ''}</span>
                <span className="compare-slot-src">
                  <span className={`compare-origin-tag origin-${e.origin}`}>{originLabel}</span>
                  {e.locked ? <span className="compare-lock-note">unlocks at Lv {e.masterLevel}</span> : triggerText(skill)}
                  <EmitConditionBadge skill={skill} />
                </span>
              </div>
              {power && <span className={`compare-power-chip${chipKind}`}>{power}</span>}
            </li>
          );
        })}
        {kit.length === 0 && <li className="compare-skill-row"><span className="compare-slot-name">No active skills.</span></li>}
      </ul>
    </div>
  );
}
