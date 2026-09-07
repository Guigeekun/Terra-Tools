import { useState, useMemo } from 'react';
import { loc, translateStageTitle } from '../../utils/localization';
import WaveBoard from '../shared/WaveBoard';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';
import { useAudio } from '../../contexts/AudioContext';

export default function StagesTab({ onSelectItem, onSelectBuddy }) {
  const [search, setSearch] = useState('');
  const [currentChapter, setCurrentChapter] = useState(null);
  const [openSections, setOpenSections] = useState({});

  // Media preview modal
  const [previewBg, setPreviewBg] = useState(null); // { bgID, bgUrl }

  const { activeTrack, isPlaying, playTrack, togglePlayPause } = useAudio();

  const filters = useMemo(() => ({ search }), [search]);

  const { items: stages, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang, data } = usePaginatedCategory('stages', filters, 20);
  const strings = data?.strings;

  const toggleSection = (idx) => {
    setOpenSections(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  /** Best display name for a chapter: prefer API-resolved display_name, fall back to scenarioSet, then "Chapter N". */
  const getChapterName = (ch) => {
    if (!ch) return '';
    const chapterNo = ch.chapterNo;
    if (lang === 'ja') {
      if (ch.sections?.[0]?.title) return ch.sections[0].title;
      if (strings?.scenarioSet?.[chapterNo - 1]?.ja) return strings.scenarioSet[chapterNo - 1].ja;
    }
    if (ch.display_name) return ch.display_name;
    if (chapterNo >= 1 && chapterNo <= 42 && strings?.scenarioSet?.[chapterNo - 1]) {
      return loc(strings.scenarioSet[chapterNo - 1], lang);
    }
    return `Chapter ${chapterNo}`;
  };


  const isBgmPlaying = (bgmID) => {
    if (!isPlaying || !activeTrack || !bgmID) return false;
    return (
      activeTrack.bgmID === bgmID ||
      activeTrack.filename === `${bgmID}.wav` ||
      activeTrack.filename === `${bgmID}` ||
      activeTrack.name === `BGM #${bgmID}`
    );
  };

  const handleToggleBgm = (bgmID, bgmUrl) => {
    if (!bgmID) return;
    if (!bgmUrl) {
      bgmUrl = `/api/play/BGM/${bgmID}.wav`;
    }

    if (isBgmPlaying(bgmID)) {
      togglePlayPause();
    } else {
      playTrack({
        bgmID,
        name: `BGM #${bgmID}`,
        filename: `${bgmID}.wav`,
        url: bgmUrl,
      }, 'bgm');
    }
  };

  const handleOpenBg = (bgID, bgUrl) => {
    if (!bgUrl && bgID) {
      bgUrl = `/api/bg/${bgID}`;
    }
    if (bgUrl) {
      setPreviewBg({ bgID, bgUrl });
    }
  };

  return (
    <div className={`tab-content stages-layout ${currentChapter ? 'has-active-chapter' : ''}`}>
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
                <button
                  key={ch.chapterNo}
                  className={`chapter-btn ${currentChapter?.chapterNo === ch.chapterNo ? 'active' : ''} ${ch.banner_url ? 'has-banner' : ''}`}
                  onClick={() => setCurrentChapter(ch)}
                >
                  {ch.banner_url && (
                    <div
                      className="chapter-btn-bg"
                      style={{ backgroundImage: `url(${ch.banner_url})` }}
                    />
                  )}
                  <span className="chapter-btn-title">{getChapterName(ch)}</span>
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
            <p>Select a chapter from the list to view its stages, recommended levels, item drops, wave layouts, and story narrative.</p>
          </div>
        ) : (
          <div>
            <button 
              className="stages-mobile-back-btn" 
              onClick={() => setCurrentChapter(null)}
              title="Return to Chapter List"
            >
              <i className="fa-solid fa-arrow-left"></i>
              <span>Back to Chapters</span>
            </button>

            {currentChapter.banner_url && (
              <div className="chapter-banner-hero">
                <img
                  src={currentChapter.banner_url}
                  alt={getChapterName(currentChapter)}
                  className="chapter-banner-img"
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                />
              </div>
            )}

            <h3 style={{ marginBottom: 20 }}>{getChapterName(currentChapter)}</h3>

            {(!currentChapter.sections || currentChapter.sections.length === 0) ? (
              <p className="stages-panel-placeholder">No stages/sections registered in this chapter.</p>
            ) : currentChapter.sections.map((sec, idx) => {
              const dropItems = sec.itemID ? (
                <>Drop Item ID: <a href="#" style={{color: 'var(--accent-blue)', textDecoration: 'underline'}} onClick={(e) => { e.preventDefault(); onSelectItem(sec.itemID); }}>{sec.itemID}</a> ({sec.itemCount || 1})</>
              ) : 'No Item Drops';

              let buddiesDisplay = 'No Companion Drops';
              if (Array.isArray(sec.dropBuddies) && sec.dropBuddies.length) {
                buddiesDisplay = (
                  <>
                    Companion Drops:{' '}
                    {sec.dropBuddies.map((b, bIdx) => {
                      const bId = typeof b === 'object' && b !== null ? (b.id || b.ID) : b;
                      const bName = typeof b === 'object' && b !== null
                        ? (loc(b.NameString || b.name, lang) || `Companion #${bId}`)
                        : `Companion #${bId}`;
                      return (
                        <span key={bIdx}>
                          {bIdx > 0 && ', '}
                          {bId ? (
                            <a
                              href="#"
                              style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}
                              onClick={(e) => {
                                e.preventDefault();
                                if (onSelectBuddy) onSelectBuddy(b);
                              }}
                            >
                              {bName}
                            </a>
                          ) : (
                            bName
                          )}
                          {b.count > 1 ? ` (x${b.count})` : ''}
                        </span>
                      );
                    })}
                  </>
                );
              }

              const isOpen = !!openSections[idx];
              const sequence = sec.sequence || [];
              const waveItems = sequence.filter(i => i.type === 'wave');
              const storyItems = sequence.filter(i => i.type === 'story');
              const hasRandomWaves = waveItems.some(w => w.random_layout);
              const randomReason = hasRandomWaves ? waveItems.find(w => w.random_layout)?.random_layout_reason : null;
              // Info text from BattleData (level range, tips, etc.)
              const infoText = sec.info ? (sec.info[lang] || sec.info.en || '') : '';

              return (
                <div key={idx} className="stage-item-card">
                  {sec.banner_url && (
                    <div className="stage-section-banner">
                      <img
                        src={sec.banner_url}
                        alt={translateStageTitle(sec, lang, strings, currentChapter.chapterNo, idx + 1)}
                        className="stage-section-banner-img"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="stage-item-header">
                    <span className="stage-item-title">{translateStageTitle(sec, lang, strings, currentChapter.chapterNo, idx + 1)}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {hasRandomWaves && (
                        <span className="badge" style={{ background: 'rgba(234,179,8,0.15)', color: '#fde68a', border: '1px solid rgba(234,179,8,0.35)', fontSize: 9, padding: '2px 7px' }}>
                          <i className="fa-solid fa-shuffle" style={{ marginRight: 3 }}></i>Random
                        </span>
                      )}
                      {storyItems.length > 0 && (
                        <span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)', fontSize: 9, padding: '2px 7px' }}>
                          <i className="fa-solid fa-book" style={{ marginRight: 3 }}></i>{storyItems.length}
                        </span>
                      )}
                      <span className="badge badge-rarity">Stamina: {sec.rawStamina || 0}</span>
                    </div>
                  </div>
                  <div className="stage-meta-row" style={{ marginBottom: 12 }}>
                    <span><i className="fa-solid fa-layer-group"></i> Battles: {sec.battleCnt || waveItems.length} Waves</span>
                    <span><i className="fa-solid fa-circle-exclamation"></i> Rec. Level: {sec.assumedLevel || '-'}</span>
                    <span><i className="fa-solid fa-coins"></i> Coins: {sec.coins || 0}</span>
                  </div>

                  {/* Section info text (level range, tips, vulnerability hints, etc.) */}
                  {infoText && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.18)', borderRadius: 6, padding: '7px 10px', marginBottom: 10, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      <i className="fa-solid fa-circle-info" style={{ marginRight: 5, color: 'var(--accent-blue)', opacity: 0.8 }}></i>
                      {infoText}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
                    <span><i className="fa-solid fa-gem"></i> {dropItems}</span>
                    <span><i className="fa-solid fa-paw"></i> {buddiesDisplay}</span>
                  </div>

                  {sequence.length > 0 && (
                    <div className="stage-layout-expander">
                      <button className="toggle-layout-btn" onClick={() => toggleSection(idx)}>
                        <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                        {isOpen ? 'Hide Section Details' : `View Section Details`}
                        <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>
                          ({storyItems.length} {storyItems.length === 1 ? 'scene' : 'scenes'} · {waveItems.length} {waveItems.length === 1 ? 'wave' : 'waves'}{hasRandomWaves ? ' · random' : ''})
                        </span>
                      </button>
                      {isOpen && (
                        <SectionSequenceView
                          sequence={sequence}
                          lang={lang}
                          onOpenBg={handleOpenBg}
                          onToggleBgm={handleToggleBgm}
                          isBgmPlaying={isBgmPlaying}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* ── Background Image Preview Modal ── */}
      {previewBg && (
        <div className="modal-backdrop" onClick={() => setPreviewBg(null)}>
          <div className="modal-card" style={{ maxWidth: 720, padding: 24, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setPreviewBg(null)}>
              <i className="fa-solid fa-xmark"></i>
            </button>
            <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <i className="fa-solid fa-image" style={{ color: 'var(--accent-blue)' }}></i>
              Stage Background #{previewBg.bgID}
            </h4>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
              <img src={previewBg.bgUrl} alt={`BG ${previewBg.bgID}`} style={{ width: '100%', display: 'block', maxHeight: '70vh', objectFit: 'contain', background: '#0a0d16' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section Sequence View ─────────────────────────────────────────────────────

function SectionSequenceView({ sequence, lang, onOpenBg, onToggleBgm, isBgmPlaying }) {
  const [activeWaveIdx, setActiveWaveIdx] = useState(null);

  const waves = sequence.filter(i => i.type === 'wave');

  return (
    <div className="section-sequence">
      {sequence.map((item, i) => {
        if (item.type === 'story') {
          return (
            <StorySceneInline
              key={i}
              story={item}
              lang={lang}
              onOpenBg={onOpenBg}
              onToggleBgm={onToggleBgm}
              isBgmPlaying={isBgmPlaying}
            />
          );
        }

        // Wave item
        const wavePos = waves.indexOf(item);
        const isActive = activeWaveIdx === wavePos;
        const isPlayingThisBgm = isBgmPlaying(item.bgmID);
        const isRandom = !!item.random_layout;
        const possibleEnemies = item.possible_enemies || [];

        return (
          <div key={i} className="sequence-wave-block">
            <div className={`sequence-wave-header ${isActive ? 'active' : ''}`}>
              <div
                className="sequence-wave-left"
                onClick={() => setActiveWaveIdx(isActive ? null : wavePos)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              >
                <span className="sequence-wave-label">
                  <i className={`fa-solid ${isRandom ? 'fa-shuffle' : 'fa-swords'}`} style={{ marginRight: 6 }}></i>
                  Wave {item.wave_index}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {isRandom
                    ? `${possibleEnemies.length} possible enemies`
                    : `${item.enemies?.length || 0} ${item.enemies?.length === 1 ? 'enemy' : 'enemies'}`}
                </span>
              </div>

              {/* Media Badges for Wave */}
              <div className="story-scene-meta" style={{ marginRight: 8 }}>
                {item.bgID > 0 && (
                  <button
                    className="story-meta-badge media-badge-btn"
                    onClick={(e) => { e.stopPropagation(); onOpenBg(item.bgID, item.bg_url); }}
                    title="Click to view stage background image"
                  >
                    <i className="fa-solid fa-image" style={{ marginRight: 3 }}></i>BG {item.bgID}
                  </button>
                )}
                {item.bgmID > 0 && (
                  <button
                    className={`story-meta-badge media-badge-btn ${isPlayingThisBgm ? 'bgm-playing' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleBgm(item.bgmID, item.bgm_url); }}
                    title={isPlayingThisBgm ? "Click to stop BGM" : "Click to play BGM"}
                  >
                    <i className={`fa-solid ${isPlayingThisBgm ? 'fa-volume-high fa-pulse' : 'fa-music'}`} style={{ marginRight: 3 }}></i>
                    BGM {item.bgmID}
                  </button>
                )}
              </div>

              <i
                className={`fa-solid ${isActive ? 'fa-chevron-up' : 'fa-chevron-down'}`}
                onClick={() => setActiveWaveIdx(isActive ? null : wavePos)}
                style={{ fontSize: 11, opacity: 0.5, cursor: 'pointer' }}
              ></i>
            </div>
            {isActive && (
              isRandom
                ? <RandomLayoutPanel reason={item.random_layout_reason} possibleEnemies={possibleEnemies} lang={lang} />
                : <WaveBoard waves={[item]} lang={lang} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Random Layout Panel ────────────────────────────────────────────────────────

function RandomLayoutPanel({ reason, possibleEnemies, lang }) {
  return (
    <div style={{ padding: '12px 14px' }}>
      {/* Random layout notice */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
        borderRadius: 8, padding: '10px 14px', marginBottom: possibleEnemies.length ? 14 : 0,
        fontSize: 12, color: '#fde68a', lineHeight: 1.5
      }}>
        <i className="fa-solid fa-shuffle" style={{ marginTop: 2, flexShrink: 0 }}></i>
        <div>
          <strong style={{ display: 'block', marginBottom: 3 }}>Layout is randomized</strong>
          <span style={{ opacity: 0.85 }}>{reason || 'Enemy placement is procedurally generated at runtime — positions and specific foes will vary each run.'}</span>
        </div>
      </div>

      {/* Possible enemy pool */}
      {possibleEnemies.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <i className="fa-solid fa-list" style={{ marginRight: 5 }}></i>
            Possible Enemies ({possibleEnemies.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {possibleEnemies.map((enemy, i) => {
              const name = enemy.NameString
                ? (enemy.NameString[lang] || enemy.NameString.en || enemy.NameString.ja || enemy.enemy_var)
                : enemy.enemy_var;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
                  borderRadius: 6, padding: '5px 9px', fontSize: 11
                }}>
                  <i className="fa-solid fa-skull" style={{ fontSize: 9, opacity: 0.5, flexShrink: 0 }}></i>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    {enemy.LV != null && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Lv. {enemy.LV}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No pool available */}
      {possibleEnemies.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', margin: '10px 0 0' }}>
          Enemy pool data not yet available for this stage type.
        </p>
      )}
    </div>
  );
}

function StorySceneInline({ story, lang, onOpenBg, onToggleBgm, isBgmPlaying }) {
  const text = story.text_clean?.[lang] || story.text_clean?.en || '';
  const isPlayingThisBgm = isBgmPlaying(story.bgmID);

  if (!text) {
    return (
      <div className="sequence-story-block sequence-story-empty">
        <i className="fa-solid fa-scroll" style={{ marginRight: 6, opacity: 0.5 }}></i>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', flex: 1 }}>
          Scene {story.scenarioID && <code style={{ fontSize: 10 }}>{story.scenarioID}</code>}
        </span>
        <div className="story-scene-meta">
          {story.bgID > 0 && (
            <button className="story-meta-badge media-badge-btn" onClick={() => onOpenBg(story.bgID, story.bg_url)}>
              <i className="fa-solid fa-image" style={{ marginRight: 3 }}></i>BG {story.bgID}
            </button>
          )}
          {story.bgmID > 0 && (
            <button className={`story-meta-badge media-badge-btn ${isPlayingThisBgm ? 'bgm-playing' : ''}`} onClick={() => onToggleBgm(story.bgmID, story.bgm_url)}>
              <i className={`fa-solid ${isPlayingThisBgm ? 'fa-volume-high fa-pulse' : 'fa-music'}`} style={{ marginRight: 3 }}></i>BGM {story.bgmID}
            </button>
          )}
        </div>
      </div>
    );
  }

  const paragraphs = text.split('\n\n').filter(p => p.trim());

  return (
    <div className="sequence-story-block">
      <div className="sequence-story-header">
        <span className="sequence-story-id">
          <i className="fa-solid fa-scroll" style={{ marginRight: 5 }}></i>
          {story.scenarioID && <code style={{ fontSize: 10, opacity: 0.5, fontFamily: 'monospace', marginLeft: 4 }}>{story.scenarioID}</code>}
        </span>
        <div className="story-scene-meta">
          {story.bgID > 0 && (
            <button className="story-meta-badge media-badge-btn" onClick={() => onOpenBg(story.bgID, story.bg_url)}>
              <i className="fa-solid fa-image" style={{ marginRight: 3 }}></i>BG {story.bgID}
            </button>
          )}
          {story.bgmID > 0 && (
            <button className={`story-meta-badge media-badge-btn ${isPlayingThisBgm ? 'bgm-playing' : ''}`} onClick={() => onToggleBgm(story.bgmID, story.bgm_url)}>
              <i className={`fa-solid ${isPlayingThisBgm ? 'fa-volume-high fa-pulse' : 'fa-music'}`} style={{ marginRight: 3 }}></i>BGM {story.bgmID}
            </button>
          )}
        </div>
      </div>
      <div className="sequence-story-text">
        {paragraphs.map((para, pi) => (
          <p key={pi}>{para.trim()}</p>
        ))}
      </div>
    </div>
  );
}
