import { TAB_META, TAB_KEYS } from '../../utils/constants';

export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <img src="/TerraToolbox.png" alt="Terra Toolbox Logo" className="brand-logo" />
        <div className="brand-text">
          <h1>Terra Battle</h1>
          <span>Data Visualizer</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {TAB_KEYS.map(key => (
          <a
            key={key}
            href={`#${key}`}
            className={`nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); onTabChange(key); }}
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
