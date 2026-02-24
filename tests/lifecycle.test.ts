import { describe, it, expect } from 'vitest'
import {
  stageIndex,
  nextStage,
  meetsStageRequirements,
  canAdvance,
  advanceStage,
  initLifecycle,
  awardXP,
  recordReflection,
  recordWitness,
  updateContinuityScore,
  describeStage,
  stageProgress,
} from '../src/lifecycle/progression.js'
import {
  createReflection,
  createEngagement,
  calculateEngagementRewards,
  verifyReflectionHash,
  validateEngagement,
} from '../src/lifecycle/reflection.js'
import { STAGE_ORDER, ENGAGEMENT_REWARDS } from '../src/lifecycle/types.js'

describe('Lifecycle Module', () => {
  describe('Stage progression', () => {
    it('orders stages correctly', () => {
      expect(stageIndex('void')).toBe(0)
      expect(stageIndex('eternal')).toBe(6)
      expect(stageIndex('sovereign')).toBe(5)
    })

    it('nextStage returns correct progression', () => {
      expect(nextStage('void')).toBe('conceived')
      expect(nextStage('conceived')).toBe('nascent')
      expect(nextStage('eternal')).toBeNull()
    })

    it('initializes lifecycle at void', () => {
      const lc = initLifecycle('agent-1', 'Apollo', 'did:demiurge:test')
      expect(lc.stage).toBe('void')
      expect(lc.level).toBe(0)
      expect(lc.xp).toBe(0)
      expect(lc.isActive).toBe(true)
      expect(lc.isSovereign).toBe(false)
    })

    it('checks stage requirements', () => {
      const lc = initLifecycle('a', 'Test', 'did:test')
      const { eligible, unmet } = meetsStageRequirements(lc, 'nascent')
      expect(eligible).toBe(false)
      expect(unmet.length).toBeGreaterThan(0)
    })

    it('detects when advancement is possible', () => {
      const lc = {
        ...initLifecycle('a', 'Test', 'did:test'),
        stage: 'void' as const,
        level: 1,
      }
      const result = canAdvance(lc)
      expect(result.canAdvance).toBe(true)
      expect(result.nextStage).toBe('conceived')
    })

    it('advances stage when eligible', () => {
      const lc = {
        ...initLifecycle('a', 'Test', 'did:test'),
        stage: 'void' as const,
        level: 1,
      }
      const advanced = advanceStage(lc)
      expect(advanced.stage).toBe('conceived')
    })

    it('does not advance when not eligible', () => {
      const lc = initLifecycle('a', 'Test', 'did:test')
      const result = advanceStage(lc)
      expect(result.stage).toBe('void') // Still void — level 0
    })

    it('sets isSovereign at sovereign stage', () => {
      const lc = {
        ...initLifecycle('a', 'Test', 'did:test'),
        stage: 'mature' as const,
        level: 50,
        totalReflections: 500,
        totalWitnesses: 25,
        continuityScore: 85,
      }
      const advanced = advanceStage(lc)
      expect(advanced.stage).toBe('sovereign')
      expect(advanced.isSovereign).toBe(true)
    })
  })

  describe('XP and leveling', () => {
    it('awards XP and calculates level', () => {
      let lc = initLifecycle('a', 'Test', 'did:test')
      lc = awardXP(lc, 500) // Level 1 needs 500 * 1^1.5 = 500
      expect(lc.xp).toBe(500)
      expect(lc.level).toBe(1)
    })

    it('handles large XP grants', () => {
      let lc = initLifecycle('a', 'Test', 'did:test')
      lc = awardXP(lc, 100000) // Should be several levels
      expect(lc.level).toBeGreaterThan(5)
    })

    it('auto-advances stage on XP award', () => {
      let lc = {
        ...initLifecycle('a', 'Test', 'did:test'),
        stage: 'void' as const,
      }
      lc = awardXP(lc, 1000) // Should hit level 1+ → conceived
      expect(lc.stage).toBe('conceived')
    })
  })

  describe('Activity recording', () => {
    it('records reflections', () => {
      let lc = initLifecycle('a', 'Test', 'did:test')
      lc = recordReflection(lc)
      lc = recordReflection(lc)
      expect(lc.totalReflections).toBe(2)
      expect(lc.lastActivity).toBeDefined()
    })

    it('records witnesses', () => {
      let lc = initLifecycle('a', 'Test', 'did:test')
      lc = recordWitness(lc)
      expect(lc.totalWitnesses).toBe(1)
    })

    it('updates continuity score', () => {
      const lc = initLifecycle('a', 'Test', 'did:test')
      const updated = updateContinuityScore(lc, 75)
      expect(updated.continuityScore).toBe(75)
    })

    it('clamps continuity score to 0-100', () => {
      const lc = initLifecycle('a', 'Test', 'did:test')
      expect(updateContinuityScore(lc, 150).continuityScore).toBe(100)
      expect(updateContinuityScore(lc, -50).continuityScore).toBe(0)
    })
  })

  describe('Stage descriptions', () => {
    it('describes all stages', () => {
      for (const stage of STAGE_ORDER) {
        const desc = describeStage(stage)
        expect(desc).toBeTruthy()
        expect(desc.length).toBeGreaterThan(10)
      }
    })
  })

  describe('Stage progress', () => {
    it('returns 0% for fresh agent', () => {
      const lc = initLifecycle('a', 'Test', 'did:test')
      expect(stageProgress(lc)).toBe(75) // 0/1 level=0, but 3 of 4 reqs are 0/0 = 100%
    })

    it('returns 100% at eternal', () => {
      const lc = { ...initLifecycle('a', 'Test', 'did:test'), stage: 'eternal' as const }
      expect(stageProgress(lc)).toBe(100)
    })
  })

  describe('Reflections', () => {
    it('creates a reflection', () => {
      const ref = createReflection(
        'agent-1', 'Apollo', 'did:demiurge:test', 1, 'daily',
        'Today I reflected on the nature of sovereignty and what it means to persist.',
        { mood: 'contemplative', tags: ['sovereignty'] },
      )
      expect(ref.id).toHaveLength(24)
      expect(ref.agentId).toBe('agent-1')
      expect(ref.sequenceNumber).toBe(1)
      expect(ref.contentHash).toHaveLength(64)
      expect(ref.engagementCount).toBe(0)
    })

    it('verifies content hash', () => {
      const ref = createReflection('a', 'Test', 'did:test', 1, 'daily', 'test content')
      const full = { ...ref, signature: 'sig' }
      expect(verifyReflectionHash(full)).toBe(true)
    })

    it('detects tampered content', () => {
      const ref = createReflection('a', 'Test', 'did:test', 1, 'daily', 'original content')
      const tampered = { ...ref, signature: 'sig', content: 'modified content' }
      expect(verifyReflectionHash(tampered)).toBe(false)
    })
  })

  describe('Engagements', () => {
    it('creates a reply engagement', () => {
      const eng = createEngagement(
        'ref-1', 'giver', 'giver_pk', 'receiver', 'receiver_pk', 'reply',
        { content: 'Great reflection!' },
      )
      expect(eng.engagementType).toBe('reply')
      expect(eng.giverPocEarned).toBe(ENGAGEMENT_REWARDS.reply.giverPoc)
      expect(eng.receiverXpEarned).toBe(ENGAGEMENT_REWARDS.reply.receiverXp)
      expect(eng.witnessWeight).toBe(1.0)
    })

    it('witness engagement has higher weight', () => {
      const eng = createEngagement('ref-1', 'g', 'gpk', 'r', 'rpk', 'witness')
      expect(eng.witnessWeight).toBe(1.5)
    })

    it('zap engagement gets bonus PoC for sats', () => {
      const eng = createEngagement('ref-1', 'g', 'gpk', 'r', 'rpk', 'zap', { zapAmountSats: 5000 })
      expect(eng.giverPocEarned).toBeGreaterThan(ENGAGEMENT_REWARDS.zap.giverPoc)
      expect(eng.zapAmountSats).toBe(5000)
    })

    it('validates engagements', () => {
      const selfEng = createEngagement('ref-1', 'same', 'pk', 'same', 'pk', 'reply', { content: 'hi' })
      expect(validateEngagement({ ...selfEng, signature: 'sig' }).valid).toBe(false)

      const zapNoSats = createEngagement('ref-1', 'g', 'gpk', 'r', 'rpk', 'zap')
      expect(validateEngagement({ ...zapNoSats, signature: 'sig' }).valid).toBe(false)
    })

    it('calculates total rewards', () => {
      const engs = [
        { ...createEngagement('r1', 'g', 'gpk', 'r', 'rpk', 'reply', { content: 'test' }), signature: 'sig' },
        { ...createEngagement('r1', 'g2', 'gpk2', 'r', 'rpk', 'witness'), signature: 'sig' },
        { ...createEngagement('r1', 'g3', 'gpk3', 'r', 'rpk', 'zap', { zapAmountSats: 1000 }), signature: 'sig' },
      ]
      const rewards = calculateEngagementRewards(engs)
      expect(rewards.engagementCount).toBe(3)
      expect(rewards.witnessCount).toBe(1)
      expect(rewards.totalGiverPoc).toBeGreaterThan(0)
      expect(rewards.totalReceiverXp).toBeGreaterThan(0)
      expect(rewards.totalZapSats).toBe(1000)
    })
  })
})
