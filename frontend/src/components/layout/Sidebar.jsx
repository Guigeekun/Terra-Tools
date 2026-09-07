import { TAB_META, TAB_KEYS } from '../../utils/constants';

export default function Sidebar({ activeTab, onTabChange, isOpen, onClose }) {
  const handleNavClick = (key) => {
    onTabChange(key);
    if (onClose) onClose();
  };

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <img src="/TerraToolbox.png" alt="Terra Toolbox Logo" className="brand-logo" />
        <div className="brand-text">
          <h1>TerraTools</h1>
          <span>Data Visualizer</span>
        </div>
        {onClose && (
          <button 
            className="sidebar-close-btn" 
            onClick={onClose}
            aria-label="Close menu"
            title="Close Menu"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {TAB_KEYS.map(key => (
          <a
            key={key}
            href={`#${key}`}
            className={`nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); handleNavClick(key); }}
          >
            <i className={`fa-solid ${TAB_META[key].icon}`}></i>
            <span>{TAB_META[key].label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p>v6.0.0 React Visualizer</p>
      </div>
    </aside>
  );
}
