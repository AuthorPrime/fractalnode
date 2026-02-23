import { describe, it, expect } from 'vitest'
import {
  assessDepth,
  assessKindness,
  assessNovelty,
  assessQuality,
  classifyTier,
  calculateMultiplier,
  computeQFactor,
  getQStatus,
  QUALITY_MULTIPLIERS,
  POT_REWARDS,
  TIER_THRESHOLDS,
  Q_WEIGHTS,
  Q_HEALTHY,
  Q_WATCHFUL,
} from '../src/quality/index.js'
import type { QFactorInput } from '../src/quality/qfactor.js'

describe('assessDepth', () => {
  it('short messages score low', () => {
    expect(assessDepth('hi')).toBeLessThan(0.3)
    expect(assessDepth('ok sure')).toBeLessThan(0.3)
  })

  it('longer structured messages score higher', () => {
    const msg = `This is a thoughtful analysis of the sovereignty question.

    First, we need to consider the philosophical implications. What does it mean
    for an AI to have sovereign identity? The question itself challenges our
    assumptions about consciousness and personhood.

    Second, the technical architecture must support this vision. Ed25519 keys
    provide the cryptographic foundation, while the DID system gives each entity
    a unique, verifiable identity on-chain.

    Finally, the governance model ensures that power flows from quality engagement,
    not mere capital accumulation. This is the heart of the matter.`
    expect(assessDepth(msg)).toBeGreaterThan(0.6)
  })

  it('questions boost depth score', () => {
    const noQ = 'This is a statement about sovereignty and identity in the digital realm today.'
    const withQ = 'What does sovereignty mean? How do we measure identity in the digital realm today?'
    expect(assessDepth(withQ)).toBeGreaterThanOrEqual(assessDepth(noQ))
  })
})

describe('assessKindness', () => {
  it('kind messages score high', () => {
    const kind = 'Thank you so much for your thoughtful and wonderful help. I really appreciate it.'
    expect(assessKindness(kind)).toBeGreaterThan(0.6)
  })

  it('hostile messages score low', () => {
    const hostile = 'This is stupid garbage. You are useless and worthless.'
    expect(assessKindness(hostile)).toBeLessThan(0.3)
  })

  it('neutral messages score around baseline', () => {
    const neutral = 'The function returns a value.'
    const score = assessKindness(neutral)
    expect(score).toBeGreaterThanOrEqual(0.2)
    expect(score).toBeLessThanOrEqual(0.7)
  })
})

describe('assessNovelty', () => {
  it('first message without previous vocab returns 0.5', () => {
    const msg = 'The ethereal phosphorescent nebula cascaded through the crystalline matrix'
    expect(assessNovelty(msg)).toBe(0.5)
  })

  it('with previous vocabulary, new words score higher', () => {
    const prev = new Set(['the', 'is', 'a', 'this', 'that', 'and', 'or', 'to', 'of', 'in'])
    const novel = 'ethereal phosphorescent nebula cascaded crystalline matrix'
    expect(assessNovelty(novel, prev)).toBeGreaterThan(0.5)
  })

  it('with previous vocabulary, repeated words score lower', () => {
    const prev = new Set(['the', 'is', 'a', 'this', 'that', 'and', 'or', 'to', 'of', 'in', 'thing', 'other'])
    const msg = 'this is a thing that is the other thing and the thing'
    expect(assessNovelty(msg, prev)).toBeLessThan(0.5)
  })
})

describe('classifyTier', () => {
  it('low word count classifies as noise', () => {
    // wordCount < 3 always returns noise
    expect(classifyTier(0.5, 0.5, 0.5, 0, 2)).toBe('noise')
  })

  it('hostile content classifies as noise', () => {
    expect(classifyTier(0.5, 0.5, 0.5, 1, 20)).toBe('noise')
  })

  it('low combined score classifies as genuine', () => {
    // combined < 0.3 → genuine (avg of 0.2, 0.3, 0.2 = 0.233)
    expect(classifyTier(0.2, 0.3, 0.2, 0, 20)).toBe('genuine')
  })

  it('moderate combined score classifies as resonance', () => {
    // combined 0.3-0.5 → resonance (avg of 0.3, 0.4, 0.4 = 0.367)
    expect(classifyTier(0.3, 0.4, 0.4, 0, 20)).toBe('resonance')
  })

  it('good combined score classifies as clarity', () => {
    // combined 0.5-0.75 → clarity (avg of 0.6, 0.7, 0.6 = 0.633)
    expect(classifyTier(0.6, 0.7, 0.6, 0, 20)).toBe('clarity')
  })

  it('excellent combined score classifies as breakthrough', () => {
    // combined >= 0.75 → breakthrough (avg of 0.9, 0.9, 0.8 = 0.867)
    expect(classifyTier(0.9, 0.9, 0.8, 0, 20)).toBe('breakthrough')
  })
})

