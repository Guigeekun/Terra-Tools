import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

const AudioContext = createContext(null);

export function AudioProvider({ children }) {
  const [activeTrack, setActiveTrack] = useState(null);
  const [playlistCategory, setPlaylistCategory] = useState('bgm'); // 'bgm' or 'se'
  const [isPlaying, setIsPlaying] = useState(false);
  // False while activeTrack is metadata-only (shown in the player but never
  // downloaded); true once an <audio src> has actually been set for it.
  const [isTrackLoaded, setIsTrackLoaded] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const userPausedRef = useRef(false);

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

  // Actually set <audio src> and play. Only ever called from a user action:
  // BGM WAVs are ~20 MB each and egress is billed per GB.
  const startTrack = useCallback((track, category = 'bgm') => {
    if (!audioRef.current || !track) return;

    const catLower = (category || 'bgm').toLowerCase();
    const src = track.url || `/api/play/${catLower}/${track.filename}`;

    userPausedRef.current = false;
    setUserPaused(false);
    setIsTrackLoaded(true);

    audioRef.current.loop = (catLower === 'bgm');
    audioRef.current.src = src;
    audioRef.current.play().then(() => {
      setIsPlaying(true);
    }).catch(e => console.error('Audio play error:', e));
  }, []);

  // Explicit user action: set the track and start playing it right away.
  const playTrack = useCallback((track, category = 'bgm') => {
    if (!track) return;

    const catLower = (category || 'bgm').toLowerCase();
    setActiveTrack({ ...track, category: catLower });
    setPlaylistCategory(catLower);
    setIsFloatingOpen(true);

    startTrack(track, catLower);
  }, [startTrack]);

  // Show a track in the player without downloading it. Used by the storybook
  // to keep the corner player pointing at the current scene's BGM; audio
  // loads only when the user presses play.
  const queueTrack = useCallback((track, category = 'bgm') => {
    if (!track) return;

    const catLower = (category || 'bgm').toLowerCase();
    setActiveTrack({ ...track, category: catLower });
    setPlaylistCategory(catLower);
    setIsPlaying(false);
    setUserPaused(false);
    userPausedRef.current = false;
    setIsTrackLoaded(false);
    setCurrentTime(0);
    setDuration(0);

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !activeTrack) return;

    if (isPlaying) {
      // User explicitly paused: remember this so nothing auto-resumes
      userPausedRef.current = true;
      setUserPaused(true);
      audioRef.current.pause();
      setIsPlaying(false);
    } else if (!isTrackLoaded) {
      // Metadata-only track: pressing play is what starts the download
      startTrack(activeTrack, activeTrack.category);
    } else {
      // User explicitly resumed
      userPausedRef.current = false;
      setUserPaused(false);
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(e => console.error('Audio play error:', e));
    }
  }, [isPlaying, activeTrack, isTrackLoaded, startTrack]);

  const seek = useCallback((timeInSeconds) => {
    if (audioRef.current && isTrackLoaded) {
      audioRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
    }
  }, [isTrackLoaded]);

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
    userPausedRef.current = true;
    setUserPaused(true);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsTrackLoaded(false);
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
        userPaused,
        currentTime,
        duration,
        volume,
        isMuted,
        isMinimized,
        isFloatingOpen,
        playTrack,
        queueTrack,
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
