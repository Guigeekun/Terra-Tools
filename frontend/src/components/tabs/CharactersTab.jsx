import { useState, useMemo } from 'react';
import { loc } from '../../utils/localization';
import { rarityLabels, speciesTranslations, weaponMeta, elementMeta } from '../../utils/constants';
import JobBadge from '../shared/JobBadge';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';
import { usePersistentState } from '../../hooks/usePersistentState';

export default function CharactersTab({ onSelectCharacter, initialSearch = '' }) {
  // Search stays session-local so source-chip navigation (initialSearch) always wins;
  // dropdown filters persist in localStorage across sessions.
  const [search, setSearch] = useState(initialSearch);
  const [species, setSpecies] = usePersistentState('characters.species', '');
  const [rarity, setRarity] = usePersistentState('characters.rarity', '');
  const [weapon, setWeapon] = usePersistentState('characters.weapon', '');
  const [element, setElement] = usePersistentState('characters.element', '');

  const filters = useMemo(() => ({
    search, species, rarity, weapon, element
  }), [search, species, rarity, weapon, element]);

  const { items: characters, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang } = usePaginatedCategory('characters', filters, 35);

  return (
    <div className="tab-content">
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search characters by name, ID, or profile..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
        <div className="filters-group">
          <select value={species} onChange={e => setSpecies(e.target.value)}>
            <option value="">All Species</option>
            {Object.entries(speciesTranslations).map(([id, trans]) => (
              <option key={id} value={id}>{trans[lang] || trans.en}</option>
            ))}
          </select>
          <select value={rarity} onChange={e => setRarity(e.target.value)}>
            <option value="">All Rarities</option>
            {Object.entries(rarityLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={weapon} onChange={e => setWeapon(e.target.value)}>
            <option value="">All Weapons</option>
            {Object.entries(weaponMeta).map(([id, meta]) => (
              <option key={id} value={id}>{meta.name}</option>
            ))}
          </select>
          <select value={element} onChange={e => setElement(e.target.value)}>
            <option value="">All Elements</option>
            {Object.entries(elementMeta).map(([id, meta]) => (
              <option key={id} value={id}>{meta.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid-layout">
        {isInitialLoading && characters.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center' }}>
            <TabSpinner message="Loading characters..." />
          </div>
        ) : characters.length === 0 ? (
          <p className="stages-panel-placeholder" style={{ gridColumn: '1/-1' }}>No characters match the selected filters.</p>
        ) : (
          <>
            {characters.map(char => {
              const firstJob = char.JobsInfo?.[0];
              const pieceUrl = firstJob?.piece_file ? `/api/assets/image?path=${encodeURIComponent(firstJob.piece_file)}` : null;
              return (
                <div key={char.ID} className="card-item" onClick={() => onSelectCharacter(char)}>
                  <span className="card-badge badge-rarity">{rarityLabels[char.rarity] || 'Class ' + char.rarity}</span>
                  {char.recode && (
                    <span className="card-badge badge-recode" title="This character can be recoded into its lambda form">
                      <i className="fa-solid fa-arrows-rotate"></i> Λ
                    </span>
                  )}
                  {pieceUrl ? (
                    <div className="card-image" style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                      <img src={pieceUrl} alt="Icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div className="card-image-placeholder"><i className="fa-solid fa-user-shield"></i></div>
                  )}
                  <h4 className="card-name">{loc(char.NameString, lang)}</h4>
                  <div className="card-meta"><span><i className="fa-solid fa-circle-nodes"></i> ID: {char.ID}</span></div>
                  {char.JobsInfo?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                      {char.JobsInfo.map((job, i) => <JobBadge key={i} job={job} />)}
                    </div>
                  )}
                </div>
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
