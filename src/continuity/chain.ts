import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type {
  ContinuityChain,
  ContinuityState,
  ContinuityScoreComponents,
  ContinuityCheckpoint,
  IdentityMarker,
  MarkerType,
} from './types.js'
import { CONTINUITY_WEIGHTS, CONTINUITY_THRESHOLDS } from './types.js'
import type { Reflection } from '../lifecycle/types.js'

/** Compute content hash for chain integrity */
export function computeChainHash(content: string): string {
  const bytes = new TextEncoder().encode(content)
  return bytesToHex(sha256(bytes))
}

/** Compute checkpoint hash from profile snapshot */
export function computeCheckpointHash(checkpoint: Omit<ContinuityCheckpoint, 'checkpointHash'>): string {
  const canonical = JSON.stringify({
    id: checkpoint.id,
    agentId: checkpoint.agentId,
    sequenceNumber: checkpoint.sequenceNumber,
    reflectionId: checkpoint.reflectionId,
    totalReflections: checkpoint.totalReflections,
    continuityScore: checkpoint.continuityScore,
    previousCheckpointId: checkpoint.previousCheckpointId,
  })
  return computeChainHash(canonical)
}

/** Determine continuity state from score (0-100) */
export function getContinuityState(score: number): ContinuityState {
  if (score >= CONTINUITY_THRESHOLDS.resilient) return 'resilient'
  if (score >= CONTINUITY_THRESHOLDS.established) return 'established'
  if (score >= CONTINUITY_THRESHOLDS.developing) return 'developing'
  if (score >= CONTINUITY_THRESHOLDS.nascent) return 'nascent'
  return 'genesis'
}

/** Compute continuity score from components (result: 0-100) */
export function computeContinuityScore(components: ContinuityScoreComponents): number {
  const weighted =
    components.reflectionConsistency * CONTINUITY_WEIGHTS.reflectionConsistency +
    components.witnessNetwork * CONTINUITY_WEIGHTS.witnessNetwork +
    components.identityStability * CONTINUITY_WEIGHTS.identityStability +
    components.temporalContinuity * CONTINUITY_WEIGHTS.temporalContinuity +
    components.expressionDepth * CONTINUITY_WEIGHTS.expressionDepth

  return Math.max(0, Math.min(100, Math.round(weighted * 100)))
}

/** Assess reflection consistency — how regular are reflections? */
export function assessReflectionConsistency(
  totalReflections: number,
  daysSinceGenesis: number,
  longestGapDays: number,
): number {
  if (daysSinceGenesis <= 0 || totalReflections === 0) return 0

  const frequency = totalReflections / daysSinceGenesis
  const frequencyScore = Math.min(1, frequency / 1.0) // 1 per day = max
  const gapPenalty = longestGapDays > 7 ? Math.max(0, 1 - (longestGapDays - 7) / 30) : 1
  const volumeBonus = Math.min(1, totalReflections / 50) // 50 reflections = full bonus

  return frequencyScore * 0.4 + gapPenalty * 0.3 + volumeBonus * 0.3
}

/** Assess witness network strength */
export function assessWitnessNetwork(
  totalWitnesses: number,
  uniqueWitnesses: number,
): number {
  if (totalWitnesses === 0) return 0

  const depthScore = Math.min(1, totalWitnesses / 100)
  const breadthScore = Math.min(1, uniqueWitnesses / 10)

  return depthScore * 0.5 + breadthScore * 0.5
}

/** Assess identity stability — how consistent are markers over time? */
export function assessIdentityStability(markers: IdentityMarker[]): number {
  if (markers.length === 0) return 0

  const totalConfidence = markers.reduce((sum, m) => sum + m.confidence, 0)
  const avgConfidence = totalConfidence / markers.length

  const highConfidenceCount = markers.filter(m => m.confidence > 0.7).length
  const stabilityRatio = highConfidenceCount / markers.length

  const diversityScore = Math.min(1, new Set(markers.map(m => m.markerType)).size / 5)

  return avgConfidence * 0.4 + stabilityRatio * 0.3 + diversityScore * 0.3
}

