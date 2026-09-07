import { useState } from 'react';
import { useAudio } from '../../contexts/AudioContext';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function FloatingAudioPlayer({ activeTab, onNavigateToAudio }) {
  const {
    activeTrack,
    playlistCategory,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isMinimized,
    isFloatingOpen,
    togglePlayPause,
    seek,
    setVolume,
    toggleMute,
    stopTrack,
    toggleMinimize,
    closeFloatingPlayer,
    openFloatingPlayer,
  } = useAudio();

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const isStorybook = activeTab === 'storybook';
  const offsetClass = isStorybook ? 'storybook-offset' : '';

  if (!activeTrack) return null;

  // If user closed the floating overlay, show a small launcher pill if active track is still playing/loaded
  if (!isFloatingOpen) {
    return (
      <button 
        className={`floating-player-reopen-btn ${offsetClass}`}
        onClick={openFloatingPlayer} 
        title="Open Audio Player"
      >
        <i className={`fa-solid fa-music ${isPlaying ? 'pulse-icon' : ''}`}></i>
        <span>{activeTrack.name}</span>
      </button>
    );
  }

  // Minimized Compact Pill Mode
  if (isMinimized) {
    return (
      <div className={`floating-player-minimized ${offsetClass}`}>
        <div className={`mini-disc ${isPlaying ? 'spinning' : ''}`}>
          <i className="fa-solid fa-compact-disc"></i>
        </div>
        <div className="mini-info">
          <span className="mini-title">{activeTrack.name}</span>
          <span className="mini-time">{formatTime(currentTime)}</span>
        </div>
        <div className="mini-actions">
          <button 
            className="mini-btn play-btn" 
            onClick={togglePlayPause} 
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
          </button>
          <button 
            className="mini-btn" 
            onClick={toggleMinimize} 
            title="Expand Player"
          >
            <i className="fa-solid fa-up-right-and-down-left-from-center"></i>
          </button>
          <button 
            className="mini-btn close-btn" 
            onClick={closeFloatingPlayer} 
            title="Hide Player"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    );
  }

  // Full Expanded Floating Player Card
  return (
    <div className={`floating-player-card ${offsetClass}`}>
      {/* Header bar */}
      <div className="floating-player-header">
        <div className="floating-track-meta">
          <span className={`category-badge ${playlistCategory}`}>
            {playlistCategory.toUpperCase()}
          </span>
          <div className="floating-title-container">
            <h5 className="floating-track-title" title={activeTrack.name}>
              {activeTrack.name}
            </h5>
            <span className="floating-track-sub" title={activeTrack.filename}>
              {activeTrack.filename}
            </span>
          </div>
        </div>
        <div className="floating-header-actions">
          {activeTab !== 'audio' && (
            <button 
              className="floating-action-btn" 
              onClick={onNavigateToAudio} 
              title="Go to Audio Tab"
            >
              <i className="fa-solid fa-sliders"></i>
            </button>
          )}
          <button 
            className="floating-action-btn" 
            onClick={toggleMinimize} 
            title="Minimize"
          >
            <i className="fa-solid fa-minus"></i>
          </button>
          <button 
            className="floating-action-btn close-btn" 
            onClick={closeFloatingPlayer} 
            title="Hide Floating Player"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      {/* Visualizer and disc animation */}
      <div className="floating-player-body">
        <div className={`floating-disc-wrapper ${isPlaying ? 'playing' : ''}`}>
          <i className="fa-solid fa-compact-disc floating-disc-icon"></i>
        </div>

        <div className={`floating-visualization ${isPlaying ? 'playing' : ''}`}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bar"></div>
          ))}
        </div>
      </div>

      {/* Timeline Scrub Bar */}
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

      {/* Main Controls */}
      <div className="floating-controls-section">
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

        <div className="floating-volume-wrapper">
          <button 
            className="floating-control-btn volume-btn" 
            onClick={toggleMute}
            onMouseEnter={() => setShowVolumeSlider(true)}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <i className={`fa-solid ${isMuted || volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
          </button>
          <div 
            className={`floating-volume-slider-popover ${showVolumeSlider ? 'show' : ''}`}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={e => setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
