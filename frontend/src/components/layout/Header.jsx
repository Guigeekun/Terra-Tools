import { TAB_META } from '../../utils/constants';
import { useGameData } from '../../contexts/GameDataContext';

export default function Header({ activeTab }) {
  const { lang, setLang } = useGameData();
  const meta = TAB_META[activeTab] || {};

  return (
    <header className="main-header">
      <div className="header-title">
        <h2>{meta.title || 'TerraTools'}</h2>
        <p>{meta.desc || ''}</p>
      </div>
      <div className="header-actions">
        <div className="lang-selector">
          <i className="fa-solid fa-globe"></i>
          <select value={lang} onChange={e => setLang(e.target.value)}>
            <option value="en">English (EN)</option>
            <option value="ja">日本語 (JA)</option>
            <option value="fr">Français (FR)</option>
            <option value="de">Deutsch (DE)</option>
            <option value="es">Español (ES)</option>
            <option value="zh_tw">繁體中文 (ZH_TW)</option>
          </select>
        </div>
      </div>
    </header>
  );
}
