import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchChapters } from '../../api';
import { useGameData } from '../../contexts/GameDataContext';
import { useAudio } from '../../contexts/AudioContext';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { loc } from '../../utils/localization';

export default function StorybookTab() {
  const { lang, data } = useGameData();
  const { playTrack, activeTrack, isPlaying } = useAudio();

  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Restore last read position from localStorage
  const [chapterIdx, setChapterIdx] = useState(() => {
    const saved = localStorage.getItem('tb_storybook_chapter');
    return saved ? Math.max(0, parseInt(saved, 10)) : 0;
  });

  const [sceneIdx, setSceneIdx] = useState(() => {
    const saved = localStorage.getItem('tb_storybook_scene');
    return saved ? Math.max(0, parseInt(saved, 10)) : 0;
  });

  const [autoPlay, setAutoPlay] = useState(false);

  // Fetch main story chapters (Chapters 1 to 42)
  useEffect(() => {
    fetchChapters()
      .then(res => {
        const filtered = (res || [])
          .filter(ch => {
            const m = (ch.key || '').match(/^Chapter(\d+)$/i);
            if (!m) return false;
            const num = parseInt(m[1], 10);
            return num >= 1 && num <= 42;
          })
          .sort((a, b) => (a.chapterNo || parseInt(a.key.replace(/\D/g, ''), 10)) - (b.chapterNo || parseInt(b.key.replace(/\D/g, ''), 10)));
        setChapters(filtered);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load chapters:', err);
        setLoading(false);
      });
  }, []);

  // Save current position to localStorage
  useEffect(() => {
    localStorage.setItem('tb_storybook_chapter', chapterIdx.toString());
    localStorage.setItem('tb_storybook_scene', sceneIdx.toString());
  }, [chapterIdx, sceneIdx]);

  const currentChapter = useMemo(() => {
    if (!chapters.length) return null;
    const clamped = Math.min(chapterIdx, chapters.length - 1);
    return chapters[clamped];
  }, [chapters, chapterIdx]);

  const stories = useMemo(() => {
    return currentChapter?.stories || [];
  }, [currentChapter]);

  const currentStory = useMemo(() => {
    if (!stories.length) return null;
    const clamped = Math.min(sceneIdx, stories.length - 1);
    return stories[clamped];
  }, [stories, sceneIdx]);

  // Sync background music automatically when scene changes
  useEffect(() => {
    if (!currentStory || !currentStory.bgm_url) return;

    const bgmId = currentStory.bgmID;
    const isCurrentBgmPlaying = isPlaying && (
      activeTrack?.bgmID === bgmId ||
      activeTrack?.filename === `${bgmId}.wav` ||
      activeTrack?.url === currentStory.bgm_url
    );

    if (!isCurrentBgmPlaying && currentStory.bgm_url) {
      playTrack({
        bgmID: bgmId,
        name: `BGM #${bgmId}`,
        filename: `${bgmId}.wav`,
        url: currentStory.bgm_url,
      }, 'bgm');
    }
  }, [currentStory, playTrack, isPlaying, activeTrack]);

  // Page navigation handlers
  const nextPage = useCallback(() => {
    if (!stories.length) return;
    if (sceneIdx < stories.length - 1) {
      setSceneIdx(prev => prev + 1);
    } else if (chapterIdx < chapters.length - 1) {
      setChapterIdx(prev => prev + 1);
      setSceneIdx(0);
    }
  }, [sceneIdx, stories.length, chapterIdx, chapters.length]);

  const prevPage = useCallback(() => {
    if (sceneIdx > 0) {
      setSceneIdx(prev => prev - 1);
    } else if (chapterIdx > 0) {
      const prevChIdx = chapterIdx - 1;
      const prevChStories = chapters[prevChIdx]?.stories || [];
      setChapterIdx(prevChIdx);
      setSceneIdx(Math.max(0, prevChStories.length - 1));
    }
  }, [sceneIdx, chapterIdx, chapters]);

  // Auto-play slideshow timer
  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      nextPage();
    }, 6000);
    return () => clearInterval(timer);
  }, [autoPlay, nextPage]);

  // Keyboard navigation (ArrowLeft, ArrowRight, Space)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage]);

  if (loading) {
    return (
      <div className="tab-content" style={{ padding: 60, textAlign: 'center' }}>
        <TabSpinner message="Loading Interactive Storybook (Chapters 1–42)..." />
      </div>
    );
  }

  if (!chapters.length) {
    return (
      <div className="tab-content" style={{ padding: 60, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>No story chapters found.</p>
      </div>
    );
  }

  const strings = data?.strings;
  const chapterNumber = chapterIdx + 1;
  const chapterTitle = strings?.scenarioSet?.[chapterIdx]
    ? loc(strings.scenarioSet[chapterIdx], lang)
    : (currentChapter?.title || `Chapter ${chapterNumber}`);

  const narrativeText = currentStory?.text_clean?.[lang] || currentStory?.text_clean?.en || '';
  const paragraphs = narrativeText ? narrativeText.split('\n\n').filter(p => p.trim()) : [];

  return (
    <div className="tab-content storybook-container">
      {/* Pinned Top Timeline Header */}
      <div className="storybook-timeline-header">
        <div className="storybook-timeline-title">
          <i className="fa-solid fa-timeline" style={{ color: 'var(--accent-blue)', marginRight: 8 }}></i>
          <span>Chapter Timeline (1–42)</span>
        </div>

        <div className="storybook-timeline-scroll">
          {chapters.map((ch, idx) => {
            const chNo = idx + 1;
            const isActive = idx === chapterIdx;
            return (
              <button
                key={idx}
                className={`storybook-timeline-node ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setChapterIdx(idx);
                  setSceneIdx(0);
                }}
                title={`Jump to Chapter ${chNo}`}
              >
                <span className="node-num">{chNo}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Chapter Select Dropdown */}
        <div className="storybook-chapter-select">
          <select 
            value={chapterIdx} 
            onChange={e => {
              setChapterIdx(Number(e.target.value));
              setSceneIdx(0);
            }}
          >
            {chapters.map((ch, idx) => (
              <option key={idx} value={idx}>
                Ch. {idx + 1}: {strings?.scenarioSet?.[idx] ? loc(strings.scenarioSet[idx], lang) : `Chapter ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center Reader Area */}
      <div className="storybook-reader-view">
        {/* Background Artwork Panel (Contained image + soft blur glow) */}
        <div className="storybook-artwork-panel">
          {currentStory?.bg_url ? (
            <div className="storybook-bg-wrapper">
              <img 
                src={currentStory.bg_url} 
                alt="Stage BG Ambient" 
                className="storybook-bg-ambient" 
              />
              <img 
                key={currentStory.bg_url} 
                src={currentStory.bg_url} 
                alt="Stage BG Contained" 
                className="storybook-bg-contained" 
              />
            </div>
          ) : (
            <div className="storybook-bg-placeholder">
              <i className="fa-solid fa-book-open"></i>
            </div>
          )}
        </div>

        {/* Narrative Text Panel */}
        <div className="storybook-text-panel">
          <div className="storybook-card">
            <div className="storybook-card-header">
              <div className="storybook-chapter-badge">
                <span className="ch-tag">CHAPTER {chapterNumber}</span>
                <h3 className="ch-title">{chapterTitle}</h3>
              </div>
              <div className="storybook-meta-pills">
                {currentStory?.scenarioID && (
                  <span className="meta-pill scene-id">
                    <i className="fa-solid fa-scroll" style={{ marginRight: 4 }}></i>
                    {currentStory.scenarioID}
                  </span>
                )}
                {currentStory?.bgmID > 0 && (
                  <span className="meta-pill bgm-pill">
                    <i className="fa-solid fa-music" style={{ marginRight: 4 }}></i>
                    BGM #{currentStory.bgmID}
                  </span>
                )}
              </div>
            </div>

            <div className="storybook-card-body">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => <p key={i}>{p.trim()}</p>)
              ) : (
                <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  (No narrative text for scene {sceneIdx + 1})
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pinned Bottom Navigation Bar */}
      <div className="storybook-bottom-nav">
        <button 
          className="storybook-nav-btn prev-btn" 
          onClick={prevPage} 
          disabled={chapterIdx === 0 && sceneIdx === 0}
          title="Previous Scene (Left Arrow)"
        >
          <i className="fa-solid fa-chevron-left"></i>
          <span>Previous</span>
        </button>

        <div className="storybook-scene-counter">
          <span>Scene <strong>{sceneIdx + 1}</strong> of {stories.length}</span>
          <div className="storybook-dots">
            {stories.map((_, sIdx) => (
              <span 
                key={sIdx} 
                className={`dot ${sIdx === sceneIdx ? 'active' : ''}`}
                onClick={() => setSceneIdx(sIdx)}
              />
            ))}
          </div>
        </div>

        <div className="storybook-footer-right">
          <button 
            className={`storybook-nav-btn autoplay-btn ${autoPlay ? 'active' : ''}`}
            onClick={() => setAutoPlay(prev => !prev)}
            title="Toggle Auto Slide (6s)"
          >
            <i className={`fa-solid ${autoPlay ? 'fa-pause' : 'fa-play'}`}></i>
            <span>{autoPlay ? 'Auto ON' : 'Auto Play'}</span>
          </button>

          <button 
            className="storybook-nav-btn next-btn" 
            onClick={nextPage}
            disabled={chapterIdx === chapters.length - 1 && sceneIdx === stories.length - 1}
            title="Next Scene (Right Arrow / Space)"
          >
            <span>Next</span>
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
