import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameData } from '../../contexts/GameDataContext';
import { fetchCharacter } from '../../api';
import { JOB_MAX_LEVEL, computeSide } from '../../utils/compareCalc';
import CompareSide from './CompareSide';
import ComparisonResult from './ComparisonResult';

// URL params (per side prefix, `left` / `right`):
//   left / right        character ID
//   leftJob / rightJob  index into the character's JobsInfo
//   leftSkills / rightSkills   comma-separated slotted skill IDs (up to 4)
//   leftBuddy / rightBuddy     companion ID
//   level               shared job level for both sides (default 90)
//   stacks              assumed proc count of each stackable stat buff (0-10)

const parseIds = (v) =>
  (v || '').split(',').map(x => Number.parseInt(x, 10)).filter(Number.isFinite).slice(0, 4);

const parseLevel = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), JOB_MAX_LEVEL) : JOB_MAX_LEVEL;
};

const parseStacks = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10) : 0;
};

export default function CompareTab({ params, onParams, onOpenSkill }) {
  const { data, lang } = useGameData();
  const skills = data?.skills || [];

  const [roster, setRoster] = useState(null);
  // Character details fetched by ID (deep links, pickers) — the modal system
  // keeps its own cache, this tab needs one for both sides + recode sources.
  const [charCache, setCharCache] = useState({});
  const fetchingRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/compare/roster')
      .then(r => (r.ok ? r.json() : Promise.reject(`roster ${r.status}`)))
      .then(d => { if (!cancelled) setRoster(d); })
      .catch(e => console.error('Error fetching compare roster:', e));
    return () => { cancelled = true; };
  }, []);

  const ensureChar = (id) => {
    if (id == null || fetchingRef.current.has(String(id))) return;
    fetchingRef.current.add(String(id));
    fetchCharacter(id)
      .then(character => setCharCache(prev => ({ ...prev, [id]: { ...character, loaded: true } })))
      .catch(e => {
        console.error('Error fetching character:', e);
        setCharCache(prev => ({ ...prev, [id]: { error: true } }));
      });
  };

  // Load the two selected characters, plus the recode source of lambda ones —
  // its pre-lambda jobs feed the slottable pool. Re-runs as the cache fills
  // (an ancestor ID is only known once the source character arrived).
  useEffect(() => {
    for (const side of ['left', 'right']) {
      const id = params[side];
      if (id == null) continue;
      ensureChar(id);
      const ancestorId = charCache[id]?.ancestorChrID;
      if (ancestorId) ensureChar(ancestorId);
    }
  }, [params.left, params.right, charCache]);

  const level = parseLevel(params.level);
  const stacks = parseStacks(params.stacks);

  const setParams = (patch, { replace = false } = {}) =>
    onParams({ ...params, ...patch }, { replace });

  const swapSides = () => setParams({
    left: params.right, leftJob: params.rightJob, leftSkills: params.rightSkills, leftBuddy: params.rightBuddy,
    right: params.left, rightJob: params.leftJob, rightSkills: params.leftSkills, rightBuddy: params.leftBuddy,
  });

  const buddiesById = useMemo(() =>
    new Map((roster?.buddies || []).map(b => [b.ID, b])),
  [roster]);

  const buildSide = (side) => {
    const id = params[side] != null ? Number(params[side]) : null;
    if (id == null || Number.isNaN(id)) return { config: null, computed: null };
    const cached = charCache[id];
    const char = cached?.loaded ? cached : null;
    const ancestor = cached?.ancestorChrID && charCache[cached.ancestorChrID]?.loaded
      ? charCache[cached.ancestorChrID]
      : null;
    const buddyId = params[`${side}Buddy`] != null ? Number(params[`${side}Buddy`]) : null;
    const jobIndex = Number.parseInt(params[`${side}Job`] ?? '0', 10) || 0;
    const config = {
      charId: id, char, ancestor,
      charError: cached?.error || false,
      buddyId, buddy: buddiesById.get(buddyId) || null,
      jobIndex, slotIds: parseIds(params[`${side}Skills`]),
    };
    const computed = char
      ? computeSide({
          char, ancestor, skills,
          jobIndex: config.jobIndex,
          slotIds: config.slotIds,
          buddy: config.buddy,
          level,
          stacks,
        })
      : null;
    return { config, computed };
  };

  const left = buildSide('left');
  const right = buildSide('right');

  const sideProps = (side, { config }, label, color) => ({
    side, label, color,
    charId: config?.charId,
    char: config?.char,
    ancestor: config?.ancestor,
    charError: config?.charError,
    charLoading: config != null && config.charId != null && !config.char && !config.charError,
    rosterChars: roster?.characters,
    rosterBuddies: roster?.buddies,
    buddyId: config?.buddyId,
    buddy: config?.buddy,
    jobIndex: config?.jobIndex,
    slotIds: config?.slotIds || [],
    level, skills, lang,
    // The side's patch keys are prefixed; CompareSide already sends them.
    onChange: setParams,
    onOpenSkill,
  });

  return (
    <div className="tab-content compare-tab">
      <div className="compare-toolbar">
        <div className="compare-level">
          <i className="fa-solid fa-gauge-high"></i>
          <label htmlFor="compare-level">Level</label>
          <input
            id="compare-level"
            type="range"
            min="1"
            max={JOB_MAX_LEVEL}
            value={level}
            onChange={e => setParams({ level: e.target.value }, { replace: true })}
          />
          <span className="compare-level-val">{level}</span>
        </div>
        <button className="compare-swap-btn" title="Swap left and right" onClick={swapSides}>
          <i className="fa-solid fa-right-left"></i> Swap sides
        </button>
      </div>

      <div className="compare-grid">
        <CompareSide {...sideProps('left', left, 'Left', 'left')} />
        <CompareSide {...sideProps('right', right, 'Right', 'right')} />
      </div>

      {/* Buff stacks live between the loadout config and the numbers it feeds:
          the results are where the dial gets tuned. */}
      <div className="compare-stacks-row">
        <div className="compare-stacks" title="Assumed proc count of every proc buff in each kit. Stat buffs ('Attack +10%, 30%') are multiplied by it — a deliberate assumption, the game refreshes an active buff instead of stacking a second copy. Damage buffs ('Physical Attack x1.5') cannot stack at all in-game, so each counts once while any proc is assumed: 0 keeps the estimate buffless.">
          <i className="fa-solid fa-layer-group"></i>
          <label htmlFor="compare-stacks">Buff stacks</label>
          <select
            id="compare-stacks"
            value={stacks}
            onChange={e => setParams({ stacks: e.target.value }, { replace: true })}
          >
            {Array.from({ length: 11 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? '0 (buffless)' : `${n} proc${n === 1 ? '' : 's'} of each`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ComparisonResult
        left={left.computed}
        right={right.computed}
        lang={lang}
        level={level}
        stacks={stacks}
        onOpenSkill={onOpenSkill}
      />
    </div>
  );
}