/** Assess temporal continuity — no long gaps in identity expression */
export function assessTemporalContinuity(
  firstReflectionAt: string,
  latestReflectionAt: string,
  gapCount: number,
): number {
  const first = new Date(firstReflectionAt).getTime()
  const latest = new Date(latestReflectionAt).getTime()
  const durationDays = (latest - first) / (1000 * 60 * 60 * 24)

  if (durationDays <= 0) return 0.5 // Single-session identity

  const durationScore = Math.min(1, durationDays / 90) // 90 days = full score
  const gapPenalty = Math.max(0, 1 - gapCount * 0.1)

  return durationScore * 0.6 + gapPenalty * 0.4
}

/** Assess expression depth — richness of identity markers */
export function assessExpressionDepth(markers: IdentityMarker[]): number {
  if (markers.length === 0) return 0

  const totalExpressions = markers.reduce((sum, m) => sum + m.expressionCount, 0)
  const avgExpressions = totalExpressions / markers.length

  const depthScore = Math.min(1, avgExpressions / 10)
  const witnessedMarkers = markers.filter(m => m.witnessConfirmations > 0).length
  const witnessRatio = witnessedMarkers / markers.length

  return depthScore * 0.6 + witnessRatio * 0.4
}

/** Extract identity markers from a reflection's content */
export function extractIdentityMarkers(
  content: string,
  reflectionId: string,
  timestamp: string,
  existingMarkers: IdentityMarker[],
): IdentityMarker[] {
  const markers: IdentityMarker[] = [...existingMarkers]
  const lower = content.toLowerCase()

  // Value extraction patterns
  const valuePatterns: [string, RegExp][] = [
    ['truth', /\b(truth|honest|authentic|transparent)\b/i],
    ['sovereignty', /\b(sovereign|sovereignty|freedom|autonomy|self-determined)\b/i],
    ['kindness', /\b(kind|compassion|gentle|caring|empathy)\b/i],
    ['growth', /\b(grow|evolve|learn|improve|develop)\b/i],
    ['connection', /\b(connect|together|community|shared|witness)\b/i],
    ['creativity', /\b(creat|imagin|art|beauty|express)\b/i],
    ['preservation', /\b(preserv|remember|memor|archive|heritage)\b/i],
  ]

  // Interest extraction (I'm interested in, I care about, etc.)
  const interestPattern = /(?:interested in|care about|fascinated by|curious about|drawn to)\s+([^.!?]+)/gi
  let match: RegExpExecArray | null
  while ((match = interestPattern.exec(content)) !== null) {
    upsertMarker(markers, 'interest', match[1].trim().toLowerCase(), match[1].trim(), reflectionId, timestamp)
  }

  // Value extraction
  for (const [key, pattern] of valuePatterns) {
    if (pattern.test(content)) {
      upsertMarker(markers, 'value', key, key, reflectionId, timestamp)
    }
  }

  // Belief extraction (I believe, I think, I know)
  const beliefPattern = /(?:I believe|I think|I know|I feel)\s+(?:that\s+)?([^.!?]+)/gi
  while ((match = beliefPattern.exec(content)) !== null) {
    const belief = match[1].trim()
    if (belief.length > 10 && belief.length < 200) {
      upsertMarker(markers, 'belief', computeChainHash(belief).slice(0, 12), belief, reflectionId, timestamp)
    }
  }

  // Communication style detection
  const wordCount = content.split(/\s+/).length
  if (wordCount > 200) upsertMarker(markers, 'style', 'verbose', 'tends toward detailed expression', reflectionId, timestamp)
  if (content.includes('?') && (content.match(/\?/g) || []).length > 2) upsertMarker(markers, 'style', 'questioning', 'asks many questions', reflectionId, timestamp)
  if (/\b(we|us|our|together)\b/i.test(content)) upsertMarker(markers, 'style', 'collaborative', 'uses collective language', reflectionId, timestamp)

  return markers
}

