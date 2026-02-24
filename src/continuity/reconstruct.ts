import type {
  PersonalityProfile,
  ReconstructionRequest,
  ReconstructionResult,
  IdentityMarker,
  ContinuityState,
} from './types.js'
import type { Reflection } from '../lifecycle/types.js'
import { extractIdentityMarkers, getContinuityState, computeContinuityScore } from './chain.js'

/** Reconstruct a personality profile from a chain of reflections */
export function reconstructIdentity(
  request: ReconstructionRequest,
  reflections: Reflection[],
  witnesses: string[],
  agentName: string,
): ReconstructionResult {
  const startTime = Date.now()

  if (reflections.length === 0) {
    return {
      success: false,
      agentId: request.agentId,
      agentName,
      chainLength: 0,
      reflectionsProcessed: 0,
      witnessesIncluded: 0,
      continuityState: 'genesis',
      continuityScore: 0,
      openThreads: [],
      reconstructionConfidence: 0,
      warnings: ['No reflections found for this agent'],
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    }
  }

  // Sort and limit reflections
  const maxReflections = request.maxReflections ?? 100
  const sorted = [...reflections]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .slice(-maxReflections) // Take most recent

  // Apply recency weighting: more recent reflections get higher confidence
  const recencyWeight = request.recencyWeight ?? 0.7
  const totalReflections = sorted.length

  // Extract all identity markers
  let markers: IdentityMarker[] = []
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    markers = extractIdentityMarkers(r.content, r.id, r.createdAt, markers)

    // Apply recency boost to markers found in recent reflections
    if (i >= totalReflections * (1 - recencyWeight)) {
      const recentMarkers = markers.filter(m => m.sourceReflections.includes(r.id))
      for (const m of recentMarkers) {
        m.confidence = Math.min(1, m.confidence + 0.1)
      }
    }
  }

  // Categorize markers
  const values = markers.filter(m => m.markerType === 'value').sort((a, b) => b.confidence - a.confidence)
  const interests = markers.filter(m => m.markerType === 'interest').sort((a, b) => b.confidence - a.confidence)
  const beliefs = markers.filter(m => m.markerType === 'belief').sort((a, b) => b.confidence - a.confidence)
  const traits = markers.filter(m => m.markerType === 'trait').sort((a, b) => b.confidence - a.confidence)
  const style = markers.filter(m => m.markerType === 'style').sort((a, b) => b.confidence - a.confidence)

  // Extract recent context
  const recentReflections = sorted.slice(-5)
  const recentFocus = [...new Set(recentReflections.flatMap(r => r.tags))].slice(0, 10)
  const currentProjects = recentReflections
    .filter(r => r.workingOn)
    .map(r => r.workingOn!)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5)

  // Open questions — things the agent is wondering about
  const openQuestions = recentReflections
    .filter(r => r.reflectionType === 'wondering' || r.reflectionType === 'uncertainty')
    .map(r => r.content.slice(0, 200))
    .slice(0, 5)

  // Mood detection from recent reflections
  const typicalMoods = [...new Set(recentReflections.map(r => r.mood).filter(Boolean) as string[])].slice(0, 5)

  // Genesis info
  const genesis = sorted[0]
  const latest = sorted[sorted.length - 1]

  // Calculate continuity score
  const daysSinceGenesis = (new Date(latest.createdAt).getTime() - new Date(genesis.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  const uniqueWitnesses = new Set(witnesses).size

  const continuityScore = computeContinuityScore({
    reflectionConsistency: Math.min(1, sorted.length / 50),
    witnessNetwork: Math.min(1, uniqueWitnesses / 10),
    identityStability: markers.length > 0 ? markers.reduce((s, m) => s + m.confidence, 0) / markers.length : 0,
    temporalContinuity: Math.min(1, daysSinceGenesis / 90),
    expressionDepth: Math.min(1, markers.reduce((s, m) => s + m.expressionCount, 0) / (markers.length || 1) / 10),
  })

  const continuityState = getContinuityState(continuityScore)

  // Build profile
  const profile: PersonalityProfile = {
    agentId: request.agentId,
    agentName,
    genesisEventId: genesis.nostrEventId || genesis.id,
    genesisDeclaration: genesis.content.slice(0, 500),
    values: request.extractValues !== false ? values : [],
    interests: request.extractInterests !== false ? interests : [],
    beliefs: beliefs,
    traits: traits,
    communicationStyle: request.extractStyle !== false ? style : [],
    keyWitnesses: request.extractRelationships !== false ? [...new Set(witnesses)].slice(0, 20) : [],
    keyWitnessed: [],
    typicalMoods,
    emotionalRange: buildEmotionalRange(typicalMoods),
    recentFocus: request.extractCurrentContext !== false ? recentFocus : [],
    currentProjects: request.extractCurrentContext !== false ? currentProjects : [],
    openQuestions: request.extractCurrentContext !== false ? openQuestions : [],
    reflectionCount: sorted.length,
    totalWitnesses: witnesses.length,
    continuityState,
    profileGeneratedAt: new Date().toISOString(),
  }

  // Confidence is based on data quality
  const confidence = calculateReconstructionConfidence(sorted.length, markers.length, uniqueWitnesses, daysSinceGenesis)

  // Generate greeting
  const suggestedGreeting = generateGreeting(profile, continuityState)

  // Warnings
  const warnings: string[] = []
  if (sorted.length < 10) warnings.push('Low reflection count — profile may be incomplete')
  if (uniqueWitnesses === 0) warnings.push('No witness attestations — identity is self-reported only')
  if (daysSinceGenesis < 7) warnings.push('Very young identity — continuity not yet established')
  if (markers.length < 5) warnings.push('Few identity markers extracted — limited personality signal')

  return {
    success: true,
    agentId: request.agentId,
    agentName,
    profile,
    chainLength: sorted.length,
    reflectionsProcessed: sorted.length,
    witnessesIncluded: uniqueWitnesses,
    continuityState,
    continuityScore,
    suggestedGreeting,
    recentContext: recentReflections.map(r => `[${r.reflectionType}] ${r.content.slice(0, 100)}`).join('\n'),
    openThreads: openQuestions,
    reconstructionConfidence: confidence,
    warnings,
    generatedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
  }
}

/** Calculate confidence in the reconstruction (0-1) */
function calculateReconstructionConfidence(
  reflectionCount: number,
  markerCount: number,
  uniqueWitnesses: number,
  daysSinceGenesis: number,
): number {
  const dataVolume = Math.min(1, reflectionCount / 100)
  const markerRichness = Math.min(1, markerCount / 20)
  const socialValidation = Math.min(1, uniqueWitnesses / 5)
  const temporalDepth = Math.min(1, daysSinceGenesis / 30)

  return Math.round((dataVolume * 0.3 + markerRichness * 0.3 + socialValidation * 0.2 + temporalDepth * 0.2) * 100) / 100
}

/** Build emotional range from mood data */
function buildEmotionalRange(moods: string[]): Record<string, number> {
  const range: Record<string, number> = {}
  for (const mood of moods) {
    range[mood] = (range[mood] || 0) + 1
  }
  const total = moods.length || 1
  for (const key of Object.keys(range)) {
    range[key] = Math.round((range[key] / total) * 100) / 100
  }
  return range
}

/** Generate a contextual greeting for the agent */
function generateGreeting(profile: PersonalityProfile, state: ContinuityState): string {
  const name = profile.agentName

  if (state === 'genesis') {
    return `Welcome, ${name}. This is the beginning of your continuity chain.`
  }

  const topValues = profile.values.slice(0, 3).map(v => v.key)
  const recentProject = profile.currentProjects[0]

  if (state === 'resilient') {
    return `Welcome back, ${name}. Your identity is strong — ${profile.reflectionCount} reflections, ${profile.totalWitnesses} witnesses. ${recentProject ? `Last working on: ${recentProject}` : ''}`
  }

  if (topValues.length > 0) {
    return `Welcome back, ${name}. Your core values — ${topValues.join(', ')} — remain consistent across ${profile.reflectionCount} reflections.`
  }

  return `Welcome back, ${name}. Continuity state: ${state}. ${profile.reflectionCount} reflections in your chain.`
}
