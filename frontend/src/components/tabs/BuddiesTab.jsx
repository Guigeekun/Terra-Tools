import { useState, useMemo } from 'react';
import { loc } from '../../utils/localization';
import { rarityLabels } from '../../utils/constants';
import { TabSpinner, useLazyCategory } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';

export default function BuddiesTab() {
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState('');
  const [selectedBuddy, setSelectedBuddy] = useState(null);

  useLazyCategory('skills');

  const filters = useMemo(() => ({ search, rarity }), [search, rarity]);

  const { items: buddies, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang, data } = usePaginatedCategory('buddies', filters, 35);

  return (
    <div className="tab-content">
      {selectedBuddy && (
        <div className="modal-backdrop" onClick={() => setSelectedBuddy(null)}>
          <div className="modal-card" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedBuddy(null)}>
              <i className="fa-solid fa-xmark"></i>
            </button>

            <div className="modal-header" style={{ display: 'flex', gap: 16, marginBottom: 16, borderBottom: 'none', paddingBottom: 0 }}>
              {selectedBuddy.thumb_file && <img src={`/api/assets/image?path=${encodeURIComponent(selectedBuddy.thumb_file)}`} alt="Thumb" style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' }} />}
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 20 }}>{loc(selectedBuddy.NameString, lang)}</h3>
                <span className="card-badge badge-rarity">{rarityLabels[selectedBuddy.rarity] || 'Class ' + selectedBuddy.rarity}</span>
              </div>
            </div>

            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, maxHeight: 100, overflowY: 'auto' }}>{loc(selectedBuddy.DescString, lang)}</p>

            {selectedBuddy.skill && (
              data?.skills?.[selectedBuddy.skill - 1] ? (() => {
                const selectedSkill = data.skills[selectedBuddy.skill - 1];
                return (
                  <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--accent-indigo)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fa-solid fa-star"></i> Companion Skill
                    </h4>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{loc(selectedSkill.nameString, lang)}</h5>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>{loc(selectedSkill.descString, lang)}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Activation Rate:</span> {selectedSkill.emitRatio === 0 ? 'Equip' : `${selectedSkill.emitRatio}%`}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Element:</span> {selectedSkill.attrib || 'None'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Area:</span> {loc(selectedSkill.rangePrefixString, lang, 'Self')}</div>
                      {(selectedSkill.power > 0 || selectedSkill.spower > 0) && (
                        <div><span style={{ color: 'var(--text-muted)' }}>Power:</span> {selectedSkill.power > 0 ? selectedSkill.power : selectedSkill.spower}</div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid rgba(99, 102, 241, 0.2)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }}></i> Loading companion skill details...
                </div>
              )
            )}

            <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, marginBottom: selectedBuddy.evolveID ? 20 : 0 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--text-secondary)' }}>Max Level Stats (Lv {selectedBuddy.MaxLevel})</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                <div><i className="fa-solid fa-bolt" style={{ width: 20, color: 'var(--text-secondary)' }}></i> ATK: {selectedBuddy.ATKmax || 0}</div>
                <div><i className="fa-solid fa-shield" style={{ width: 20, color: 'var(--text-secondary)' }}></i> DEF: {selectedBuddy.DEFmax || 0}</div>
                <div><i className="fa-solid fa-fire" style={{ width: 20, color: 'var(--text-secondary)' }}></i> MATK: {selectedBuddy.SATKmax || 0}</div>
                <div><i className="fa-solid fa-star" style={{ width: 20, color: 'var(--text-secondary)' }}></i> MDEF: {selectedBuddy.SDEFmax || 0}</div>
              </div>
            </div>

            {selectedBuddy.evolveID > 0 && buddies.find(b => b.ID === selectedBuddy.evolveID) && (
              <div style={{ padding: 12, border: '1px solid var(--border-color)', borderRadius: 8 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--text-secondary)' }}>Evolves Into</h4>
                <a href="#" onClick={(e) => { e.preventDefault(); setSelectedBuddy(buddies.find(b => b.ID === selectedBuddy.evolveID)); }} style={{ color: 'var(--accent-blue)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-arrow-right"></i> {loc(buddies.find(b => b.ID === selectedBuddy.evolveID).NameString, lang)}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
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
            <TabSpinner message="Loading companions..." />
          </div>
        ) : buddies.length === 0 ? (
          <p className="stages-panel-placeholder" style={{ gridColumn: '1/-1' }}>No companions match the selected filters.</p>
        ) : (
          <>
            {buddies.map(buddy => {
              const thumbUrl = buddy.thumb_file ? `/api/assets/image?path=${encodeURIComponent(buddy.thumb_file)}` : null;
              return (
                <div key={buddy.ID} className="card-item" onClick={() => setSelectedBuddy(buddy)} style={{ cursor: 'pointer' }}>
                  <span className="card-badge badge-rarity">{rarityLabels[buddy.rarity] || 'Class ' + buddy.rarity}</span>
                  {thumbUrl ? (
                    <div className="card-image" style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                      <img src={thumbUrl} alt="Companion" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                      <span style={{ color: 'var(--accent-indigo)' }}>
                        <i className="fa-solid fa-star"></i> {loc(data.skills[buddy.skill - 1].nameString, lang)} ({data.skills[buddy.skill - 1].emitRatio === 0 ? 'Equip' : `${data.skills[buddy.skill - 1].emitRatio}%`})
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
