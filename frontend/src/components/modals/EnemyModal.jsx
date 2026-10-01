import { useState } from 'react';
import { loc, translateStageTitle } from '../../utils/localization';
import { elementMeta, enemySpeciesLabel, isBossEnemy, rarityShortLabels, triggerText } from '../../utils/constants';
import { useGameData } from '../../contexts/GameDataContext';
import { useLazyCategory } from '../../hooks/useLazyCategory';
import LightboxModal from './LightboxModal';
import SkillIcon from '../shared/SkillIcon';
import EmitConditionBadge from '../shared/EmitConditionBadge';

// One bestiary modal per foe name; the tabs walk its EnemyData variants
// (per-level/per-chapter records with their own stats, skills, loot and
// occurrences — e.g. 28 'Metal Orbling Mage' records).
//
// Cross-links (item / companion / character) are pushed with the `enemy`
// param removed by the caller: two full-size modals would overlap, and Back
// must return from e.g. the item modal to this one.
export default function EnemyModal({ enemy, onClose, onOpenItem, onOpenSkill, onOpenCharacter, onOpenBuddy, onOpenStage }) {
  const { lang, data } = useGameData();
  useLazyCategory('skills');
  const [variantIndex, setVariantIndex] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  if (!enemy) return null;

  const variants = enemy.variants || [];
  const variant = variants[variantIndex] || variants[0];
  const skills = data?.skills || [];

  // Tabs read "Lv N"; when several variants share a level, disambiguate by index.
  const uniqueLevels = new Set(variants.map(v => v.LV));
  const tabLabel = (v, i) =>
    uniqueLevels.size === variants.length ? `Lv ${v.LV}` : `#${i + 1} · Lv ${v.LV}`;

  const elem = elementMeta[variant?.Attrib] || elementMeta[0];
  const pieceUrl = variant?.image_file ? `/api/assets/image?path=${encodeURIComponent(variant.image_file)}` : null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>

          {/* Header */}
          <div className="modal-header">
            <h3>{loc(enemy.name, lang)}</h3>
            <div className="modal-char-meta">
              <span><i className="fa-solid fa-paw" style={{ marginRight: 4 }}></i> Species: {enemySpeciesLabel(enemy.species)}</span>
              {enemy.boss && (
                <span style={{ color: 'var(--accent-pink)' }}><i className="fa-solid fa-crown"></i> Boss</span>
              )}
              <span><i className="fa-solid fa-clone"></i> {variants.length} variant{variants.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          {/* Variant Tabs */}
          <div className="modal-tabs">
            {variants.map((v, i) => (
              <button key={v.enemy_id} className={`modal-tab-btn ${i === variantIndex ? 'active' : ''}`} onClick={() => setVariantIndex(i)}>
                {tabLabel(v, i)}{isBossEnemy(v.FrameType) && <i className="fa-solid fa-crown" style={{ marginLeft: 5, fontSize: 9, color: 'var(--accent-pink)' }}></i>}
              </button>
            ))}
          </div>

          {variant ? (
            <div className="job-detail-layout">
              {/* Left Column */}
              <div className="job-info-col">
                <div className="job-assets-box">
                  <h5>Appearance <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>ID {variant.enemy_id}</span></h5>
                  {pieceUrl ? (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 6, display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                      <img src={pieceUrl} alt={loc(enemy.name, lang)} className="clickable-preview" onClick={() => setLightboxSrc(pieceUrl)} style={{ width: '100%', maxHeight: 220, borderRadius: 8, objectFit: 'contain', cursor: 'pointer' }} />
                    </div>
                  ) : (
                    <div className="card-image-placeholder" style={{ marginBottom: 12 }}><i className="fa-solid fa-skull"></i></div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: elem.color + '44', color: elem.color, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 8 }}>
                      {elem.icon ? <img src={elem.icon} alt={elem.name} style={{ width: 14, height: 14, objectFit: 'contain' }} /> : elem.svg ? <span dangerouslySetInnerHTML={{ __html: elem.svg }} style={{ display: 'flex', alignItems: 'center' }}></span> : null}
                      <span style={{ fontWeight: 600 }}>{elem.name}</span>
                    </span>
                    <span className="badge" style={{ fontSize: 11, padding: '4px 10px' }}>{enemySpeciesLabel(variant.Species)}</span>
                  </div>
                </div>

                <div className="stats-table-box">
                  <h5>Statistics <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Level {variant.LV}</span></h5>
                  {[['HP', variant.HP], ['ATK', variant.ATK], ['DEF', variant.DEF], ['MATK', variant.SATK], ['MDEF', variant.SDEF]].map(([label, val]) => (
                    <div key={label} className="stats-row">
                      <span className="stat-lbl">{label}</span>
                      <span className="stat-val">{(val || 0).toLocaleString()}</span>
                    </div>
                  ))}
                  {[['Wait Time', variant.WAIT], ['Range', variant.RANGE], ['EXP', variant.EXP], ['Coins', variant.COIN]].map(([label, val]) => (
                    <div key={label} className="stats-row">
                      <span className="stat-lbl">{label}</span>
                      <span className="stat-val" style={{ color: 'var(--text-secondary)' }}>{(val || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {variant.resistances?.length > 0 && (
                  <div className="job-skills-box">
                    <h5><i className="fa-solid fa-shield-halved" style={{ marginRight: 6 }}></i>Resistances</h5>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {variant.resistances.map(r => (
                        <span
                          key={r.status}
                          className="badge"
                          title={r.value >= 1 ? `Immune to ${r.status}` : `${Math.round(r.value * 100)}% resistance to ${r.status}`}
                          style={{
                            fontSize: 10, padding: '2px 7px',
                            backgroundColor: r.value >= 1 ? 'rgba(34,197,94,0.08)' : 'rgba(56,189,248,0.08)',
                            borderColor: r.value >= 1 ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.2)',
                            color: r.value >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)',
                          }}
                        >
                          {r.status}{r.value < 1 ? ` ${Math.round(r.value * 100)}%` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="job-stats-col">
                {/* Recruitable character (DropJobID/DropRatio) */}
                {variant.recruits && (
                  <div className="job-skills-box recruitment-box">
                    <h5><i className="fa-solid fa-map-pin" style={{ marginRight: 6 }}></i>Recruitment</h5>
                    <button
                      className="recode-target clickable"
                      title={`View ${loc(variant.recruits.name, lang)}`}
                      onClick={() => onOpenCharacter?.(variant.recruits.character_id)}
                      style={{ width: '100%' }}
                    >
                      <strong>{loc(variant.recruits.name, lang)}</strong>
                      <span className="badge" style={{ fontSize: 10, padding: '2px 6px', backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.2)', color: 'var(--accent-blue)' }}>
                        {rarityShortLabels[variant.recruits.rarity] || variant.recruits.rarity}
                      </span>
                      <span className="recode-open-hint"><i className="fa-solid fa-chevron-right"></i></span>
                    </button>
                    <p className="recruitment-hint">Defeat this foe for a chance to recruit the character above.</p>
                  </div>
                )}

                {/* Active Skills */}
                <div className="job-skills-box">
                  <h5>Skills</h5>
                  <ul className="job-skills-list">
                    {!skills || skills.length === 0
                      ? <li style={{ color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Loading skills data...</li>
                      : variant.skills.length === 0
                      ? <li style={{ color: 'var(--text-muted)' }}>No skills found.</li>
                      : variant.skills.map((skillID, i) => {
                        const skill = skills[skillID - 1];
                        return (
                          <li
                            key={i}
                            {...(onOpenSkill && skill ? {
                              className: 'skill-jump',
                              title: 'View this skill in the Skills catalog',
                              onClick: () => onOpenSkill(skillID, skill),
                            } : {})}
                          >
                            {skill ? (
                              <div className="skill-name-row">
                                <SkillIcon skill={skill} size={30} title={loc(skill.nameString, lang, '')} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <strong className="skill-jump-name" style={{ color: 'var(--accent-blue)' }}>{loc(skill.nameString, lang)}</strong>
                                    <span className="badge" style={{ fontSize: 10, padding: '2px 6px', backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.2)', color: 'var(--accent-red)' }}>#{skillID}</span>
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    Trigger: {triggerText(skill)}
                                    <EmitConditionBadge skill={skill} />
                                  </span>
                                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{loc(skill.descString, lang)}</p>
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Unknown Skill (ID: {skillID})</span>
                            )}
                          </li>
                        );
                      })
                    }
                  </ul>
                </div>

                {/* Loot */}
                <div className="job-skills-box">
                  <h5><i className="fa-solid fa-sack-dollar" style={{ marginRight: 6 }}></i>Loot</h5>
                  {(variant.loot || []).length === 0 && !variant.drop_buddy ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>No item drops recorded for this variant.</p>
                  ) : (
                    <ul className="job-skills-list" style={{ marginTop: 8 }}>
                      {(variant.loot || []).map((row, i) => (
                        <li
                          key={i}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                          title="Click to view item details & drop locations"
                          onClick={() => row.item_id && onOpenItem(row.item_id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                            {row.icon_url && <img src={row.icon_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain', imageRendering: 'pixelated', marginRight: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }} />}
                            <span>{loc(row.name, lang)}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--accent-pink)', flexShrink: 0, marginLeft: 8 }}>{row.rate ?? '?'}%</span>
                        </li>
                      ))}
                      {variant.drop_buddy && (
                        <li
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                          title="Click to view this companion"
                          onClick={() => onOpenBuddy?.(variant.drop_buddy.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                            {variant.drop_buddy.thumb_file && <img src={`/api/assets/image?path=${encodeURIComponent(variant.drop_buddy.thumb_file)}`} alt="" style={{ width: 24, height: 24, objectFit: 'contain', marginRight: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }} />}
                            <span><i className="fa-solid fa-paw" style={{ marginRight: 6, fontSize: 11, color: 'var(--accent-indigo)' }}></i>{loc(variant.drop_buddy.name, lang)}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--accent-pink)', flexShrink: 0, marginLeft: 8 }}>{variant.drop_buddy.rate ?? '?'}%</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                {/* Occurrences */}
                <div className="job-skills-box">
                  <h5><i className="fa-solid fa-map-location-dot" style={{ marginRight: 6 }}></i>Occurrences</h5>
                  {variant.occurrences.length === 0 && variant.possible_occurrences.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>This variant never spawns in the stage data.</p>
                  ) : (
                    <ul className="job-skills-list" style={{ marginTop: 8 }}>
                      {variant.occurrences.map((occ, i) => (
                        <li
                          key={`o${i}`}
                          className="skill-jump"
                          title="View this stage in Chapters & Stages"
                          onClick={() => onOpenStage?.(occ.chapter_no, occ.section_index)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span className="badge" style={{ fontSize: 10, padding: '2px 7px', backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: 'var(--accent-green)', flexShrink: 0 }}>
                                Ch {occ.chapter_no}-{occ.section_index}
                              </span>
                              <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {translateStageTitle(occ, lang, data?.strings, occ.chapter_no, occ.section_index).replace(/^Stage\s+\S+:\s*/, '')}
                              </span>
                            </div>
                            {occ.count > 1 && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-indigo)', flexShrink: 0 }}>×{occ.count}</span>}
                            {occ.count == null && (
                              <span className="badge" style={{ fontSize: 9, padding: '2px 6px', flexShrink: 0 }} title="Drop recorded in the event stage configuration rather than the stage layout">Event drop</span>
                            )}
                          </div>
                        </li>
                      ))}
                      {variant.possible_occurrences.map((occ, i) => (
                        <li
                          key={`p${i}`}
                          className="skill-jump"
                          title={`View this stage — ${occ.reason || 'random layout'}`}
                          onClick={() => onOpenStage?.(occ.chapter_no, occ.section_index)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span className="badge" style={{ fontSize: 10, padding: '2px 7px', backgroundColor: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.2)', color: '#fde68a', flexShrink: 0 }}>
                                Ch {occ.chapter_no}-{occ.section_index}
                              </span>
                              <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {translateStageTitle(occ, lang, data?.strings, occ.chapter_no, occ.section_index).replace(/^Stage\s+\S+:\s*/, '')}
                              </span>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}><i className="fa-solid fa-shuffle"></i> Possible</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Variant details missing.</p>
          )}
        </div>
      </div>
      {lightboxSrc && <LightboxModal src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
