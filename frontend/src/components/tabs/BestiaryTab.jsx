import { useState, useEffect, useMemo } from 'react';
import { loc } from '../../utils/localization';
import { enemySpeciesMeta, enemySpeciesLabel, elementMeta } from '../../utils/constants';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';
import { usePersistentState } from '../../hooks/usePersistentState';

export default function BestiaryTab({ onSelectEnemy, initialSearch = '' }) {
  // Same session/persisted split as CharactersTab: the source-chip search
  // (initialSearch) wins for the session, dropdown filters persist locally.
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);
  const [species, setSpecies] = usePersistentState('bestiary.species', '');
  const [element, setElement] = usePersistentState('bestiary.element', '');
  const [frame, setFrame] = usePersistentState('bestiary.frame', '');
  const [sort, setSort] = usePersistentState('bestiary.sort', 'id');

  const filters = useMemo(() => ({
    search, species, element, frame, sort
  }), [search, species, element, frame, sort]);

  const { items: enemies, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang } = usePaginatedCategory('enemies', filters, 35);

  return (
    <div className="tab-content">
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search enemies by name, ID..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
        <div className="filters-group">
          <select value={species} onChange={e => setSpecies(e.target.value)}>
            <option value="">All Species</option>
            {Object.entries(enemySpeciesMeta).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={element} onChange={e => setElement(e.target.value)}>
            <option value="">All Elements</option>
            {Object.entries(elementMeta).filter(([id]) => Number(id) <= 4).map(([id, meta]) => (
              <option key={id} value={id}>{meta.name}</option>
            ))}
          </select>
          <select value={frame} onChange={e => setFrame(e.target.value)}>
            <option value="">All Foes</option>
            <option value="boss">Bosses only</option>
            <option value="normal">Normal only</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="id">Game order</option>
            <option value="name">Name</option>
            <option value="variants">Most variants</option>
            <option value="level">Highest level</option>
          </select>
        </div>
      </div>

      <div className="grid-layout">
        {isInitialLoading && enemies.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center' }}>
            <TabSpinner message="Loading bestiary..." />
          </div>
        ) : enemies.length === 0 ? (
          <p className="stages-panel-placeholder" style={{ gridColumn: '1/-1' }}>No enemies match the selected filters.</p>
        ) : (
          <>
            {enemies.map(enemy => {
              const pieceUrl = enemy.image_file ? `/api/assets/image?path=${encodeURIComponent(enemy.image_file)}` : null;
              const levelRange = enemy.min_lv === enemy.max_lv ? `Lv ${enemy.min_lv}` : `Lv ${enemy.min_lv}–${enemy.max_lv}`;
              // Real deep link so middle-click opens the enemy modal in a new
              // tab; left-click still routes through onSelectEnemy to keep the
              // ?q= search param in the pushed history entry.
              return (
                <a
                  key={enemy.first_id}
                  href={`#/bestiary?enemy=${enemy.first_id}`}
                  className="card-item"
                  onClick={(e) => { e.preventDefault(); onSelectEnemy(enemy); }}
                >
                  <span className="card-badge badge-rarity">{enemy.variant_count} variant{enemy.variant_count === 1 ? '' : 's'}</span>
                  {enemy.boss && (
                    <span className="card-badge badge-recode" title="At least one variant uses a boss battle frame">
                      <i className="fa-solid fa-crown"></i> Boss
                    </span>
                  )}
                  {pieceUrl ? (
                    <div className="card-image" style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                      <img src={pieceUrl} alt={loc(enemy.NameString, lang)} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div className="card-image-placeholder"><i className="fa-solid fa-skull"></i></div>
                  )}
                  <h4 className="card-name">{loc(enemy.NameString, lang)}</h4>
                  <div className="card-meta">
                    <span><i className="fa-solid fa-circle-nodes"></i> ID: {enemy.first_id}</span>
                    <span><i className="fa-solid fa-angles-up"></i> {levelRange}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                    {/* Group-level species/element are null when variants disagree: only claim what every variant shares */}
                    {enemy.species != null && (
                      <span className="badge" style={{ fontSize: 10, padding: '2px 7px' }}>{enemySpeciesLabel(enemy.species)}</span>
                    )}
                    {enemy.attrib != null && Number(enemy.attrib) > 0 && elementMeta[enemy.attrib] && (
                      <span className="badge" style={{ fontSize: 10, padding: '2px 7px', color: elementMeta[enemy.attrib].color, borderColor: elementMeta[enemy.attrib].color + '44' }}>
                        {elementMeta[enemy.attrib].name}
                      </span>
                    )}
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
