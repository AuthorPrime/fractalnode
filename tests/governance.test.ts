import { describe, it, expect } from 'vitest'
import {
  calculateGovernanceWeight,
  isQuorumMet,
  isApproved,
  QUORUM_THRESHOLD,
  APPROVAL_THRESHOLD,
} from '../src/governance/index.js'

describe('governance weight', () => {
  it('calculates floor(sqrt(stake * quality))', () => {
    // 10000 * 800 = 8,000,000 → sqrt = 2828.427... → floor = 2828
    expect(calculateGovernanceWeight(10000n, 800)).toBe(2828n)
  })

  it('zero stake gives zero weight', () => {
    expect(calculateGovernanceWeight(0n, 1000)).toBe(0n)
  })

  it('zero quality gives zero weight', () => {
    expect(calculateGovernanceWeight(10000n, 0)).toBe(0n)
  })

  it('handles large values', () => {
    const weight = calculateGovernanceWeight(1_000_000n, 1000)
    expect(weight).toBe(31622n)
  })

  it('small stake still gives weight', () => {
    expect(calculateGovernanceWeight(100n, 100)).toBe(100n)
  })

  it('perfect square gives exact result', () => {
    expect(calculateGovernanceWeight(400n, 100)).toBe(200n)
  })
})

describe('quorum', () => {
  it('10% participating = quorum met', () => {
    expect(isQuorumMet(100n, 1000n)).toBe(true)
  })

  it('9% participating = no quorum', () => {
    expect(isQuorumMet(9n, 100n)).toBe(false)
  })

  it('100% participating = quorum met', () => {
    expect(isQuorumMet(1000n, 1000n)).toBe(true)
  })

  it('0 participation = no quorum', () => {
    expect(isQuorumMet(0n, 1000n)).toBe(false)
  })

  it('QUORUM_THRESHOLD is 0.10 (10%)', () => {
    expect(QUORUM_THRESHOLD).toBe(0.10)
  })
})

describe('approval', () => {
  it('strictly more than 50% = approved', () => {
    // isApproved uses > not >=, so exactly 50% is NOT approved
    expect(isApproved(501n, 1000n)).toBe(true)
  })

  it('exactly 50% = not approved (strict majority required)', () => {
    expect(isApproved(500n, 1000n)).toBe(false)
  })

  it('51% approve = approved', () => {
    expect(isApproved(51n, 100n)).toBe(true)
  })

  it('49% approve = not approved', () => {
    expect(isApproved(49n, 100n)).toBe(false)
  })

  it('unanimous = approved', () => {
    expect(isApproved(1000n, 1000n)).toBe(true)
  })

  it('0 approve = not approved', () => {
    expect(isApproved(0n, 1000n)).toBe(false)
  })

  it('APPROVAL_THRESHOLD is 0.50 (50%)', () => {
    expect(APPROVAL_THRESHOLD).toBe(0.50)
  })
})
