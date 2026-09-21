import { useState, useEffect } from 'react';
import { loc, translateStageTitle, getSectionSubtitle } from '../../utils/localization';
import { useGameData } from '../../contexts/GameDataContext';
import { fetchItemDetails } from '../../api';

export default function ItemModal({ itemId, onClose }) {
  const { lang, data } = useGameData();
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (itemId) {
      fetchItemDetails(itemId).then(setDetails).catch(console.error);
    }
  }, [itemId]);

  if (!itemId || !details) return null;

  const stages = details.dropped_in_stages || [];
  const jobs = details.used_in_jobs || [];
  const rebirths = details.used_in_rebirth || [];
  const buddies = details.used_in_buddies || [];
  const hasUses = jobs.length > 0 || rebirths.length > 0 || buddies.length > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>

        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', width: 64, height: 64, flexShrink: 0 }}>
            <img src={details.icon_url} alt="" style={{ width: 48, height: 48, objectFit: 'contain', imageRendering: 'pixelated' }} onError={e => { e.target.style.display = 'none'; }} />
          </div>
          <div style={{ flexGrow: 1 }}>
            <h3 style={{ marginBottom: 4 }}>{loc(details.name, lang)}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{loc(details.desc, lang, 'No description available.')}</p>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div className="job-detail-layout" style={{ gap: 24 }}>
            {/* Left: Obtain Sources */}
            <div className="job-info-col">
              <div className="job-assets-box" style={{ marginBottom: 0, minHeight: 250 }}>
                <h5><i className="fa-solid fa-map-location-dot" style={{ marginRight: 6, color: 'var(--accent-blue)' }}></i>Where to Obtain</h5>
                <ul className="job-skills-list" style={{ maxHeight: 300, overflowY: 'auto', marginTop: 10 }}>
                  {stages.length === 0
                    ? <li style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No obtaining sources found in main stages.</li>
                    : stages.map((st, i) => (
                      <li key={i} style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                          Chapter {st.chapter_no} - Section {st.section_index}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {getSectionSubtitle(st.chapter_no, st.section_index, lang, data?.strings) || (st.subtitle && loc(st.subtitle, lang)) || translateStageTitle(st.section_title, lang, data?.strings, st.chapter_no, st.section_index)}
                        </div>
                        {st.is_section_drop && (
                          <span className="badge" style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: '#22c55e', fontSize: 10, marginTop: 4 }}>
                            Section Reward x{st.section_drop_count}
                          </span>
                        )}
                        {st.spawning_enemies?.length > 0 && (
                          <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                            {st.spawning_enemies.map((enemy, j) => (
                              <div key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                                <span><i className="fa-solid fa-skull" style={{ marginRight: 6, fontSize: 11 }}></i>{loc(enemy.enemy_name, lang, 'Unknown Enemy')}</span>
                                {enemy.rate != null && (
                                  <span style={{ color: 'var(--accent-pink)', fontWeight: 500 }}>Chance: {enemy.rate}%</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))
                  }
                </ul>
              </div>
            </div>

            {/* Right: Uses */}
            <div className="job-stats-col">
              <div className="job-skills-box" style={{ marginBottom: 0, minHeight: 250 }}>
                <h5><i className="fa-solid fa-gears" style={{ marginRight: 6, color: 'var(--accent-indigo)' }}></i>What it is Used For</h5>
                <ul className="job-skills-list" style={{ maxHeight: 300, overflowY: 'auto', marginTop: 10 }}>
                  {!hasUses
                    ? <li style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>This material is not used in job unlocks, rebirths, or companion evolutions.</li>
                    : <>
                      {jobs.map((job, i) => (
                        <li key={`j${i}`} style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                            <div>
                              <strong style={{ color: 'var(--accent-blue)' }}>{loc(job.character_name, lang)}</strong>
                              <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>&gt;</span>
                              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{loc(job.job_name, lang)}</span>
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--accent-indigo)' }}>x {job.count}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Job Unlock Requirement</div>
                        </li>
                      ))}
                      {rebirths.map((rb, i) => (
                        <li key={`r${i}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                            <div>
                              <strong style={{ color: 'var(--accent-pink)' }}>{loc(rb.src_character_name, lang, 'Unknown')}</strong>
                              <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}><i className="fa-solid fa-arrow-right-long" style={{ fontSize: 11 }}></i></span>
                              <strong style={{ color: 'var(--accent-blue)' }}>{loc(rb.dst_character_name, lang, 'Unknown')}</strong>
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--accent-indigo)' }}>x {rb.count}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Rebirth/Reconstruction Material</div>
                        </li>
                      ))}
                      {buddies.map((buddy, i) => (
                        <li key={`b${i}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                            <strong style={{ color: 'var(--accent-amber)' }}>{loc(buddy.buddy_name, lang)}</strong>
                            <span style={{ fontWeight: 600, color: 'var(--accent-indigo)' }}>x {buddy.count}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Companion (Buddy) Evolution</div>
                        </li>
                      ))}
                    </>
                  }
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
