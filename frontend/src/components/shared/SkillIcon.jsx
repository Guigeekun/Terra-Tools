import { skillIconUrl } from '../../utils/constants';

export default function SkillIcon({ skill, size = 30, bare = false, title }) {
  const url = skillIconUrl(skill?.iconNo);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={title || 'Skill icon'}
      title={title}
      loading="lazy"
      className={`skill-icon${bare ? ' bare' : ''}`}
      style={{ width: size, height: size }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}
