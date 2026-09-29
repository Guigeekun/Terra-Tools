import { TAB_META, TAB_KEYS } from '../../utils/constants';

// Plain hash links (no preventDefault): navigation goes through the router's
// hashchange listener, and middle-click / "open in new tab" yield a working
// deep link into that tab.
export default function Sidebar({ activeTab, isOpen, onClose }) {
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
            href={`#/${key}`}
            className={`nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => { if (onClose) onClose(); }}
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
