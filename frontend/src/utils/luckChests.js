// Human-readable appearance rule for one Luck Treasure Chest tier, as served
// by the backend (guaranteed_at_luck / ceiling / threshold_only).
export function chestTierOdds(tier) {
  const luck = tier?.guaranteed_at_luck;
  if (luck == null) return '';
  if (tier.threshold_only) return `Only appears at Luck ${luck}+`;
  if (tier.ceiling != null && tier.ceiling < 1) return `${Math.round(tier.ceiling * 100)}% chance at Luck ${luck}`;
  return `Guaranteed at Luck ${luck}+; chance scales with Luck below that`;
}
