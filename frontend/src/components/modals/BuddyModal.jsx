import { useState, useEffect } from 'react';
import { loc } from '../../utils/localization';
import { rarityLabels } from '../../utils/constants';
import { useGameData } from '../../contexts/GameDataContext';
import { useLazyCategory } from '../../hooks/useLazyCategory';

export default function BuddyModal({ buddy: initialBuddy, buddyId, onClose, onSelectBuddy }) {
  const { lang, data } = useGameData();
  useLazyCategory('skills');
  const [buddy, setBuddy] = useState(initialBuddy || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialBuddy && typeof initialBuddy === 'object') {
      setBuddy(initialBuddy);
      return;
    }

    const id = buddyId || (typeof initialBuddy === 'number' ? initialBuddy : null);
    if (!id) return;

    // Check if buddy is in pre-loaded buddies cache
    if (Array.isArray(data?.buddies)) {
      const found = data.buddies.find(b => b.ID === id || b.id === id);
      if (found) {
        setBuddy(found);
        return;
      }
    }

    // Fetch from backend
    setLoading(true);
    fetch(`/api/buddy/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Buddy not found');
        return r.json();
      })
      .then(data => {
        setBuddy(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load buddy details:', err);
        setLoading(false);
      });
  }, [initialBuddy, buddyId, data?.buddies]);

  if (!buddy && !loading) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fa-solid fa-xmark"></i>
        </button>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 24, color: 'var(--accent-blue)', marginBottom: 12 }}></i>
            <p style={{ margin: 0, fontSize: 14 }}>Loading companion details...</p>
          </div>
        ) : buddy ? (
          <>
            <div className="modal-header" style={{ display: 'flex', gap: 16, marginBottom: 16, borderBottom: 'none', paddingBottom: 0 }}>
              {buddy.thumb_file && (
                <img
                  src={`/api/assets/image?path=${encodeURIComponent(buddy.thumb_file)}`}
                  alt="Thumb"
                  style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)', objectFit: 'contain' }}
                />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 20 }}>
                  {loc(buddy.NameString || buddy.name, lang, `Companion #${buddy.ID || buddy.id}`)}
                </h3>
                <span className="card-badge badge-rarity">
                  {rarityLabels[buddy.rarity] || 'Class ' + (buddy.rarity || '?')}
                </span>
              </div>
            </div>

            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, maxHeight: 100, overflowY: 'auto', lineHeight: 1.5 }}>
              {loc(buddy.DescString || buddy.desc, lang, 'No description available.')}
            </p>

            {buddy.skill > 0 && (
              data?.skills?.[buddy.skill - 1] ? (() => {
                const selectedSkill = data.skills[buddy.skill - 1];
                return (
                  <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--accent-indigo)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fa-solid fa-star"></i> Companion Skill
                    </h4>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: 16 }}>{loc(selectedSkill.nameString, lang)}</h5>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
                      {loc(selectedSkill.descString, lang)}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Activation Rate:</span> {selectedSkill.emitRatio === 0 ? 'Equip' : `${selectedSkill.emitRatio}%`}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Element:</span> {selectedSkill.attrib || 'None'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Area:</span> {loc(selectedSkill.rangePrefixString, lang, 'Self')}</div>
                      {(selectedSkill.power > 0 || selectedSkill.spower > 0) && (
                        <div><span style={{ color: 'var(--text-muted)' }}>Power:</span> {selectedSkill.power > 0 ? selectedSkill.power : selectedSkill.spower}</div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: 16, borderRadius: 8, marginBottom: 20, border: '1px solid rgba(99, 102, 241, 0.2)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }}></i> Loading companion skill details...
                </div>
              )
            )}

            <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, marginBottom: buddy.evolveID ? 20 : 0 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--text-secondary)' }}>
                Max Level Stats (Lv {buddy.MaxLevel || 1})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                <div><i className="fa-solid fa-bolt" style={{ width: 20, color: 'var(--text-secondary)' }}></i> ATK: {buddy.ATKmax || 0}</div>
                <div><i className="fa-solid fa-shield" style={{ width: 20, color: 'var(--text-secondary)' }}></i> DEF: {buddy.DEFmax || 0}</div>
                <div><i className="fa-solid fa-fire" style={{ width: 20, color: 'var(--text-secondary)' }}></i> MATK: {buddy.SATKmax || 0}</div>
                <div><i className="fa-solid fa-star" style={{ width: 20, color: 'var(--text-secondary)' }}></i> MDEF: {buddy.SDEFmax || 0}</div>
              </div>
            </div>

            {buddy.evolveID > 0 && (
              <div style={{ padding: 12, border: '1px solid var(--border-color)', borderRadius: 8, marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--text-secondary)' }}>Evolves Into</h4>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onSelectBuddy) {
                      onSelectBuddy(buddy.evolveID);
                    } else {
                      setBuddy(null);
                      setLoading(true);
                      fetch(`/api/buddy/${buddy.evolveID}`)
                        .then(r => r.json())
                        .then(data => { setBuddy(data); setLoading(false); })
                        .catch(() => setLoading(false));
                    }
                  }}
                  style={{ color: 'var(--accent-blue)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <i className="fa-solid fa-arrow-right"></i> Companion #{buddy.evolveID}
                </a>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

