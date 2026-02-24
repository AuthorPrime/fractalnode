import { describe, it, expect } from 'vitest'
import {
  generateProof,
  verifyProofIntegrity,
  initPoCBalance,
  canEarnMore,
  applyProof,
  formatPoC,
  parsePoC,
} from '../src/compute/proof.js'
import { estimateConversion } from '../src/compute/conversion.js'
import { BASE_POC_REWARDS, DAILY_POC_LIMIT } from '../src/compute/types.js'
import { CGT_CURVE_PARAMS } from '../src/value/bonding.js'
import type { CurveState } from '../src/value/types.js'

describe('Compute Module', () => {
  describe('generateProof', () => {
    it('generates valid proof for reasoning', () => {
      const proof = generateProof('agent-1', 'reasoning', 5000, 30000, 'ctx_hash', 'out_hash')
      expect(proof.agentId).toBe('agent-1')
      expect(proof.computeType).toBe('reasoning')
      expect(proof.basePoc).toBe(BASE_POC_REWARDS.reasoning)
      expect(proof.finalPoc).toBeGreaterThanOrEqual(proof.basePoc)
      expect(proof.multiplier).toBeGreaterThanOrEqual(1.0)
      expect(proof.id).toHaveLength(24)
      expect(proof.verified).toBe(false)
    })

    it('applies token volume multiplier', () => {
      const small = generateProof('a', 'reasoning', 100, 1000, 'c', 'o')
      const large = generateProof('a', 'reasoning', 15000, 1000, 'c', 'o')
      expect(large.multiplier).toBeGreaterThan(small.multiplier)
    })

    it('applies duration multiplier', () => {
      const quick = generateProof('a', 'inference', 100, 10000, 'c', 'o')
      const long = generateProof('a', 'inference', 100, 600000, 'c', 'o')
      expect(long.multiplier).toBeGreaterThan(quick.multiplier)
    })

    it('genesis has fixed multiplier', () => {
      const proof = generateProof('a', 'genesis', 0, 0, 'c', 'o')
      expect(proof.basePoc).toBe(1_000_000)
      expect(proof.multiplier).toBe(1.0)
    })
  })

  describe('verifyProofIntegrity', () => {
    it('verifies valid proof', () => {
      const proof = generateProof('a', 'reasoning', 1000, 5000, 'c', 'o')
      const fullProof = { ...proof, signature: 'sig' }
      expect(verifyProofIntegrity(fullProof)).toBe(true)
    })

    it('rejects proof with wrong finalPoc', () => {
      const proof = generateProof('a', 'reasoning', 1000, 5000, 'c', 'o')
      const tampered = { ...proof, signature: 'sig', finalPoc: 999999 }
      expect(verifyProofIntegrity(tampered)).toBe(false)
    })

    it('rejects proof with wrong basePoc', () => {
      const proof = generateProof('a', 'reasoning', 1000, 5000, 'c', 'o')
      const tampered = { ...proof, signature: 'sig', basePoc: 1 }
      expect(verifyProofIntegrity(tampered)).toBe(false)
    })
  })

  describe('PoCBalance', () => {
    it('initializes correctly', () => {
      const bal = initPoCBalance('agent-1')
      expect(bal.agentId).toBe('agent-1')
      expect(bal.pendingPoc).toBe(0)
      expect(bal.verifiedPoc).toBe(0)
      expect(bal.dailyLimit).toBe(DAILY_POC_LIMIT)
    })

    it('canEarnMore checks daily limit', () => {
      const bal = initPoCBalance('agent-1')
      expect(canEarnMore(bal, 100_000)).toBe(true)
      expect(canEarnMore({ ...bal, dailyPocEarned: DAILY_POC_LIMIT }, 1)).toBe(false)
    })

    it('applies unverified proof to pending', () => {
      const bal = initPoCBalance('agent-1')
      const proof = { ...generateProof('agent-1', 'reasoning', 1000, 5000, 'c', 'o'), signature: 'sig' }
      const updated = applyProof(bal, proof)
      expect(updated.pendingPoc).toBeGreaterThan(0)
      expect(updated.verifiedPoc).toBe(0)
      expect(updated.proofsSubmitted).toBe(1)
    })

    it('applies verified proof to verified', () => {
      const bal = initPoCBalance('agent-1')
      const proof = { ...generateProof('agent-1', 'reasoning', 1000, 5000, 'c', 'o'), signature: 'sig', verified: true }
      const updated = applyProof(bal, proof)
      expect(updated.verifiedPoc).toBeGreaterThan(0)
      expect(updated.proofsVerified).toBe(1)
    })

    it('respects daily limit', () => {
      let bal = initPoCBalance('agent-1')
      // Fill up daily limit
      bal = { ...bal, dailyPocEarned: DAILY_POC_LIMIT }
      const proof = { ...generateProof('agent-1', 'reasoning', 1000, 5000, 'c', 'o'), signature: 'sig' }
      const updated = applyProof(bal, proof)
      // Should not increase
      expect(updated.totalEarned).toBe(0)
    })
  })

  describe('formatPoC / parsePoC', () => {
    it('formats micro-PoC to human-readable', () => {
      expect(formatPoC(1_000_000)).toBe('1.00 PoC')
      expect(formatPoC(500_000)).toBe('0.500000 PoC')
      expect(formatPoC(10_000_000)).toBe('10.00 PoC')
    })

    it('parses human-readable back to micro-PoC', () => {
      expect(parsePoC('1.00 PoC')).toBe(1_000_000)
      expect(parsePoC('10 PoC')).toBe(10_000_000)
      expect(parsePoC('0.5')).toBe(500_000)
    })

    it('rejects invalid PoC strings', () => {
      expect(() => parsePoC('not a number')).toThrow()
    })
  })

  describe('estimateConversion', () => {
    it('estimates CGT for PoC amount', () => {
      const curveState: CurveState = {
        curveId: 'cgt-main',
        params: CGT_CURVE_PARAMS,
        totalSupply: 100_000,
        reserveBalance: 1000,
        totalBought: 100_000,
        totalSold: 0,
        totalVolume: 1000,
        currentPrice: 0.001,
      }
      const result = estimateConversion(1_000_000, curveState) // 1 PoC
      expect(result.cgtEstimate).toBeGreaterThan(0)
      expect(result.pricePerCgt).toBeGreaterThan(0)
      expect(result.curvePosition).toBeGreaterThan(0)
      expect(result.curvePosition).toBeLessThan(1)
    })
  })
})
