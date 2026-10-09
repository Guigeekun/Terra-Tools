import { useState, useEffect, useMemo } from 'react';
import { loc } from '../../utils/localization';
import { rarityLabels, triggerText } from '../../utils/constants';
import { TabSpinner, useLazyCategory } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';
import { usePersistentState } from '../../hooks/usePersistentState';
import SkillIcon from '../shared/SkillIcon';

export default function BuddiesTab({ onSelectBuddy, initialSearch = '', onOpenSkill }) {
  // Search stays session-local so source-chip navigation (initialSearch) always wins;
  // dropdown filters persist in localStorage across sessions. The URL is the
  // exception: back/forward through '?q=' entries re-applies the search.
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);
  const [rarity, setRarity] = usePersistentState('buddies.rarity', '');

  useLazyCategory('skills');

  const filters = useMemo(() => ({ search, rarity }), [search, rarity]);

  const { items: buddies, isInitialLoading, isFetchingNextPage, sentinelRef, lang, data } = usePaginatedCategory('buddies', filters, 35);

  return (
    <div className="tab-content">
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search companions..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
        <div className="filters-group">
          <select value={rarity} onChange={e => setRarity(e.target.value)}>
            <option value="">All Rarities</option>
            {Object.entries(rarityLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid-layout">
        {isInitialLoading && buddies.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center' }}>
            <TabSpinner message="Loading companions database..." />
          </div>
        ) : buddies.length === 0 ? (
          <p className="stages-panel-placeholder" style={{ gridColumn: '1/-1' }}>No companions match the selected filters.</p>
        ) : (
          <>
            {buddies.map(buddy => {
              const thumbUrl = buddy.thumb_file ? `/api/assets/image?path=${encodeURIComponent(buddy.thumb_file)}` : null;
              // Real deep link so middle-click opens the companion in a new
              // tab; left-click keeps the session handler (?q= safe).
              return (
                <a
                  key={buddy.ID}
                  href={`#/buddies?buddy=${buddy.ID}`}
                  className="card-item"
                  onClick={(e) => { e.preventDefault(); onSelectBuddy(buddy); }}
                >
                  <span className="card-badge badge-rarity">{rarityLabels[buddy.rarity] || 'Class ' + buddy.rarity}</span>
                  {thumbUrl ? (
                    <div className="card-image" style={{ width: '100%', aspectRatio: '1 / 1', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                      <img src={thumbUrl} alt="Companion" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div className="card-image-placeholder"><i className="fa-solid fa-paw"></i></div>
                  )}
                  <h4 className="card-name">{loc(buddy.NameString, lang)}</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 12, height: '3.2em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {loc(buddy.DescString, lang)}
                  </p>
                  <div className="card-meta">
                    {buddy.skill && data?.skills?.[buddy.skill - 1] ? (
                      <span
                        {...(onOpenSkill ? {
                          className: 'skill-jump',
                          title: 'View this skill in the Skills catalog',
                          // preventDefault: the chip sits inside the card's
                          // link — without it the browser would still follow
                          // the card href (stopPropagation doesn't stop that).
                          onClick: (e) => { e.preventDefault(); e.stopPropagation(); onOpenSkill(buddy.skill, data.skills[buddy.skill - 1]); },
                        } : {})}
                        style={{ color: 'var(--accent-indigo)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <SkillIcon skill={data.skills[buddy.skill - 1]} size={18} bare title={loc(data.skills[buddy.skill - 1].nameString, lang, '')} />
                        {loc(data.skills[buddy.skill - 1].nameString, lang)} ({triggerText(data.skills[buddy.skill - 1])})
                      </span>
                    ) : buddy.skill && !data?.skills ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i> Loading skill...
                      </span>
                    ) : (
                      <span><i className="fa-solid fa-minus"></i> No Skill</span>
                    )}
                  </div>
                  <div className="card-details-row">
                    <span style={{ fontSize: 10, wordBreak: 'break-all', fontFamily: 'monospace', color: 'var(--accent-blue)' }}>
                      Thumb: {buddy.thumb_file ? buddy.thumb_file.split('/').pop() : 'None'}
                    </span>
                  </div>
                </a>
              );
            })}
            <div ref={sentinelRef} style={{ height: 30, gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isFetchingNextPage && <div className="loading-spinner" style={{ width: 24, height: 24, borderTopColor: 'var(--accent-blue)' }} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
