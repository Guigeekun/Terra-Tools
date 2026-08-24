import { useState, useMemo } from 'react';
import { loc } from '../../utils/localization';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';

export default function SkillsTab() {
  const [search, setSearch] = useState('');
  const filters = useMemo(() => ({ search }), [search]);

  const { items: skills, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang } = usePaginatedCategory('skills', filters, 30);

  return (
    <div className="tab-content">
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search skills by name, ID, or description..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Rate</th>
              <th>Element</th>
              <th>Area</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody id="skills-table-body">
            {isInitialLoading && skills.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}><TabSpinner message="Loading skills..." /></td></tr>
            ) : skills.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No skills matched the search.</td></tr>
            ) : (
              <>
                {skills.map((skill, index) => (
                  <tr key={index}>
                    <td><code>{skill.iconNo || index}</code></td>
                    <td><strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{loc(skill.nameString, lang)}</strong></td>
                    <td>{skill.emitRatio === 0 ? <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)' }}>Equip</span> : `${skill.emitRatio || 0}%`}</td>
                    <td><span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.08)', borderColor: 'rgba(99, 102, 241, 0.2)', color: 'var(--accent-indigo)' }}>{skill.attrib || 'None'}</span></td>
                    <td><span className="badge" style={{ backgroundColor: 'rgba(236, 72, 153, 0.08)', borderColor: 'rgba(236, 72, 153, 0.2)', color: 'var(--accent-pink)' }}>{loc(skill.rangePrefixString, lang, 'Self')}</span></td>
                    <td style={{ maxWidth: 320, lineHeight: 1.4 }}>{loc(skill.descString, lang)}</td>
                  </tr>
                ))}
                <tr ref={sentinelRef}>
                  <td colSpan="6" style={{ height: 30, border: 'none', textAlign: 'center' }}>
                    {isFetchingNextPage && <div className="loading-spinner" style={{ width: 20, height: 20, margin: '0 auto', borderTopColor: 'var(--accent-blue)' }} />}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
