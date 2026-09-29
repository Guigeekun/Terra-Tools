import { isPincerOnlySkill, PINCER_ONLY_TITLE } from '../../utils/constants';

/**
 * "Pincer only" marker for skills whose hidden SkillEmitCondition is Sandwich
 * (condition 1): they only activate at close range, when the unit is one of
 * the two pincering units. Rendered inline wherever the skill's trigger is
 * shown; renders nothing for unrestricted skills.
 */
export default function PincerOnlyBadge({ skill }) {
  if (!isPincerOnlySkill(skill)) return null;
  return (
    <span className="badge trigger-badge pincer" title={PINCER_ONLY_TITLE}>
      <i className="fa-solid fa-compress" /> Pincer only
    </span>
  );
}
