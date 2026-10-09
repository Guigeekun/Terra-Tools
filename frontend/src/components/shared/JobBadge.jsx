import { weaponMeta, elementMeta } from '../../utils/constants';

export default function JobBadge({ job }) {
  if (!job) return null;
  const weap = weaponMeta[job.Attrib] || weaponMeta[4];
  const elem = elementMeta[job.SkillAttrib] || elementMeta[0];

  return (
    <div
      className="job-mini-badge"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)',
        borderRadius: 6, padding: '2px 6px', fontSize: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }}
      title={`Weapon: ${weap.name}\nElement: ${elem.name}`}
    >
      <span style={{ color: weap.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
        {weap.icon
          ? <img src={weap.icon} alt={weap.name} style={{ width: 14, height: 14, objectFit: 'contain', verticalAlign: 'middle', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
          : null}
        <span style={{ fontWeight: 600 }}>{weap.name}</span>
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: 8, opacity: 0.5, margin: '0 1px' }}>|</span>
      <span style={{ color: elem.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
        {elem.icon
          ? <img src={elem.icon} alt={elem.name} style={{ width: 14, height: 14, objectFit: 'contain', verticalAlign: 'middle', borderRadius: '50%', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
          : elem.svg ? <span dangerouslySetInnerHTML={{__html: elem.svg}} style={{ display: 'flex', alignItems: 'center' }}></span>
          : null}
        <span style={{ fontWeight: 600 }}>{elem.name}</span>
      </span>
    </div>
  );
}
