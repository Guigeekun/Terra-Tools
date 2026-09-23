import { useMemo } from 'react';
import { loc } from '../../utils/localization';
import { skillAttribMeta, skillKindLabels, sourceTypeMeta, isTapSkill } from '../../utils/constants';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';
import { usePersistentState } from '../../hooks/usePersistentState';

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'character', label: 'Characters' },
  { value: 'buddy', label: 'Companions' },
  { value: 'enemy', label: 'Enemies' },
  { value: 'none', label: 'No Known Source' }
];

const TRIGGER_OPTIONS = [
  { value: '', label: 'All Triggers' },
  { value: 'equip', label: 'Equip (Passive)' },
  { value: 'active', label: 'Triggered (%)' },
  { value: 'tap', label: 'Tap (Charges)' }
];

function SortHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`th-sortable${active ? ' active' : ''}`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <i className={`fa-solid ${active ? (sort.dir === 'asc' ? 'fa-arrow-up-long' : 'fa-arrow-down-long') : 'fa-sort'}`} />
    </th>
  );
}

function sourceTitle(sources) {
  return sources
    .map(s => {
      if (s.type === 'character') {
        const jobs = s.jobs?.map(j => j.name).filter(Boolean).join(', ');
        return `Character: ${s.name}${jobs ? ` (${jobs})` : ''}`;
      }
      if (s.type === 'buddy') return 'Companion: ' + s.name;
      return `Enemy: ${s.name}${s.count > 1 ? ` (×${s.count} variants)` : ''}${s.boss ? ' [Boss]' : ''}`;
    })
    .join('\n');
}

function SourceChip({ source, onOpenSource }) {
  const meta = sourceTypeMeta[source.type];
  // Characters and companions have a dedicated tab to browse; enemies don't
  const targetTab = source.type === 'character' ? 'characters' : source.type === 'buddy' ? 'buddies' : null;
  const clickable = targetTab && onOpenSource;

  const content = (
    <>
      {source.image ? (
        <img src={source.image} alt="" loading="lazy" />
      ) : (
        <span className="chip-type-icon" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
          <i className={`fa-solid ${meta.icon}`} />
        </span>
      )}
      <span className="chip-name">{source.name}</span>
      {source.type === 'character' && source.jobs?.length > 1 && (
        <span className="chip-count">×{source.jobs.length} jobs</span>
      )}
      {source.type === 'enemy' && source.count > 1 && (
        <span className="chip-count">×{source.count}</span>
      )}
      {source.type === 'enemy' && source.boss && (
        <span className="chip-count chip-boss" title="Boss"><i className="fa-solid fa-crown" /></span>
      )}
    </>
  );

  if (clickable) {
    return (
      <span
        className="source-chip clickable"
        style={{ '--chip-color': meta.color }}
        title={`${sourceTitle([source])} — click to browse in ${meta.label}s tab`}
        onClick={() => onOpenSource(targetTab, source.name)}
      >
        {content}
      </span>
    );
  }
  return (
    <span className="source-chip" style={{ '--chip-color': meta.color }} title={sourceTitle([source])}>
      {content}
    </span>
  );
}

function SourcesCell({ sources, onOpenSource }) {
  if (!sources || sources.length === 0) {
    return <span className="source-none">No known source</span>;
  }
  const shown = sources.slice(0, 3);
  const extra = sources.length - shown.length;
  return (
    <div className="source-chips" title={sourceTitle(sources)}>
      {shown.map((s, i) => <SourceChip key={i} source={s} onOpenSource={onOpenSource} />)}
      {extra > 0 && <span className="source-chip chip-more">+{extra} more</span>}
    </div>
  );
}

