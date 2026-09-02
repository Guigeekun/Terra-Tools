import { useState } from 'react';
import { loc } from '../../utils/localization';

export default function WaveBoard({ waves, lang }) {
  const [activeWave, setActiveWave] = useState(0);

  if (!waves || waves.length === 0) {
    return <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>No wave data found for this stage.</p>;
  }

  const wave = waves[activeWave];
  const enemies = wave?.enemies || [];
  const enemyMap = {};
  enemies.forEach(e => { enemyMap[`${e.x},${e.y}`] = e; });

  const bgUrl = wave?.bg_url || (wave?.bgID ? `/api/bg/${wave.bgID}` : null);

  return (
    <div className="stage-layout-content">
      {waves.length > 1 && (
        <div className="wave-tabs">
          {waves.map((w, idx) => (
            <button key={idx} className={`wave-tab-btn ${idx === activeWave ? 'active' : ''}`} onClick={() => setActiveWave(idx)}>
              <i className="fa-solid fa-circle-play"></i> Wave {w.wave_index}
            </button>
          ))}
        </div>
      )}
      <div className="wave-layout-workspace">
        <div
          className="board-grid-wrapper"
          style={bgUrl ? {
            backgroundImage: `linear-gradient(rgba(10, 13, 22, 0.72), rgba(10, 13, 22, 0.82)), url("${bgUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderRadius: '12px',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
          } : {}}
        >
          <div className="board-grid">
            {Array.from({ length: 8 }).map((_, y) =>
              Array.from({ length: 6 }).map((_, x) => {
                const enemy = enemyMap[`${x},${y}`];
                const isBoss = enemy && (
                  enemy.enemy_var?.includes('BAKUROU') || enemy.enemy_var?.includes('CHAMP') ||
                  enemy.enemy_var?.includes('KING') || (enemy.HP && enemy.HP > 1000)
                );
                return (
                  <div key={`${x},${y}`} className={`board-cell ${enemy ? 'has-enemy' : ''}`} data-coord={`${x},${y}`}>
                    {enemy && (
                      <div className={`enemy-token ${isBoss ? 'boss' : ''}`}>
                        {isBoss ? 'B' : 'E'}
                        <div className="tooltip-content">
                          <div className="tooltip-title">{loc(enemy.NameString, lang, enemy.enemy_var)}</div>
                          <div className="tooltip-stat-row"><span>Level:</span><span className="tooltip-stat-val">Lv {enemy.LV || '?'}</span></div>
                          <div className="tooltip-stat-row"><span>HP:</span><span className="tooltip-stat-val">{enemy.HP || '?'}</span></div>
                          <div className="tooltip-stat-row"><span>ATK:</span><span className="tooltip-stat-val">{enemy.ATK || '?'}</span></div>
                          <div className="tooltip-stat-row"><span>DEF:</span><span className="tooltip-stat-val">{enemy.DEF || '?'}</span></div>
                          <div className="tooltip-stat-row"><span>Coord:</span><span className="tooltip-stat-val">({x}, {y})</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="wave-enemies-list">
          {enemies.length === 0
            ? <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>No enemies spawn in this wave.</p>
            : enemies.map((enemy, i) => (
              <div key={i} className="wave-enemy-item">
                <div className="wave-enemy-name-col">
                  <span className="wave-enemy-name-text">{loc(enemy.NameString, lang, enemy.enemy_var)}</span>
                  <span className="wave-enemy-stat-badge">Lv {enemy.LV || '?'} | HP: {enemy.HP || '?'}</span>
                </div>
                <div className="wave-enemy-coord-col">({enemy.x}, {enemy.y})</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
