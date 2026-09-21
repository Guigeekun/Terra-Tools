import { useState } from 'react';
import { loc } from '../../utils/localization';
import { rarityShortLabels, weaponMeta, elementMeta } from '../../utils/constants';
import { useGameData } from '../../contexts/GameDataContext';
import { useLazyCategory } from '../../hooks/useLazyCategory';
import LightboxModal from './LightboxModal';

export default function CharacterModal({ character, onClose, onOpenItem, onOpenCharacter }) {
  const { lang, data } = useGameData();
  useLazyCategory('skills');
  const [jobIndex, setJobIndex] = useState(0);
  const [showRecode, setShowRecode] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  if (!character) return null;

  const jobs = character.JobsInfo || [];
  const job = jobs[jobIndex];
  const skills = data?.skills || [];

  // Species/Gender only exist on job entries, not on the character info
  const genderVal = jobs.find(j => j.Gender === 1 || j.Gender === 2)?.Gender;
  const genderStr = genderVal === 1 ? 'Male' : genderVal === 2 ? 'Female' : 'Unknown';

  const weap = job ? (weaponMeta[job.Attrib] || weaponMeta[4]) : null;
  const elem = job ? (elementMeta[job.SkillAttrib] || elementMeta[0]) : null;

  const pieceUrl = job?.piece_file ? `/api/assets/image?path=${encodeURIComponent(job.piece_file)}` : null;
  const illustUrl = job?.illust_file ? `/api/assets/image?path=${encodeURIComponent(job.illust_file)}` : null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>

          {/* Header */}
          <div className="modal-header">
            <h3>{loc(character.NameString, lang)}</h3>
            <div className="modal-char-meta">
              <span><i className="fa-solid fa-venus-mars"></i> Gender: {genderStr}</span>
              <span><i className="fa-solid fa-star"></i> Class: {rarityShortLabels[character.rarity] || character.rarity}</span>
            </div>
            {character.recode_source && (
              <button
                className="recode-source-note"
                title={`View ${loc(character.recode_source.name, lang)}`}
                onClick={() => onOpenCharacter?.(character.recode_source.ID)}
              >
                <i className="fa-solid fa-arrows-rotate"></i>
                <span>Acquired by recoding <strong>{loc(character.recode_source.name, lang)}</strong></span>
                <i className="fa-solid fa-chevron-right" style={{ fontSize: 9 }}></i>
              </button>
            )}
          </div>

          {/* Job Tabs */}
          <div className="modal-tabs">
            {jobs.map((_, i) => (
              <button key={i} className={`modal-tab-btn ${!showRecode && i === jobIndex ? 'active' : ''}`} onClick={() => { setJobIndex(i); setShowRecode(false); }}>
                Job {i + 1}
              </button>
            ))}
            {character.recode?.length > 0 && (
              <button className={`modal-tab-btn recode-tab ${showRecode ? 'active' : ''}`} onClick={() => setShowRecode(true)}>
                <i className="fa-solid fa-arrows-rotate"></i> Recode
              </button>
            )}
          </div>

          {/* Recode Tab */}
          {showRecode && character.recode?.length > 0 ? (
            <div className="recode-detail">
              {character.recode.map((option, optionIdx) => (
                <div key={optionIdx} className="job-skills-box recode-box">
                  {option.result && (
                    <button
                      className="recode-target clickable"
                      title={`View ${loc(option.result.name, lang)}`}
                      onClick={() => onOpenCharacter?.(option.result.ID)}
                    >
                      {option.result.piece_file && (
                        <img src={`/api/assets/image?path=${encodeURIComponent(option.result.piece_file)}`} alt="" className="recode-piece" />
                      )}
                      <span className="recode-arrow"><i className="fa-solid fa-arrow-right-long"></i></span>
                      <strong>{loc(option.result.name, lang)}</strong>
                      <span className="recode-open-hint"><i className="fa-solid fa-chevron-right"></i></span>
                    </button>
                  )}
                  {option.coins > 0 && (
                    <div className="stats-row">
                      <span className="stat-lbl"><i className="fa-solid fa-coins" style={{ marginRight: 6 }}></i>Coin Cost</span>
                      <span className="stat-val" style={{ color: 'var(--accent-amber)' }}>{option.coins.toLocaleString()}</span>
                    </div>
                  )}
                  {!option.coins && !(option.items || []).length && !(option.units || []).length && (
                    <p className="recode-empty">No recode materials listed in game data.</p>
                  )}
                  <ul className="job-skills-list" style={{ marginTop: 8 }}>
                    {(option.items || []).map((mat, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                        title="Click to view item details & drop locations"
                        onClick={() => { onClose(); onOpenItem(mat.item_id); }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {mat.icon_url && <img src={mat.icon_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain', imageRendering: 'pixelated', marginRight: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }} />}
                          <span>{loc(mat.name, lang)}</span>
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>x {mat.count}</span>
                      </li>
                    ))}
                  </ul>
                  {(option.units || []).length > 0 && (
                    <ul className="job-skills-list" style={{ marginTop: 8 }}>
                      {option.units.map((unit, i) => (
                        <li key={i} className="recode-unit-row" title={`View ${loc(unit.name, lang)}`}
                          onClick={() => onOpenCharacter?.(unit.ID)}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {unit.piece_file && <img src={`/api/assets/image?path=${encodeURIComponent(unit.piece_file)}`} alt="" style={{ width: 24, height: 24, objectFit: 'contain', imageRendering: 'pixelated', marginRight: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }} />}
                            <span>{loc(unit.name, lang)}</span>
                          </div>
                          <span className="badge" style={{ fontSize: 10, padding: '2px 6px', backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.2)', color: 'var(--accent-indigo)' }}>Lv {unit.level}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : job ? (
            <div className="job-detail-layout">
              {/* Left Column */}
              <div className="job-info-col">
                <div className="job-profile-box">
                  <h5>Profile</h5>
                  {weap && elem && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: weap.color + '44', color: weap.color, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 8 }}>
                        {weap.icon ? <img src={weap.icon} alt={weap.name} style={{ width: 14, height: 14, objectFit: 'contain' }} /> : weap.svg ? <span dangerouslySetInnerHTML={{__html: weap.svg}} style={{ display: 'flex', alignItems: 'center' }}></span> : null}
                        <span style={{ fontWeight: 600 }}>{weap.name}</span>
                      </span>
                      <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: elem.color + '44', color: elem.color, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 8 }}>
                        {elem.icon ? <img src={elem.icon} alt={elem.name} style={{ width: 14, height: 14, objectFit: 'contain' }} /> : elem.svg ? <span dangerouslySetInnerHTML={{__html: elem.svg}} style={{ display: 'flex', alignItems: 'center' }}></span> : null}
                        <span style={{ fontWeight: 600 }}>{elem.name}</span>
                      </span>
                    </div>
                  )}
                  <p>{loc(job.ProfileString, lang, 'Profile description not available.')}</p>
                </div>

                {/* Recruitment (chapter drops) */}
                {character.recruitment?.length > 0 && (
                  <div className="job-skills-box recruitment-box">
                    <h5><i className="fa-solid fa-map-pin" style={{ marginRight: 6 }}></i>Recruitment</h5>
                    <p className="recruitment-hint">Defeat this enemy in these stages for a chance to recruit it:</p>
                    <ul className="job-skills-list">
                      {character.recruitment.map((site, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="badge" style={{ fontSize: 10, padding: '2px 7px', backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: 'var(--accent-green)', flexShrink: 0 }}>
                            Ch {site.chapter}-{site.section}
                          </span>
                          <span style={{ fontSize: 12 }}>{site.title.replace(/^Stage\s+\S+:\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="job-assets-box">
                  <h5>Art Assets</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                    {pieceUrl && <img src={pieceUrl} alt="Piece" className="clickable-preview" onClick={() => setLightboxSrc(pieceUrl)} style={{ width: 64, borderRadius: 10, cursor: 'pointer', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }} />}
                    {illustUrl && (
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 6, display: 'flex', justifyContent: 'center' }}>
                        <img src={illustUrl} alt="Illust" className="clickable-preview" onClick={() => setLightboxSrc(illustUrl)} style={{ width: '100%', maxHeight: 220, borderRadius: 8, objectFit: 'contain', cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>
                  <div className="asset-reference-item">
                    <span className="asset-label">Piece:</span>
                    <code>{job.piece_file || 'Not Found'}</code>
                  </div>
                  <div className="asset-reference-item" style={{ marginTop: 8 }}>
                    <span className="asset-label">Illust:</span>
                    <code>{job.illust_file || 'Not Found'}</code>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="job-stats-col">
                <div className="stats-table-box">
                  <h5>Job Base Statistics</h5>
                  {[['HP', job.HP], ['ATK', job.ATK], ['DEF', job.DEF], ['MATK', job.SATK], ['MDEF', job.SDEF]].map(([label, val]) => (
                    <div key={label} className="stats-row">
                      <span className="stat-lbl">{label}</span>
                      <span className="stat-val">{val || 0}</span>
                    </div>
                  ))}
                </div>

                {/* Unlock Materials */}
                {jobIndex > 0 && ((job.unlock_coin > 0) || (job.unlock_materials?.length > 0)) && (
                  <div className="job-skills-box">
                    <h5><i className="fa-solid fa-lock-open" style={{ marginRight: 6 }}></i>Unlock Requirements</h5>
                    {job.unlock_coin > 0 && (
                      <div className="stats-row">
                        <span className="stat-lbl"><i className="fa-solid fa-coins" style={{ marginRight: 6 }}></i>Coin Cost</span>
                        <span className="stat-val" style={{ color: 'var(--accent-amber)' }}>{job.unlock_coin.toLocaleString()}</span>
                      </div>
                    )}
                    <ul className="job-skills-list" style={{ marginTop: 8 }}>
                      {(job.unlock_materials || []).map((mat, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                          title="Click to view item details & drop locations"
                          onClick={() => { onClose(); onOpenItem(mat.item_id); }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {mat.icon_url && <img src={mat.icon_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain', imageRendering: 'pixelated', marginRight: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }} />}
                            <span>{loc(mat.name, lang)}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>x {mat.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Active Skills */}
                <div className="job-skills-box">
                  <h5>Active Skills</h5>
                  <ul className="job-skills-list">
                    {!skills || skills.length === 0
                      ? <li style={{ color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Loading skills data...</li>
                      : (job.skills || []).length === 0
                      ? <li style={{ color: 'var(--text-muted)' }}>No active skills found.</li>
                      : (job.skills || []).map((skillID, i) => {
                        const unlockLv = (job.skillMasterLevel && job.skillMasterLevel[i]) || 1;
                        const skill = skills[skillID - 1];
                        return (
                          <li key={i}>
                            {skill ? (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                  <strong style={{ color: 'var(--accent-blue)' }}>{loc(skill.nameString, lang)}</strong>
                                  <span className="badge" style={{ fontSize: 10, padding: '2px 6px', backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.2)', color: 'var(--accent-blue)' }}>Lv {unlockLv}</span>
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Trigger: {skill.emitRatio === 0 ? 'Equip' : `${skill.emitRatio || 0}%`}</span>
                                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{loc(skill.descString, lang)}</p>
                              </>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Unknown Skill (ID: {skillID})</span>
                                <span className="badge" style={{ fontSize: 10, padding: '2px 6px', backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: 'var(--accent-red)' }}>Lv {unlockLv}</span>
                              </div>
                            )}
                          </li>
                        );
                      })
                    }
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Job variant details missing.</p>
          )}
        </div>
      </div>
      {lightboxSrc && <LightboxModal src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