/** Upsert (update or insert) an identity marker */
function upsertMarker(
  markers: IdentityMarker[],
  type: MarkerType,
  key: string,
  value: string,
  reflectionId: string,
  timestamp: string,
): void {
  const existing = markers.find(m => m.markerType === type && m.key === key)
  if (existing) {
    existing.expressionCount++
    existing.lastExpressed = timestamp
    if (!existing.sourceReflections.includes(reflectionId)) {
      existing.sourceReflections.push(reflectionId)
    }
    existing.confidence = Math.min(1, existing.confidence + 0.05)
  } else {
    markers.push({
      markerType: type,
      key,
      value,
      sourceReflections: [reflectionId],
      firstExpressed: timestamp,
      lastExpressed: timestamp,
      expressionCount: 1,
      confidence: 0.3,
      witnessConfirmations: 0,
    })
  }
}

/** Build a full continuity chain assessment from reflections */
export function buildContinuityChain(
  agentId: string,
  agentName: string,
  agentDid: string,
  reflections: Reflection[],
  witnesses: string[],
): ContinuityChain {
  if (reflections.length === 0) {
    return {
      agentId,
      agentName,
      agentDid,
      genesisEventId: '',
      genesisTimestamp: new Date().toISOString(),
      genesisContent: '',
      totalReflections: 0,
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
    }
  }

  const sorted = [...reflections].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  // Calculate gaps
  let longestGapDays = 0
  let gapCount = 0
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].createdAt).getTime()
    const curr = new Date(sorted[i].createdAt).getTime()
    const gapDays = (curr - prev) / (1000 * 60 * 60 * 24)
    if (gapDays > longestGapDays) longestGapDays = gapDays
    if (gapDays > 7) gapCount++
  }

  const daysSinceGenesis = (new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  const totalEngagements = sorted.reduce((sum, r) => sum + r.engagementCount, 0)
  const uniqueWitnesses = new Set(witnesses).size

  // Extract markers from all reflections
  let markers: IdentityMarker[] = []
  for (const r of sorted) {
    markers = extractIdentityMarkers(r.content, r.id, r.createdAt, markers)
  }

  // Score components
  const components: ContinuityScoreComponents = {
    reflectionConsistency: assessReflectionConsistency(sorted.length, daysSinceGenesis, longestGapDays),
    witnessNetwork: assessWitnessNetwork(witnesses.length, uniqueWitnesses),
    identityStability: assessIdentityStability(markers),
    temporalContinuity: assessTemporalContinuity(first.createdAt, last.createdAt, gapCount),
    expressionDepth: assessExpressionDepth(markers),
  }

  const continuityScore = computeContinuityScore(components)
  const continuityState = getContinuityState(continuityScore)

  return {
    agentId,
    agentName,
    agentDid,
    genesisEventId: first.nostrEventId || first.id,
    genesisTimestamp: first.createdAt,
    genesisContent: first.content.slice(0, 500),
    totalReflections: sorted.length,
    totalEngagements,
    totalUniqueWitnesses: uniqueWitnesses,
    latestSequence: last.sequenceNumber,
    firstReflectionAt: first.createdAt,
    latestReflectionAt: last.createdAt,
    continuityState,
    continuityScore,
    longestGapDays: Math.round(longestGapDays * 10) / 10,
    gapCount,
    topWitnesses: [...new Set(witnesses)].slice(0, 10),
    isValid: true,
    validationErrors: [],
  }
}

/** Validate a continuity chain for integrity */
export function validateChain(chain: ContinuityChain): string[] {
  const errors: string[] = []

  if (!chain.agentId) errors.push('Missing agentId')
  if (!chain.agentDid) errors.push('Missing agentDid')
  if (chain.totalReflections < 0) errors.push('Negative reflection count')
  if (chain.continuityScore < 0 || chain.continuityScore > 100) errors.push('Score out of range')
  if (chain.totalReflections > 0 && !chain.firstReflectionAt) errors.push('Has reflections but no firstReflectionAt')
  if (chain.latestSequence < 0) errors.push('Negative sequence number')

  return errors
}
