import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

const AudioContext = createContext(null);

export function AudioProvider({ children }) {
  const [activeTrack, setActiveTrack] = useState(null);
  const [playlistCategory, setPlaylistCategory] = useState('bgm'); // 'bgm' or 'se'
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFloatingOpen, setIsFloatingOpen] = useState(true);

  const audioRef = useRef(null);

  // Sync volume & muted state with audioRef
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Audio element event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const playTrack = useCallback((track, category = 'bgm') => {
    if (!track) return;

    const catLower = (category || 'bgm').toLowerCase();
    const src = track.url || `/api/play/${catLower}/${track.filename}`;

    setActiveTrack({ ...track, category: catLower });
    setPlaylistCategory(catLower);
    setIsFloatingOpen(true);
    setIsMinimized(false);

    if (audioRef.current) {
      audioRef.current.src = src;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(e => console.error('Audio play error:', e));
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !activeTrack) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error('Audio play error:', e));
    }
  }, [isPlaying, activeTrack]);

  const seek = useCallback((timeInSeconds) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
    }
  }, []);

  const setVolume = useCallback((val) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const stopTrack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setActiveTrack(null);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  const closeFloatingPlayer = useCallback(() => {
    setIsFloatingOpen(false);
  }, []);

  const openFloatingPlayer = useCallback(() => {
    setIsFloatingOpen(true);
  }, []);

  return (
    <AudioContext.Provider
      value={{
        activeTrack,
        playlistCategory,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        isMinimized,
        isFloatingOpen,
        playTrack,
        togglePlayPause,
        seek,
        setVolume,
        toggleMute,
        stopTrack,
        toggleMinimize,
        closeFloatingPlayer,
        openFloatingPlayer,
        setIsFloatingOpen,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
      />
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within an AudioProvider');
  return ctx;
}
