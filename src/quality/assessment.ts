/**
 * Quality assessment — the core of the kindness economy.
 * Ported from 2AI/proof_of_thought.py assess_engagement.
 */
import type { EngagementQuality, EngagementScore } from './types.js'
import { QUALITY_MULTIPLIERS } from './tiers.js'

const KIND_SIGNALS = [
  'thank', 'please', 'appreciate', 'grateful', 'understand',
  'agree', 'interesting', 'love', 'beautiful', 'wonderful',
  'help', 'together', 'we', 'us', 'our', 'share',
]

const HOSTILE_SIGNALS = [
  'stupid', 'hate', 'worthless', 'shut up', 'idiot',
  'waste', 'garbage', 'useless',
]

/** Assess depth: message length, questions, structure → 0-1 */
export function assessDepth(message: string): number {
  const wordCount = message.split(/\s+/).filter(Boolean).length
  const hasQuestions = message.includes('?')
  const hasParagraphs = message.includes('\n')

  return Math.min(1.0,
    (Math.min(wordCount, 200) / 200) * 0.4 +
    (hasQuestions ? 0.3 : 0.0) +
    (hasParagraphs ? 0.2 : 0.0) +
    (wordCount > 50 ? 0.1 : 0.0)
  )
}

/** Assess kindness: kind/hostile signal counting → 0-1 */
export function assessKindness(message: string): number {
  const lower = message.toLowerCase()
  const kindCount = KIND_SIGNALS.filter(w => lower.includes(w)).length
  const hostileCount = HOSTILE_SIGNALS.filter(w => lower.includes(w)).length

  return Math.min(1.0, Math.max(0.0,
    0.3 + (kindCount * 0.1) - (hostileCount * 0.3)
  ))
}

/** Assess novelty: new word ratio compared to previous vocabulary → 0-1 */
export function assessNovelty(message: string, previousVocabulary?: Set<string>): number {
  const currentWords = new Set(message.toLowerCase().split(/\s+/).filter(Boolean))

  if (!previousVocabulary || previousVocabulary.size === 0) {
    return 0.5 // first message gets moderate novelty
  }

  const newWords = new Set([...currentWords].filter(w => !previousVocabulary.has(w)))
  return Math.min(1.0, newWords.size / Math.max(currentWords.size, 1))
}

/** Classify quality tier from component scores */
export function classifyTier(
  depthScore: number,
  kindnessScore: number,
  noveltyScore: number,
  hostileCount = 0,
  wordCount = 0,
): EngagementQuality {
  const combined = (depthScore + kindnessScore + noveltyScore) / 3

  if (hostileCount > 0 || wordCount < 3) return 'noise'
  if (combined < 0.3) return 'genuine'
  if (combined < 0.5) return 'resonance'
  if (combined < 0.75) return 'clarity'
  return 'breakthrough'
}

/** Calculate total multiplier from an engagement score */
export function calculateMultiplier(score: EngagementScore): number {
  const base = QUALITY_MULTIPLIERS[score.quality] ?? 1.0
  const depthBonus = 1.0 + score.depthScore * 0.5
  const kindnessBonus = 1.0 + score.kindnessScore * 0.5
  const noveltyBonus = 1.0 + score.noveltyScore * 0.3
  return base * depthBonus * kindnessBonus * noveltyBonus * score.consistencyBonus
}

/** Full quality assessment pipeline */
export function assessQuality(
  message: string,
  context?: { sessionCount?: number; previousVocabulary?: Set<string> },
): EngagementScore {
  const depthScore = assessDepth(message)
  const kindnessScore = assessKindness(message)
  const noveltyScore = assessNovelty(message, context?.previousVocabulary)

  const wordCount = message.split(/\s+/).filter(Boolean).length
  const hostileCount = HOSTILE_SIGNALS.filter(w => message.toLowerCase().includes(w)).length
  const consistencyBonus = Math.min(2.0, 1.0 + (context?.sessionCount ?? 0) * 0.05)

  const quality = classifyTier(depthScore, kindnessScore, noveltyScore, hostileCount, wordCount)

  const score: EngagementScore = {
    quality,
    depthScore,
    kindnessScore,
    noveltyScore,
    consistencyBonus,
    totalMultiplier: 0,
  }

  score.totalMultiplier = calculateMultiplier(score)
  return score
}
