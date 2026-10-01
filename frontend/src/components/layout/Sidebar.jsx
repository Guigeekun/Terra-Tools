import { useEffect } from 'react';
import { TAB_META, TAB_KEYS, DATABASE_TAB_KEYS } from '../../utils/constants';
import { usePersistentState } from '../../hooks/usePersistentState';

// Plain hash links (no preventDefault): navigation goes through the router's
// hashchange listener, and middle-click / "open in new tab" yield a working
// deep link into that tab.
//
// The database tabs (characters → stages) stack under a collapsible section.
// The group sits where its members sit in TAB_KEYS, and expands by default;
// collapsing sticks across sessions unless you land in one of its tabs again
// (deep link or dashboard card) — the active entry must stay visible.
export default function Sidebar({ activeTab, isOpen, onClose }) {
  const [dbOpen, setDbOpen] = usePersistentState('sidebar.databaseOpen', true);
  const inDatabase = DATABASE_TAB_KEYS.includes(activeTab);

  useEffect(() => {
    if (inDatabase) setDbOpen(true);
  }, [inDatabase, setDbOpen]);

  const databaseSet = new Set(DATABASE_TAB_KEYS);
  const rows = [];
  let groupPlaced = false;
  for (const key of TAB_KEYS) {
    if (databaseSet.has(key)) {
      if (!groupPlaced) {
        rows.push({ type: 'group' });
        groupPlaced = true;
      }
      continue;
    }
    rows.push({ type: 'tab', key });
  }

  const navItem = (key, grouped = false) => (
    <a
      key={key}
      href={`#/${key}`}
      className={`nav-item ${grouped ? 'grouped' : ''} ${activeTab === key ? 'active' : ''}`}
      onClick={() => { if (onClose) onClose(); }}
    >
      <i className={`fa-solid ${TAB_META[key].icon}`}></i>
      <span>{TAB_META[key].label}</span>
    </a>
  );

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
        {rows.map(row =>
          row.type === 'tab'
            ? navItem(row.key)
            : (
              <div key="db-group" className={`nav-group ${dbOpen ? 'open' : ''}`}>
                <button
                  className={`nav-group-header ${inDatabase && !dbOpen ? 'child-active' : ''}`}
                  onClick={() => setDbOpen(!dbOpen)}
                  aria-expanded={dbOpen}
                  title={dbOpen ? 'Collapse the database section' : 'Expand the database section'}
                >
                  <i className="fa-solid fa-database"></i>
                  <span>Database</span>
                  <i className="fa-solid fa-chevron-down chevron"></i>
                </button>
                {dbOpen && (
                  <div className="nav-group-items">
                    {DATABASE_TAB_KEYS.map(key => navItem(key, true))}
                  </div>
                )}
              </div>
            )
        )}
      </nav>

      <div className="sidebar-footer">
        <p>v6.0.0 React Visualizer</p>
      </div>
    </aside>
  );
}
