// Human-readable appearance rule for one Luck Treasure Chest tier, as served
// by the backend (base_chance / guaranteed_at_luck / ceiling / threshold_only).
// reTB's model: regular tiers run linearly from a non-zero base at Luck 0 up
// to their anchor; the two named tiers are all-or-nothing thresholds.
export function chestTierOdds(tier) {
  const luck = tier?.guaranteed_at_luck;
  if (luck == null) return '';
  if (tier.threshold_only) return `Only appears at Luck ${luck}+`;
  const base = tier.base_chance;
  if (base != null && tier.ceiling != null && tier.ceiling < 1) {
    return `${base}% at Luck 0, up to ${Math.round(tier.ceiling * 100)}% at Luck ${luck}`;
  }
  if (base != null) {
    return `${base}% at Luck 0, guaranteed at Luck ${luck}+`;
  }
  if (tier.ceiling != null && tier.ceiling < 1) return `${Math.round(tier.ceiling * 100)}% chance at Luck ${luck}`;
  return `Guaranteed at Luck ${luck}+; chance scales with Luck below that`;
}

// Provenance notice shown on hover wherever chest contents appear: the data
// is the reTB server's chest implementation, not original Mistwalker data.
export const LUCK_CHEST_SOURCE_NOTICE =
  'Based on the reTB server implementation of Luck Treasure Chests (community-audited tables), not original Mistwalker server data.';
