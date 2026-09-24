import { useGameData } from '../../contexts/GameDataContext';

export default function DashboardTab({ onTabChange }) {
  const { data } = useGameData();
  if (!data) return null;

  const statsData = data?.stats || {};
  const charCount = data.characters?.length ?? statsData.characters ?? 0;
  const buddyCount = data.buddies?.length ?? statsData.buddies ?? 0;
  const skillCount = data.skills?.length ?? statsData.skills ?? 0;
  const itemCount = data.items?.length ?? statsData.items ?? 0;
  const stageCount = data.stages?.length ?? statsData.stages ?? 0;
  const bgmCount = statsData.bgm_count ?? data.audio?.BGM?.length ?? 0;
  const seCount = statsData.se_count ?? data.audio?.SE?.length ?? 0;

  const stats = [
    { key: 'storybook', label: 'Storybook Reader', count: 'Chapters 1-42', icon: 'fa-book-open-reader', bg: 'stage-bg' },
    { key: 'characters', label: 'Characters', count: charCount, icon: 'fa-users', bg: 'char-bg' },
    { key: 'buddies', label: 'Companions', count: buddyCount, icon: 'fa-paw', bg: 'buddy-bg' },
    { key: 'skills', label: 'Skills', count: skillCount, icon: 'fa-wand-magic-sparkles', bg: 'skill-bg' },
    { key: 'items', label: 'Items', count: itemCount, icon: 'fa-gem', bg: 'item-bg' },
    { key: 'stages', label: 'Chapters & Stages', count: stageCount, icon: 'fa-map-location-dot', bg: 'stage-bg' },
    { key: 'audio', label: 'Audio Tracks', count: `${bgmCount} BGM / ${seCount} SE`, icon: 'fa-music', bg: 'audio-bg' },
    { key: 'saveEditor', label: 'Save Editor', count: 'PLG ⇄ ReTB', icon: 'fa-arrow-right-arrow-left', bg: 'save-bg' },
  ];

  return (
    <div className="tab-content">
      <div className="stats-grid">
        {stats.map(s => (
          <div key={s.key} className="stat-card" onClick={() => onTabChange(s.key)}>
            <div className={`stat-icon ${s.bg}`}>
              <i className={`fa-solid ${s.icon}`}></i>
            </div>
            <div className="stat-info">
              <h3>{s.count}</h3>
              <p>{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="welcome-box">
        <div className="welcome-text">
          <h3>Welcome to TerraTools</h3>
          <p>Browse extracted game databases including characters, companions, skills, items, stage layouts, and audio assets. Use the sidebar to navigate between data categories.</p>
        </div>
        <img src="/TerraToolbox.png" alt="Terra Toolbox" className="welcome-decoration-img" />
      </div>
    </div>
  );
}
