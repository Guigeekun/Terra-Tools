import { useState, useMemo } from 'react';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';
import { useAudio } from '../../contexts/AudioContext';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function AudioTab() {
  const [activePlaylist, setActivePlaylist] = useState('BGM');
  const [search, setSearch] = useState('');

  const {
    activeTrack,
    isPlaying,
    currentTime,
    duration,
    playTrack,
    togglePlayPause,
    seek,
    stopTrack,
  } = useAudio();

  const filters = useMemo(() => ({ category: activePlaylist, search }), [activePlaylist, search]);

  const { items: tracks, isInitialLoading, isFetchingNextPage, sentinelRef } = usePaginatedCategory('audio', filters, 30);

  return (
    <div className="tab-content audio-layout">
      <div className="player-controls-panel">
        <div className="player-card">
          <div className="player-header">
            <div 
              style={{ 
                width: 64, 
                height: 64, 
                borderRadius: '50%', 
                background: 'var(--gradient-primary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto', 
                fontSize: 24, 
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)' 
              }}
            >
              <i className={`fa-solid fa-music ${isPlaying ? 'fa-beat' : ''}`}></i>
            </div>
            <h4>{activeTrack ? activeTrack.name : 'No Track Selected'}</h4>
            <p>{activeTrack ? activeTrack.filename : '---'}</p>
          </div>
          <div className={`player-visualization ${isPlaying ? 'playing' : ''}`}>
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="bar"></div>)}
          </div>

          {/* Interactive Player Controls */}
          {activeTrack ? (
            <div className="tab-player-controls" style={{ marginTop: 20 }}>
              <div className="floating-timeline-section">
                <input
                  type="range"
                  className="floating-scrub-bar"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={e => seek(Number(e.target.value))}
                />
                <div className="floating-time-display">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
                <button 
                  className="floating-control-btn stop-btn" 
                  onClick={stopTrack} 
                  title="Stop Track"
                >
                  <i className="fa-solid fa-square"></i>
                </button>
                <button 
                  className="floating-control-btn play-pause-btn" 
                  onClick={togglePlayPause}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Select a track from the playlist to start continuous playback.</p>
          )}
        </div>
        <div className="player-info-card">
          <h5><i className="fa-solid fa-circle-info"></i> App-Wide Audio</h5>
          <p>Music will continue playing seamlessly across tabs. Use the floating player widget to control audio from anywhere.</p>
        </div>
      </div>

      <div className="playlist-panel">
        <div className="playlist-tabs">
          <button className={`playlist-tab-btn ${activePlaylist === 'BGM' ? 'active' : ''}`} onClick={() => setActivePlaylist('BGM')}>Background Music</button>
          <button className={`playlist-tab-btn ${activePlaylist === 'SE' ? 'active' : ''}`} onClick={() => setActivePlaylist('SE')}>Sound Effects</button>
        </div>
        <div className="playlist-search">
          <div className="search-input-wrapper">
            <i className="fa-solid fa-search"></i>
            <input placeholder="Search audio tracks..." value={search} onChange={e => setSearch(e.target.value)} />
            {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
          </div>
        </div>
        <div className="playlist-items">
          {isInitialLoading && tracks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}><TabSpinner message="Scanning audio..." /></div>
          ) : tracks.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No audio assets found.</p>
          ) : (
            <>
              {tracks.map((track, i) => {
                const sizeMb = (track.size_bytes / (1024 * 1024)).toFixed(2);
                const isActive = activeTrack?.filename === track.filename;
                return (
                  <button 
                    key={i} 
                    className={`playlist-item ${isActive ? 'active' : ''}`} 
                    onClick={() => playTrack(track, activePlaylist)}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <strong style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 14 }}>
                        {isActive && <i className="fa-solid fa-volume-high" style={{ marginRight: 8, color: 'var(--accent-blue)' }}></i>}
                        {track.name}
                      </strong>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{track.filename}</span>
                    </div>
                    <span className="audio-duration">{sizeMb} MB</span>
                  </button>
                );
              })}
              <div ref={sentinelRef} style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isFetchingNextPage && <div className="loading-spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--accent-blue)' }} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
