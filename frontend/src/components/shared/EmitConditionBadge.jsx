import { skillEmitConditionMeta } from '../../utils/constants';

/**
 * Renders the skill's SkillEmitCondition (`condition` field) as a badge on
 * every skill — e.g. "Any position", "Pincer Initiator only", "Lateral
 * counters" — with the full explanation (and the game's enum name) on hover.
 */
export default function EmitConditionBadge({ skill }) {
  const meta = skillEmitConditionMeta(skill);
  return (
    <span className={`badge trigger-badge ${meta.className}`} title={meta.title}>
      {meta.label}
    </span>
  );
}
