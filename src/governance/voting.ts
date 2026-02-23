/**
 * Quadratic governance — weight = floor(sqrt(stake * quality)).
 * Prevents plutocratic capture: large stakes have diminishing returns.
 */

/** Quorum threshold: 10% of eligible weight must participate */
export const QUORUM_THRESHOLD = 0.10

/** Approval threshold: 50% of participating weight */
export const APPROVAL_THRESHOLD = 0.50

/**
 * Calculate governance weight from stake and quality score.
 * weight = floor(sqrt(stake * quality))
 *
 * @param stake — CGT staked (in Sparks, bigint)
 * @param qualityScore — quality score 0-1000 (integer, not float)
 */
export function calculateGovernanceWeight(stake: bigint, qualityScore: number): bigint {
  if (stake <= 0n || qualityScore <= 0) return 0n
  const product = stake * BigInt(qualityScore)
  return sqrt(product)
}

/** Check if quorum is met */
export function isQuorumMet(totalParticipatingWeight: bigint, totalEligibleWeight: bigint): boolean {
  if (totalEligibleWeight <= 0n) return false
  return totalParticipatingWeight * 100n >= totalEligibleWeight * BigInt(Math.floor(QUORUM_THRESHOLD * 100))
}

/** Check if a proposal is approved (>50% approve weight) */
export function isApproved(approveWeight: bigint, totalWeight: bigint): boolean {
  if (totalWeight <= 0n) return false
  return approveWeight * 100n > totalWeight * BigInt(Math.floor(APPROVAL_THRESHOLD * 100))
}

/** Integer square root via Newton's method */
function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('Square root of negative number')
  if (n === 0n) return 0n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}
