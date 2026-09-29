import { isPincerInitiatorSkill, PINCER_INITIATOR_TITLE } from '../../utils/constants';

/**
 * "Pincer Initiator only" marker for skills whose hidden SkillEmitCondition is
 * Sandwich (condition 1): they only activate at close range, when the unit is
 * one of the two pincering units. Rendered inline wherever the skill's trigger
 * is shown; renders nothing for unrestricted skills.
 */
export default function PincerInitiatorBadge({ skill }) {
  if (!isPincerInitiatorSkill(skill)) return null;
  return (
    <span className="badge trigger-badge pincer" title={PINCER_INITIATOR_TITLE}>
      <i className="fa-solid fa-compress" /> Pincer Initiator only
    </span>
  );
}