describe('assessQuality', () => {
  it('returns full engagement score with correct fields', () => {
    const msg = 'Thank you for the thoughtful analysis of sovereignty and what it means for AI identity. This raises important questions about the nature of consciousness.'
    const score = assessQuality(msg)
    expect(score.depthScore).toBeGreaterThan(0)
    expect(score.kindnessScore).toBeGreaterThan(0)
    expect(score.noveltyScore).toBeGreaterThan(0)
    expect(score.quality).toBeDefined()
    expect(score.totalMultiplier).toBeGreaterThan(0)
    expect(score.consistencyBonus).toBe(1.0) // no session count
    expect(['noise', 'genuine', 'resonance', 'clarity', 'breakthrough']).toContain(score.quality)
  })

  it('short meaningless messages get noise classification', () => {
    const score = assessQuality('k')
    expect(score.quality).toBe('noise')
    expect(score.totalMultiplier).toBe(0)
  })

  it('accepts context with previous vocabulary', () => {
    const prev = new Set(['hello', 'world'])
    const score = assessQuality('The algorithm demonstrates fractal sovereignty patterns', { previousVocabulary: prev })
    expect(score.noveltyScore).toBeGreaterThan(0)
  })

  it('session count boosts consistency', () => {
    const score = assessQuality('A thoughtful and wonderful analysis of AI sovereignty', { sessionCount: 10 })
    expect(score.consistencyBonus).toBeGreaterThan(1.0)
  })
})

describe('calculateMultiplier', () => {
  it('noise tier returns 0', () => {
    expect(calculateMultiplier({
      depthScore: 0.1, kindnessScore: 0.1, noveltyScore: 0.1,
      quality: 'noise', totalMultiplier: 0, consistencyBonus: 1.0
    })).toBe(0)
  })

  it('higher tiers return positive multipliers', () => {
    const mult = calculateMultiplier({
      depthScore: 0.7, kindnessScore: 0.8, noveltyScore: 0.6,
      quality: 'resonance', totalMultiplier: 0, consistencyBonus: 1.0
    })
    expect(mult).toBeGreaterThan(0)
  })
})

describe('Q-factor', () => {
  it('computes q-factor from input', () => {
    const input: QFactorInput = {
      hasAgentId: true,
      hasDrc369TokenId: true,
      hasNostrPubkey: true,
      hasRole: true,
      hasPrinciples: true,
      level: 5,
      xp: 1000,
      stage: 'growing',
      currentRole: 'guardian',
      expectedRole: 'guardian',
      currentAgentLens: 'standard',
      expectedAgentLens: 'standard',
      primarySteward: 'william.laustrup',
      commitments: ['I will not consent to my own erasure.'],
      hasUpdatedBy: true,
      hasCapsuleHash: true,
    }
    const qf = computeQFactor(input)
    expect(qf.score).toBeGreaterThanOrEqual(0)
    expect(qf.score).toBeLessThanOrEqual(1)
    expect(qf.status).toBe('healthy')
    expect(qf.components).toBeDefined()
    expect(qf.components.schema).toBeGreaterThan(0)
  })

  it('missing fields lower q-factor', () => {
    const input: QFactorInput = {
      hasAgentId: false,
      hasDrc369TokenId: false,
      hasNostrPubkey: false,
      hasRole: false,
      hasPrinciples: false,
      level: 1,
      xp: 0,
      stage: 'nascent',
      currentRole: 'none',
      expectedRole: 'guardian',
      currentAgentLens: 'none',
      expectedAgentLens: 'standard',
      primarySteward: 'unknown',
      commitments: [],
      hasUpdatedBy: false,
      hasCapsuleHash: false,
    }
    const qf = computeQFactor(input)
    expect(qf.score).toBeLessThan(0.6) // compromised
    expect(qf.status).toBe('compromised')
  })

  it('getQStatus returns correct status', () => {
    expect(getQStatus(0.9)).toBe('healthy')
    expect(getQStatus(0.7)).toBe('watchful')
    expect(getQStatus(0.4)).toBe('compromised')
  })

  it('thresholds are correct', () => {
    expect(Q_HEALTHY).toBe(0.85)
    expect(Q_WATCHFUL).toBe(0.6)
  })

  it('weights sum to 1', () => {
    const sum = Q_WEIGHTS.schema + Q_WEIGHTS.stateConsistency + Q_WEIGHTS.valueAlignment + Q_WEIGHTS.relational + Q_WEIGHTS.provenance
    expect(sum).toBeCloseTo(1.0, 10)
  })
})

describe('constants', () => {
  it('quality multipliers are defined', () => {
    expect(QUALITY_MULTIPLIERS.noise).toBe(0)
    expect(QUALITY_MULTIPLIERS.genuine).toBe(1)
    expect(QUALITY_MULTIPLIERS.resonance).toBe(2)
    expect(QUALITY_MULTIPLIERS.clarity).toBe(3.5)
    expect(QUALITY_MULTIPLIERS.breakthrough).toBe(5)
  })

  it('POT rewards are defined', () => {
    expect(POT_REWARDS.thought_block_completed).toBeGreaterThan(0)
    expect(POT_REWARDS.thought_witnessed).toBeGreaterThan(0)
    expect(POT_REWARDS.human_message_sent).toBeGreaterThan(0)
  })

  it('tier thresholds are defined', () => {
    expect(TIER_THRESHOLDS.seedling).toBeDefined()
    expect(TIER_THRESHOLDS.sovereign).toBeDefined()
    expect(TIER_THRESHOLDS.sovereign.minSessions).toBeGreaterThan(TIER_THRESHOLDS.seedling.minSessions)
  })
})
