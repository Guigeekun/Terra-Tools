import { useState, useMemo } from 'react';
import { loc, translateStageTitle } from '../../utils/localization';
import WaveBoard from '../shared/WaveBoard';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';

export default function StagesTab({ onSelectItem }) {
  const [search, setSearch] = useState('');
  const [currentChapter, setCurrentChapter] = useState(null);
  const [openLayouts, setOpenLayouts] = useState({});

  const filters = useMemo(() => ({ search }), [search]);

  const { items: stages, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang, data } = usePaginatedCategory('stages', filters, 20);
  const strings = data?.strings;

  const toggleLayout = (idx) => {
    setOpenLayouts(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getChapterName = (chapterNo) => {
    if (strings?.scenarioSet?.[chapterNo - 1]) {
      return loc(strings.scenarioSet[chapterNo - 1], lang);
    }
    return `Chapter ${chapterNo}`;
  };

  return (
    <div className="tab-content stages-layout">
      <div className="chapters-panel">
        <div className="search-input-wrapper" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search chapters..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
        <div className="chapters-list">
          {isInitialLoading && stages.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}><TabSpinner message="Loading stages..." /></div>
          ) : stages.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>No chapters match.</p>
          ) : (
            <>
              {stages.map(ch => (
                <button key={ch.chapterNo} className={`chapter-btn ${currentChapter?.chapterNo === ch.chapterNo ? 'active' : ''}`} onClick={() => setCurrentChapter(ch)}>
                  <span>{getChapterName(ch.chapterNo)}</span>
                  <span className="badge" style={{ fontSize: 9, padding: '2px 6px' }}>{ch.sections ? ch.sections.length : 0} Sect</span>
                </button>
              ))}
              <div ref={sentinelRef} style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isFetchingNextPage && <div className="loading-spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--accent-blue)' }} />}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="stages-panel">
        {!currentChapter ? (
          <div className="stages-panel-placeholder">
            <i className="fa-solid fa-map-location-dot"></i>
            <p>Select a chapter from the list to view its stages, recommended levels, item drops, and wave layouts.</p>
          </div>
        ) : (
          <div>
            <h3 style={{ marginBottom: 20 }}>{getChapterName(currentChapter.chapterNo)}</h3>
            {(!currentChapter.sections || currentChapter.sections.length === 0) ? (
              <p className="stages-panel-placeholder">No stages/sections registered in this chapter.</p>
            ) : currentChapter.sections.map((sec, idx) => {
              const dropItems = sec.itemID ? (
                <>Drop Item ID: <a href="#" style={{color: 'var(--accent-blue)', textDecoration: 'underline'}} onClick={(e) => { e.preventDefault(); onSelectItem(sec.itemID); }}>{sec.itemID}</a> ({sec.itemCount || 1})</>
              ) : 'No Item Drops';
              
              let buddiesStr = 'No Companion Drops';
              if (Array.isArray(sec.dropBuddies) && sec.dropBuddies.length) {
                const parts = sec.dropBuddies.map(b => (typeof b === 'object' && b !== null ? (b.name || b.id || JSON.stringify(b)) : String(b)));
                buddiesStr = `Companion Drops: ${parts.join(', ')}`;
              }

              const isOpen = !!openLayouts[idx];

              return (
                <div key={idx} className="stage-item-card">
                  <div className="stage-item-header">
                    <span className="stage-item-title">{translateStageTitle(sec.title, lang, strings)}</span>
                    <span className="badge badge-rarity">Stamina: {sec.rawStamina || 0}</span>
                  </div>
                  <div className="stage-meta-row" style={{ marginBottom: 12 }}>
                    <span><i className="fa-solid fa-layer-group"></i> Battles: {sec.battleCnt || 0} Waves</span>
                    <span><i className="fa-solid fa-circle-exclamation"></i> Rec. Level: {sec.assumedLevel || '-'}</span>
                    <span><i className="fa-solid fa-coins"></i> Coins: {sec.coins || 0}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
                    <span><i className="fa-solid fa-gem"></i> {dropItems}</span>
                    <span><i className="fa-solid fa-paw"></i> {buddiesStr}</span>
                  </div>
                  <div className="stage-layout-expander">
                    <button className="toggle-layout-btn" onClick={() => toggleLayout(idx)}>
                      <i className={`fa-solid ${isOpen ? 'fa-map-open' : 'fa-map'}`}></i> {isOpen ? 'Hide Wave & Grid Layouts' : 'View Wave & Grid Layouts'}
                    </button>
                    {isOpen && <WaveBoard waves={sec.waves_details} lang={lang} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
