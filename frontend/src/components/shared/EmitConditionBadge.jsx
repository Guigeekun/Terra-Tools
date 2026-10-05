import { SKILL_EMIT_CONDITION_NONE, skillEmitConditionMeta } from '../../utils/constants';

/**
 * Renders the skill's SkillEmitCondition (`condition` field) as a badge on
 * every skill — e.g. "Pincer Initiator only", "Lateral counters" — with the
 * full explanation (and the game's enum name) on hover. Condition 0 ("Any
 * position") is the default with no restriction, so nothing renders for it.
 */
export default function EmitConditionBadge({ skill }) {
  if ((skill?.condition ?? 0) === SKILL_EMIT_CONDITION_NONE) return null;
  const meta = skillEmitConditionMeta(skill);
  return (
    <span className={`badge trigger-badge ${meta.className}`} title={meta.title}>
      {meta.label}
    </span>
  );
}
