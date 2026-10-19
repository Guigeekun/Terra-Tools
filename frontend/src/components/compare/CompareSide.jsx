import { useMemo, useState } from 'react';
import { loc } from '../../utils/localization';
import { rarityShortLabels, weaponMeta, elementMeta, triggerText } from '../../utils/constants';
import { buildSkillPool, jobFixedSkills, resolveSlotSkills, equipBoostLabel } from '../../utils/compareCalc';
import SkillIcon from '../shared/SkillIcon';
import EmitConditionBadge from '../shared/EmitConditionBadge';

// One half of the Compare tab: character, job, the four slottable skills and
// a companion. Every change is reported upward as a params patch; the URL
// stays the single source of truth.
export default function CompareSide({
  side, label, color, charId, char, ancestor, charError, charLoading, rosterChars, rosterBuddies,
  buddyId, buddy, jobIndex, slotIds = [], level, skills, lang, onChange, onOpenSkill,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [charSearch, setCharSearch] = useState('');
  const [buddyPickerOpen, setBuddyPickerOpen] = useState(false);
  const [buddySearch, setBuddySearch] = useState('');
  const [slotPicker, setSlotPicker] = useState(null); // slot index whose picker is open
  const [slotSearch, setSlotSearch] = useState('');

  const patch = (p, { replace = false } = {}) => onChange(p, { replace });

  const jobs = char?.JobsInfo || [];
  const job = jobs[jobIndex] || jobs[0] || null;

  const pool = useMemo(() => (char ? buildSkillPool(char, ancestor) : []), [char, ancestor]);
  const fixedIds = new Set(job ? jobFixedSkills(job).map(e => e.skillId) : []);
  const usedIds = new Set([...fixedIds, ...slotIds]);

  // Display and editing operate on the validated slot list (the same one the
  // math uses) so a hand-edited URL can never show a skill that isn't
  // actually counted — duplicates of the job's fixed skills drop silently.
  const validSlotIds = useMemo(
    () => (job ? resolveSlotSkills(char, ancestor, job, slotIds).map(e => e.skillId) : []),
    [char, ancestor, job, slotIds],
  );

  const slotOptions = useMemo(() => {
    const q = slotSearch.toLowerCase().trim();
    return pool
      .filter(e => !usedIds.has(e.skillId))
      .map(e => ({ ...e, skill: skills[e.skillId - 1] }))
      .filter(e => e.skill)
      .filter(e => !q
        || (e.skill.nameString?.en || '').toLowerCase().includes(q)
        || (e.skill.nameString?.ja || '').includes(q)
        || String(e.skillId) === q);
  }, [pool, usedIds, skills, slotSearch]);

  const charMatches = useMemo(() => {
    if (!rosterChars) return [];
    const q = charSearch.toLowerCase().trim();
    if (!q) return rosterChars;
    return rosterChars.filter(c =>
      (c.name?.en || '').toLowerCase().includes(q)
      || (c.name?.ja || '').includes(q)
      || String(c.ID) === q);
  }, [rosterChars, charSearch]);

  const buddyMatches = useMemo(() => {
    if (!rosterBuddies) return [];
    const q = buddySearch.toLowerCase().trim();
    if (!q) return rosterBuddies;
    return rosterBuddies.filter(b =>
      (b.name?.en || '').toLowerCase().includes(q)
      || (b.name?.ja || '').includes(q)
      || String(b.ID) === q);
  }, [rosterBuddies, buddySearch]);

  const pickChar = (id) => {
    // A new character invalidates the side's job/slot/companion picks.
    patch({ [`${side}`]: id, [`${side}Job`]: undefined, [`${side}Skills`]: undefined, [`${side}Buddy`]: undefined });
    setPickerOpen(false);
    setCharSearch('');
  };
  const clearChar = () => patch({ [side]: undefined, [`${side}Job`]: undefined, [`${side}Skills`]: undefined, [`${side}Buddy`]: undefined }, { replace: true });

  const setSlot = (index, skillId) => {
    const next = validSlotIds.filter((_, i) => i !== index);
    if (skillId != null) next.splice(index, 0, skillId);
    patch({ [`${side}Skills`]: next.join(',') || undefined }, { replace: true });
  };

  const setBuddy = (id) => {
    patch({ [`${side}Buddy`]: id }, { replace: true });
    setBuddyPickerOpen(false);
    setBuddySearch('');
  };

  const name = char ? loc(char.NameString, lang) : null;
  const pieceUrl = job?.piece_file ? `/api/assets/image?path=${encodeURIComponent(job.piece_file)}` : null;

  return (
    <div className={`compare-side ${color}`}>
      <div className="compare-side-header">
        <span className="compare-side-label">{label}</span>
        {char && (
          <button className="compare-clear-btn" title="Clear this side" onClick={clearChar}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      {/* --- character --- */}
      {charLoading ? (
        <p className="compare-loading-row"><i className="fa-solid fa-circle-notch fa-spin"></i> Loading character…</p>
      ) : !char ? (
        <button className="compare-pick-trigger" onClick={() => setPickerOpen(o => !o)}>
          <i className="fa-solid fa-user-plus"></i>
          <span>{charError ? 'Character not found — pick another' : 'Choose a character'}</span>
          <i className={`fa-solid fa-chevron-${pickerOpen ? 'up' : 'down'}`}></i>
        </button>
      ) : (
        <div className="compare-char-summary">
          {pieceUrl && <img src={pieceUrl} alt="" className="compare-char-thumb" />}
          <div className="compare-char-id">
            <strong>{name}</strong>
            <span className="compare-char-sub">
              <span className="badge badge-rarity static" title="Class">{rarityShortLabels[char.rarity] || char.rarity}</span>
              {char.isLambda ? <span className="badge badge-recode static" title="Lambda character"><i className="fa-solid fa-arrows-rotate"></i> Λ</span> : null}
              <span className="compare-char-idno">#{char.ID}</span>
            </span>
          </div>
          <button className="compare-change-btn" title="Choose another character" onClick={() => setPickerOpen(o => !o)}>
            <i className="fa-solid fa-rotate"></i>
          </button>
        </div>
      )}

      {pickerOpen && (
        <div className="compare-picker">
          <div className="search-input-wrapper">
            <i className="fa-solid fa-search"></i>
            <input
              placeholder="Filter by name or ID…"
              value={charSearch}
              autoFocus
              onChange={e => setCharSearch(e.target.value)}
            />
          </div>
          <div className="compare-picker-list">
            {!rosterChars && <p className="compare-picker-empty">Loading roster…</p>}
            {rosterChars && charMatches.length === 0 && <p className="compare-picker-empty">No character matches.</p>}
            {charMatches.map(c => (
              <button
                key={c.ID}
                className={`compare-picker-row ${String(c.ID) === String(charId ?? '') ? 'selected' : ''}`}
                onClick={() => pickChar(String(c.ID))}
              >
                <span className="compare-picker-name">{loc(c.name, lang)}</span>
                <span className="badge badge-rarity static">{rarityShortLabels[c.rarity] || c.rarity}</span>
                {c.isLambda ? <span className="badge badge-recode static" title="Lambda character">Λ</span> : null}
                <span className="compare-picker-jobs">{c.jobCount} job{c.jobCount === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- job --- */}
      {jobs.length > 0 && (
        <div className="compare-section">
          <h5><i className="fa-solid fa-helmet-battle"></i> Job</h5>
          <div className="compare-job-chips">
            {jobs.map((j, i) => {
              // isLambda is a 0/1 flag in the game data — coerce it, or the
              // falsy 0 leaks into JSX and renders a stray "0" in the chip.
              const isLambdaJob = Boolean(char.isLambda) && i === jobs.length - 1;
              const weap = weaponMeta[j.Attrib] || weaponMeta[4];
              const elem = elementMeta[j.SkillAttrib] || elementMeta[0];
              return (
                <button
                  key={i}
                  className={`compare-job-chip ${i === (jobs.indexOf(job)) ? 'active' : ''}`}
                  title={`${loc(j.NameString, lang, `Job ${i + 1}`)} — ${weap.name} / ${elem.name}`}
                  onClick={() => patch({ [`${side}Job`]: i })}
                >
                  {weap.icon && <img src={weap.icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                  {elem.icon && <img src={elem.icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                  {elem.svg && !elem.icon && <span dangerouslySetInnerHTML={{ __html: elem.svg }} style={{ display: 'flex' }} />}
                  <span>Job {i + 1}</span>
                  {isLambdaJob && <span className="lambda-mark">Λ</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* --- fixed job skills --- */}
      {job && (
        <div className="compare-section">
          <h5><i className="fa-solid fa-wand-magic-sparkles"></i> Job skills <span className="compare-hint">fixed to this job</span></h5>
          <ul className="compare-skill-list">
            {jobFixedSkills(job).map((e, i) => (
              <SkillRow key={`fixed-${i}`} entry={{ ...e, sourceJob: job }} skills={skills} level={level} lang={lang} onOpenSkill={onOpenSkill} />
            ))}
          </ul>
        </div>
      )}

      {/* --- slotted skills --- */}
      {job && (
        <div className="compare-section">
          <h5><i className="fa-solid fa-layer-group"></i> Slotted skills <span className="compare-hint">learned from other jobs</span></h5>
          <div className="compare-slots">
            {[0, 1, 2, 3].map(i => {
              const entryId = validSlotIds[i];
              const entry = entryId ? pool.find(e => e.skillId === entryId) : null;
              const skill = entry ? skills[entry.skillId - 1] : null;
              const locked = entry && level < entry.masterLevel;
              return (
                <div key={i} className={`compare-slot ${skill ? 'filled' : ''} ${locked ? 'locked' : ''}`}>
                  {skill ? (
                    <>
                      <SkillIcon skill={skill} size={26} title={loc(skill.nameString, lang, '')} />
                      <div className="compare-slot-info">
                        <span className="compare-slot-name">{loc(skill.nameString, lang)}</span>
                        <span className="compare-slot-src">
                          {locked && <span className="compare-lock-note">Unlocks at Lv {entry.masterLevel}</span>}
                          {!locked && <span>{triggerText(skill)}</span>}
                          {entry.sourceJob && char.JobsInfo.includes(entry.sourceJob)
                            ? ` · from ${char.isLambda && char.JobsInfo.indexOf(entry.sourceJob) === char.JobsInfo.length - 1 ? 'Λ job' : `Job ${char.JobsInfo.indexOf(entry.sourceJob) + 1}`}`
                            : entry.sourceJob ? ' · from pre-Λ job' : ''}
                        </span>
                      </div>
                      <button className="compare-slot-x" title="Remove from slot" onClick={() => setSlot(i, null)}>
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </>
                  ) : (
                    <button className="compare-slot-empty" onClick={() => { setSlotPicker(slotPicker === i ? null : i); setSlotSearch(''); }}>
                      <i className="fa-solid fa-plus"></i> Slot {i + 1}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {slotPicker != null && (
            <div className="compare-picker">
              <div className="search-input-wrapper">
                <i className="fa-solid fa-search"></i>
                <input
                  placeholder="Filter skills…"
                  value={slotSearch}
                  autoFocus
                  onChange={e => setSlotSearch(e.target.value)}
                />
              </div>
              <div className="compare-picker-list">
                {slotOptions.length === 0 && <p className="compare-picker-empty">No learnable skill left — level another job first.</p>}
                {slotOptions.map(e => (
                  <button key={e.skillId} className="compare-picker-row" onClick={() => { setSlot(slotPicker, e.skillId); setSlotPicker(null); }}>
                    <SkillIcon skill={e.skill} size={22} />
                    <span className="compare-picker-name">{loc(e.skill.nameString, lang)}</span>
                    <span className="compare-picker-jobs">
                      {char.isLambda && char.JobsInfo.indexOf(e.sourceJob) === char.JobsInfo.length - 1
                        ? 'Λ job'
                        : char.JobsInfo.includes(e.sourceJob)
                          ? `Job ${char.JobsInfo.indexOf(e.sourceJob) + 1}`
                          : 'Pre-Λ job'}
                      {' · unlocks '}
                      {e.masterLevel}
                    </span>
                  </button>
                ))}
              </div>
              <button className="compare-picker-close" onClick={() => setSlotPicker(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* --- companion --- */}
      <div className="compare-section">
        <h5><i className="fa-solid fa-paw"></i> Companion</h5>
        {buddy ? (
          <div className="compare-buddy-row">
            {buddy.thumb_file && <img src={`/api/assets/image?path=${encodeURIComponent(buddy.thumb_file)}`} alt="" className="compare-buddy-thumb" />}
            <div className="compare-slot-info">
              <span className="compare-slot-name">{loc(buddy.name, lang)}</span>
              <span className="compare-slot-src">
                Lv {buddy.MaxLevel} · ATK {buddy.ATKmax} · DEF {buddy.DEFmax} · MATK {buddy.SATKmax} · MDEF {buddy.SDEFmax}
              </span>
              {level < (buddy.RequiredLevel || 1) && (
                <span className="compare-lock-note"><i className="fa-solid fa-triangle-exclamation"></i> Needs character Lv {buddy.RequiredLevel} — not counted</span>
              )}
            </div>
            <button className="compare-slot-x" title="Remove companion" onClick={() => setBuddy(null)}><i className="fa-solid fa-xmark"></i></button>
          </div>
        ) : (
          <button className="compare-pick-trigger" onClick={() => setBuddyPickerOpen(o => !o)}>
            <i className="fa-solid fa-plus"></i>
            <span>No companion — choose one</span>
            <i className={`fa-solid fa-chevron-${buddyPickerOpen ? 'up' : 'down'}`}></i>
          </button>
        )}
        {buddy && (
          <button className="compare-change-btn compare-change-btn-wide" onClick={() => setBuddyPickerOpen(o => !o)}>
            <i className="fa-solid fa-rotate"></i> Change companion
          </button>
        )}

        {buddyPickerOpen && (
          <div className="compare-picker">
            <div className="search-input-wrapper">
              <i className="fa-solid fa-search"></i>
              <input
                placeholder="Filter companions…"
                value={buddySearch}
                autoFocus
                onChange={e => setBuddySearch(e.target.value)}
              />
            </div>
            <div className="compare-picker-list">
              <button className={`compare-picker-row ${buddyId == null ? 'selected' : ''}`} onClick={() => setBuddy(null)}>
                <span className="compare-picker-name">— None —</span>
              </button>
              {buddyMatches.map(b => {
                const blockedBy = [];
                if ((b.exclusiveChrID || 0) > 0 && b.exclusiveChrID !== char?.ID) {
                  const owner = rosterChars?.find(c => c.ID === b.exclusiveChrID);
                  blockedBy.push(owner ? `Exclusive to ${loc(owner.name, lang)}` : `Exclusive to #${b.exclusiveChrID}`);
                }
                const species = job?.Species;
                if ((b.exclusiveSpeciesID || 0) > 0 && species != null && b.exclusiveSpeciesID !== species) {
                  blockedBy.push('Restricted to another species');
                }
                const needsLevel = level < (b.RequiredLevel || 1);
                return (
                  <button
                    key={b.ID}
                    className={`compare-picker-row ${String(b.ID) === String(buddyId ?? '') ? 'selected' : ''} ${blockedBy.length ? 'disabled' : ''}`}
                    disabled={blockedBy.length > 0}
                    title={blockedBy.join(' · ')}
                    onClick={() => setBuddy(String(b.ID))}
                  >
                    {b.thumb_file && <img src={`/api/assets/image?path=${encodeURIComponent(b.thumb_file)}`} alt="" loading="lazy" className="compare-buddy-thumb small" />}
                    <span className="compare-picker-name">{loc(b.name, lang)}</span>
                    {needsLevel
                      ? <span className="compare-lock-note">Lv {b.RequiredLevel}+</span>
                      : <span className="compare-picker-jobs">Lv {b.MaxLevel}</span>}
                    {blockedBy.length > 0 && <i className="fa-solid fa-lock compare-lock-icon"></i>}
                  </button>
                );
              })}
            </div>
            <button className="compare-picker-close" onClick={() => setBuddyPickerOpen(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// One skill line used by the fixed-kit list (slots render their own rows).
function SkillRow({ entry, skills, level, lang, onOpenSkill }) {
  const skill = skills[entry.skillId - 1];
  if (!skill) {
    return <li className="compare-skill-row"><span className="compare-slot-name">Unknown skill (ID {entry.skillId})</span></li>;
  }
  const locked = level < entry.masterLevel;
  const power = skill.power > 0 ? Number(skill.power.toFixed(2)) : null;
  const equipLabel = equipBoostLabel(skill);
  return (
    <li
      className={`compare-skill-row ${locked ? 'locked' : ''}`}
      {...(onOpenSkill ? { onClick: () => onOpenSkill(entry.skillId, skill) } : {})}
    >
      <SkillIcon skill={skill} size={26} title={loc(skill.nameString, lang, '')} />
      <div className="compare-slot-info">
        <span className="compare-slot-name">
          {loc(skill.nameString, lang)}
          {locked && <span className="compare-lock-note"> · unlocks at Lv {entry.masterLevel}</span>}
        </span>
        <span className="compare-slot-src">
          {triggerText(skill)}
          <EmitConditionBadge skill={skill} />
        </span>
      </div>
      {power != null && <span className="compare-power-chip">×{power}</span>}
      {power == null && equipLabel && <span className="compare-power-chip equip">{equipLabel}</span>}
    </li>
  );
}