export default function SkillsTab({ onOpenSource }) {
  // Filter/sort state persists in localStorage across sessions
  const [search, setSearch] = usePersistentState('skills.search', '');
  const [sourceType, setSourceType] = usePersistentState('skills.sourceType', '');
  const [element, setElement] = usePersistentState('skills.element', '');
  const [kind, setKind] = usePersistentState('skills.kind', '');
  const [trigger, setTrigger] = usePersistentState('skills.trigger', '');
  const [sort, setSort] = usePersistentState('skills.sort', { key: 'id', dir: 'asc' });

  const filters = useMemo(() => ({
    search,
    source_type: sourceType,
    element,
    kind,
    trigger,
    sort: sort.key,
    order: sort.dir
  }), [search, sourceType, element, kind, trigger, sort]);

  const { items: skills, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang } = usePaginatedCategory('skills', filters, 30);

  const onSort = (key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'sources' || key === 'power' ? 'desc' : 'asc' });
  };

  const hasActiveFilters = search || sourceType || element || kind || trigger || sort.key !== 'id' || sort.dir !== 'asc';

  return (
    <div className="tab-content">
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search skills or sources (character, companion, enemy)..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
        <div className="filters-group">
          <select value={sourceType} onChange={e => setSourceType(e.target.value)} title="Filter by where the skill can be obtained">
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={element} onChange={e => setElement(e.target.value)}>
            <option value="">All Elements</option>
            {Object.entries(skillAttribMeta).map(([id, meta]) => (
              <option key={id} value={id}>{meta.name}</option>
            ))}
          </select>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="">All Kinds</option>
            {Object.entries(skillKindLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={trigger} onChange={e => setTrigger(e.target.value)}>
            {TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="results-meta">
        <span><i className="fa-solid fa-wand-magic-sparkles"></i> Showing {skills.length} of {total} skills</span>
        {hasActiveFilters && (
          <button className="results-reset" onClick={() => { setSearch(''); setSourceType(''); setElement(''); setKind(''); setTrigger(''); setSort({ key: 'id', dir: 'asc' }); }}>
            <i className="fa-solid fa-rotate-left"></i> Reset
          </button>
        )}
      </div>

      <div className="table-container skills-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="ID" sortKey="id" sort={sort} onSort={onSort} />
              <SortHeader label="Skill" sortKey="name" sort={sort} onSort={onSort} />
              <th>Element</th>
              <SortHeader label="Trigger" sortKey="trigger" sort={sort} onSort={onSort} />
              <SortHeader label="Power" sortKey="power" sort={sort} onSort={onSort} />
              <th>Area</th>
              <SortHeader label="Sources" sortKey="sources" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody id="skills-table-body">
            {isInitialLoading && skills.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40 }}><TabSpinner message="Loading skills..." /></td></tr>
            ) : skills.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No skills matched the selected filters.</td></tr>
            ) : (
              <>
                {skills.map((skill) => {
                  const attrib = skillAttribMeta[skill.attrib] || { name: 'None', color: '#6b7280' };
                  const kindLabel = skillKindLabels[skill.kind];
                  return (
                    <tr key={skill.ID}>
                      <td><code>{skill.ID}</code></td>
                      <td className="skill-name-cell" style={{ maxWidth: 380 }}>
                        <strong className="skill-name">{loc(skill.nameString, lang)}</strong>
                        {kindLabel && <span className="skill-kind-tag">{kindLabel}</span>}
                        <p className="skill-desc">{loc(skill.descString, lang, '')}</p>
                      </td>
                      <td>
                        <span className="badge element-badge" style={{ color: attrib.color, borderColor: `${attrib.color}44`, backgroundColor: `${attrib.color}14` }}>
                          {attrib.icon || attrib.svg ? (
                            attrib.icon
                              ? <img src={attrib.icon} alt="" width="14" height="14" style={{ verticalAlign: 'middle' }} />
                              : <span dangerouslySetInnerHTML={{ __html: attrib.svg }} />
                          ) : null}
                          {attrib.name}
                        </span>
                      </td>
                      <td>
                        {isTapSkill(skill) ? (
                          <span
                            className="badge trigger-badge tap"
                            title={`Activated by tapping the unit before it moves — ${skill.emitRatio} charge${skill.emitRatio === 1 ? '' : 's'} per battle`}
                          >
                            <i className="fa-solid fa-hand-pointer" /> Tap · {skill.emitRatio} {skill.emitRatio === 1 ? 'charge' : 'charges'}
                          </span>
                        ) : skill.emitRatio === 0 ? (
                          <span className="badge trigger-badge equip">Equip</span>
                        ) : (
                          <span className="badge trigger-badge active">{skill.emitRatio || 0}%</span>
                        )}
                      </td>
                      <td>{skill.power ? Number(skill.power.toFixed(2)) : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="badge area-badge">{loc(skill.rangePrefixString, lang, 'Self')}{skill.range > 1 ? ` · ${skill.range}` : ''}</span>
                      </td>
                      <td className="sources-cell">
                        <SourcesCell sources={skill.sources} onOpenSource={onOpenSource} />
                      </td>
                    </tr>
                  );
                })}
                <tr ref={sentinelRef}>
                  <td colSpan="7" style={{ height: 30, border: 'none', textAlign: 'center' }}>
                    {isFetchingNextPage && <div className="loading-spinner" style={{ width: 20, height: 20, margin: '0 auto', borderTopColor: 'var(--accent-blue)' }} />}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
