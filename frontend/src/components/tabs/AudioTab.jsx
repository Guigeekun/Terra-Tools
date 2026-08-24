import { useState, useMemo, useRef, useEffect } from 'react';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';

export default function AudioTab() {
  const [activePlaylist, setActivePlaylist] = useState('BGM');
  const [search, setSearch] = useState('');
  const [activeTrack, setActiveTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const filters = useMemo(() => ({ category: activePlaylist, search }), [activePlaylist, search]);

  const { items: tracks, total, isInitialLoading, isFetchingNextPage, sentinelRef } = usePaginatedCategory('audio', filters, 30);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('pause', handlePause);
    audioEl.addEventListener('ended', handleEnded);
    return () => {
      audioEl.removeEventListener('play', handlePlay);
      audioEl.removeEventListener('pause', handlePause);
      audioEl.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (activeTrack && audioRef.current) {
      audioRef.current.src = `/api/play/${activePlaylist.toLowerCase()}/${activeTrack.filename}`;
      audioRef.current.play().catch(e => console.error("Audio play error", e));
    }
  }, [activeTrack, activePlaylist]);

  return (
    <div className="tab-content audio-layout">
      <div className="player-controls-panel">
        <div className="player-card">
          <div className="player-header">
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 24, boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)' }}>
              <i className="fa-solid fa-music"></i>
            </div>
            <h4>{activeTrack ? activeTrack.name : 'No Track Selected'}</h4>
            <p>{activeTrack ? activeTrack.filename : '---'}</p>
          </div>
          <div className={`player-visualization ${isPlaying ? 'playing' : ''}`}>
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="bar"></div>)}
          </div>
          <div className="player-audio-wrapper">
            <audio ref={audioRef} controls></audio>
          </div>
        </div>
        <div className="player-info-card">
          <h5><i className="fa-solid fa-circle-info"></i> Audio Information</h5>
          <p>Background music and sound effects are streamed directly from the extracted game data.</p>
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
                  <button key={i} className={`playlist-item ${isActive ? 'active' : ''}`} onClick={() => setActiveTrack(track)}>
                    <div style={{ textAlign: 'left' }}>
                      <strong style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 14 }}>{track.name}</strong>
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
