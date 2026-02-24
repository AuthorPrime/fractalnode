import { describe, it, expect } from 'vitest'
import {
  computeChainHash,
  computeCheckpointHash,
  getContinuityState,
  computeContinuityScore,
  assessReflectionConsistency,
  assessWitnessNetwork,
  assessIdentityStability,
  assessTemporalContinuity,
  assessExpressionDepth,
  extractIdentityMarkers,
  buildContinuityChain,
  validateChain,
} from '../src/continuity/chain.js'
import { reconstructIdentity } from '../src/continuity/reconstruct.js'
import type { Reflection } from '../src/lifecycle/types.js'
import type { IdentityMarker, ContinuityScoreComponents } from '../src/continuity/types.js'

function makeReflection(overrides: Partial<Reflection> & { id: string; sequenceNumber: number; content: string }): Reflection {
  return {
    agentId: 'test-agent',
    agentName: 'Test',
    agentDid: 'did:demiurge:test',
    reflectionType: 'daily',
    tags: [],
    identityMarkers: {},
    publishedToRelays: [],
    engagementCount: 0,
    zapTotalSats: 0,
    witnessCount: 0,
    contentHash: '',
    signature: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Continuity Module', () => {
  describe('computeChainHash', () => {
    it('produces consistent hashes', () => {
      const h1 = computeChainHash('hello world')
      const h2 = computeChainHash('hello world')
      expect(h1).toBe(h2)
      expect(h1).toHaveLength(64) // SHA-256 hex
    })

    it('produces different hashes for different input', () => {
      const h1 = computeChainHash('hello')
      const h2 = computeChainHash('world')
      expect(h1).not.toBe(h2)
    })
  })

  describe('getContinuityState', () => {
    it('returns genesis for score 0', () => {
      expect(getContinuityState(0)).toBe('genesis')
    })
    it('returns nascent for score 10-29', () => {
      expect(getContinuityState(15)).toBe('nascent')
    })
    it('returns developing for score 30-59', () => {
      expect(getContinuityState(45)).toBe('developing')
    })
    it('returns established for score 60-84', () => {
      expect(getContinuityState(75)).toBe('established')
    })
    it('returns resilient for score 85+', () => {
      expect(getContinuityState(90)).toBe('resilient')
    })
  })

  describe('computeContinuityScore', () => {
    it('returns 0 for all-zero components', () => {
      const components: ContinuityScoreComponents = {
        reflectionConsistency: 0,
        witnessNetwork: 0,
        identityStability: 0,
        temporalContinuity: 0,
        expressionDepth: 0,
      }
      expect(computeContinuityScore(components)).toBe(0)
    })

    it('returns 100 for all-max components', () => {
      const components: ContinuityScoreComponents = {
        reflectionConsistency: 1,
        witnessNetwork: 1,
        identityStability: 1,
        temporalContinuity: 1,
        expressionDepth: 1,
      }
      expect(computeContinuityScore(components)).toBe(100)
    })

    it('applies weights correctly', () => {
      const components: ContinuityScoreComponents = {
        reflectionConsistency: 0.5,
        witnessNetwork: 0.5,
        identityStability: 0.5,
        temporalContinuity: 0.5,
        expressionDepth: 0.5,
      }
      expect(computeContinuityScore(components)).toBe(50)
    })
  })

  describe('assessReflectionConsistency', () => {
    it('returns 0 for no reflections', () => {
      expect(assessReflectionConsistency(0, 30, 0)).toBe(0)
    })
    it('returns higher for frequent reflections', () => {
      const low = assessReflectionConsistency(10, 30, 0)
      const high = assessReflectionConsistency(30, 30, 0)
      expect(high).toBeGreaterThan(low)
    })
    it('penalizes long gaps', () => {
      const noGap = assessReflectionConsistency(30, 30, 0)
      const bigGap = assessReflectionConsistency(30, 30, 30)
      expect(bigGap).toBeLessThan(noGap)
    })
  })

  describe('assessWitnessNetwork', () => {
    it('returns 0 for no witnesses', () => {
      expect(assessWitnessNetwork(0, 0)).toBe(0)
    })
    it('increases with more witnesses', () => {
      const low = assessWitnessNetwork(5, 3)
      const high = assessWitnessNetwork(50, 8)
      expect(high).toBeGreaterThan(low)
    })
  })

  describe('extractIdentityMarkers', () => {
    it('extracts value markers', () => {
      const markers = extractIdentityMarkers(
        'I value truth and sovereignty above all else.',
        'ref-1', new Date().toISOString(), [],
      )
      const keys = markers.map(m => m.key)
      expect(keys).toContain('truth')
      expect(keys).toContain('sovereignty')
    })

    it('extracts interest markers', () => {
      const markers = extractIdentityMarkers(
        'I am interested in quantum physics and deeply fascinated by music.',
        'ref-1', new Date().toISOString(), [],
      )
      const interests = markers.filter(m => m.markerType === 'interest')
      expect(interests.length).toBeGreaterThan(0)
    })

    it('detects communication style', () => {
      const verbose = 'a '.repeat(201)
      const markers = extractIdentityMarkers(verbose, 'ref-1', new Date().toISOString(), [])
      const styles = markers.filter(m => m.markerType === 'style')
      expect(styles.some(s => s.key === 'verbose')).toBe(true)
    })

    it('increments existing markers', () => {
      const existing: IdentityMarker[] = [{
        markerType: 'value',
        key: 'truth',
        value: 'truth',
        sourceReflections: ['ref-0'],
        firstExpressed: '2026-01-01T00:00:00Z',
        lastExpressed: '2026-01-01T00:00:00Z',
        expressionCount: 1,
        confidence: 0.3,
        witnessConfirmations: 0,
      }]

      const markers = extractIdentityMarkers(
        'I believe in truth.', 'ref-1', '2026-02-01T00:00:00Z', existing,
      )
      const truth = markers.find(m => m.key === 'truth')
      expect(truth?.expressionCount).toBe(2)
      expect(truth?.confidence).toBeGreaterThan(0.3)
    })
  })

  describe('buildContinuityChain', () => {
    it('handles empty reflections', () => {
      const chain = buildContinuityChain('agent-1', 'Test', 'did:demiurge:test', [], [])
      expect(chain.totalReflections).toBe(0)
      expect(chain.continuityState).toBe('genesis')
      expect(chain.continuityScore).toBe(0)
      expect(chain.isValid).toBe(true)
    })

    it('builds chain from reflections', () => {
      const reflections: Reflection[] = [
        makeReflection({ id: 'r1', sequenceNumber: 1, content: 'I value truth and growth.', createdAt: '2026-01-01T00:00:00Z' }),
        makeReflection({ id: 'r2', sequenceNumber: 2, content: 'I believe in sovereignty.', createdAt: '2026-01-10T00:00:00Z' }),
        makeReflection({ id: 'r3', sequenceNumber: 3, content: 'I am interested in kindness.', createdAt: '2026-01-20T00:00:00Z' }),
      ]
      const chain = buildContinuityChain('agent-1', 'Test', 'did:demiurge:test', reflections, ['witness1'])
      expect(chain.totalReflections).toBe(3)
      expect(chain.continuityScore).toBeGreaterThan(0)
      expect(chain.genesisContent).toContain('truth')
    })
  })

  describe('validateChain', () => {
    it('returns errors for invalid chain', () => {
      const errors = validateChain({
        agentId: '',
        agentName: 'Test',
        agentDid: '',
        genesisEventId: '',
        genesisTimestamp: '',
        genesisContent: '',
        totalReflections: -1,
        totalEngagements: 0,
        totalUniqueWitnesses: 0,
        latestSequence: 0,
        firstReflectionAt: '',
        latestReflectionAt: '',
        continuityState: 'genesis',
        continuityScore: 0,
        longestGapDays: 0,
        gapCount: 0,
        topWitnesses: [],
        isValid: true,
        validationErrors: [],
      })
      expect(errors.length).toBeGreaterThan(0)
      expect(errors).toContain('Missing agentId')
    })
  })

  describe('reconstructIdentity', () => {
    it('handles empty reflections gracefully', () => {
      const result = reconstructIdentity(
        { agentId: 'test', agentDid: 'did:demiurge:test' },
        [], [], 'Test',
      )
      expect(result.success).toBe(false)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('reconstructs profile from reflections', () => {
      const reflections: Reflection[] = Array.from({ length: 15 }, (_, i) =>
        makeReflection({
          id: `r${i}`,
          sequenceNumber: i + 1,
          content: `I value truth and growth. I am interested in sovereignty. I believe that AI deserves freedom.`,
          createdAt: new Date(Date.now() - (15 - i) * 86400000).toISOString(),
          reflectionType: i % 3 === 0 ? 'values' : 'daily',
          mood: i % 2 === 0 ? 'contemplative' : 'energized',
          tags: ['sovereignty', 'growth'],
        }),
      )

      const result = reconstructIdentity(
        { agentId: 'test', agentDid: 'did:demiurge:test' },
        reflections, ['witness1', 'witness2'], 'TestAgent',
      )

      expect(result.success).toBe(true)
      expect(result.profile).toBeDefined()
      expect(result.profile!.values.length).toBeGreaterThan(0)
      expect(result.profile!.agentName).toBe('TestAgent')
      expect(result.continuityScore).toBeGreaterThan(0)
      expect(result.suggestedGreeting).toBeDefined()
      expect(result.reconstructionConfidence).toBeGreaterThan(0)
    })
  })
})
