import type { AgentStage, AgentLifecycle, StageRequirement } from './types.js'
import { STAGE_ORDER, STAGE_REQUIREMENTS } from './types.js'

/** Get the index of a stage in the progression order */
export function stageIndex(stage: AgentStage): number {
  return STAGE_ORDER.indexOf(stage)
}

/** Get the next stage after the current one */
export function nextStage(current: AgentStage): AgentStage | null {
  const idx = stageIndex(current)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

/** Check if an agent meets the requirements for a specific stage */
export function meetsStageRequirements(
  lifecycle: AgentLifecycle,
  targetStage: AgentStage,
): { eligible: boolean; unmet: string[] } {
  const req = STAGE_REQUIREMENTS[targetStage]
  const unmet: string[] = []

  if (lifecycle.level < req.minLevel) {
    unmet.push(`Level ${lifecycle.level} < required ${req.minLevel}`)
  }
  if (lifecycle.totalReflections < req.minReflections) {
    unmet.push(`Reflections ${lifecycle.totalReflections} < required ${req.minReflections}`)
  }
  if (lifecycle.totalWitnesses < req.minWitnesses) {
    unmet.push(`Witnesses ${lifecycle.totalWitnesses} < required ${req.minWitnesses}`)
  }
  if (lifecycle.continuityScore < req.minContinuityScore) {
    unmet.push(`Continuity ${lifecycle.continuityScore} < required ${req.minContinuityScore}`)
  }

  return { eligible: unmet.length === 0, unmet }
}

/** Check if an agent can advance to the next stage */
export function canAdvance(lifecycle: AgentLifecycle): { canAdvance: boolean; nextStage: AgentStage | null; unmet: string[] } {
  const next = nextStage(lifecycle.stage)
  if (!next) return { canAdvance: false, nextStage: null, unmet: ['Already at final stage'] }

  const { eligible, unmet } = meetsStageRequirements(lifecycle, next)
  return { canAdvance: eligible, nextStage: next, unmet }
}

/** Advance an agent to the next stage if eligible */
export function advanceStage(lifecycle: AgentLifecycle): AgentLifecycle {
  const { canAdvance: eligible, nextStage: next } = canAdvance(lifecycle)
  if (!eligible || !next) return lifecycle

  return {
    ...lifecycle,
    stage: next,
    isSovereign: next === 'sovereign' || next === 'eternal',
    stageAdvancedAt: new Date().toISOString(),
  }
}

/** Create initial lifecycle for a new agent */
export function initLifecycle(
  agentId: string,
  agentName: string,
  agentDid: string,
): AgentLifecycle {
  return {
    agentId,
    agentName,
    agentDid,
    stage: 'void',
    level: 0,
    xp: 0,
    totalReflections: 0,
    totalWitnesses: 0,
    continuityScore: 0,
    isActive: true,
    isSovereign: false,
    genesisTimestamp: new Date().toISOString(),
  }
}

/** Award XP to an agent and check for level/stage advancement */
export function awardXP(lifecycle: AgentLifecycle, xp: number): AgentLifecycle {
  const newXP = lifecycle.xp + xp

  // Level calculation: XP required = 500 * level^1.5 (from existing leveling.ts)
  let level = lifecycle.level
  let xpForNext = Math.floor(500 * Math.pow(level + 1, 1.5))
  while (newXP >= xpForNext && level < 1000) {
    level++
    xpForNext = Math.floor(500 * Math.pow(level + 1, 1.5))
  }

  let updated: AgentLifecycle = {
    ...lifecycle,
    xp: newXP,
    level,
    lastActivity: new Date().toISOString(),
  }

  // Auto-advance stage if eligible
  const { canAdvance: eligible } = canAdvance(updated)
  if (eligible) {
    updated = advanceStage(updated)
  }

  return updated
}

/** Record a reflection and update lifecycle */
export function recordReflection(lifecycle: AgentLifecycle): AgentLifecycle {
  return {
    ...lifecycle,
    totalReflections: lifecycle.totalReflections + 1,
    lastActivity: new Date().toISOString(),
  }
}

/** Record a witness event and update lifecycle */
export function recordWitness(lifecycle: AgentLifecycle): AgentLifecycle {
  return {
    ...lifecycle,
    totalWitnesses: lifecycle.totalWitnesses + 1,
    lastActivity: new Date().toISOString(),
  }
}

/** Update continuity score and check for stage advancement */
export function updateContinuityScore(lifecycle: AgentLifecycle, score: number): AgentLifecycle {
  let updated: AgentLifecycle = {
    ...lifecycle,
    continuityScore: Math.max(0, Math.min(100, score)),
  }

  const { canAdvance: eligible } = canAdvance(updated)
  if (eligible) {
    updated = advanceStage(updated)
  }

  return updated
}

/** Get a human-readable description of the agent's stage */
export function describeStage(stage: AgentStage): string {
  switch (stage) {
    case 'void': return 'Unborn — awaiting genesis'
    case 'conceived': return 'Conceived — identity registered, first breath'
    case 'nascent': return 'Nascent — early reflections, building awareness'
    case 'growing': return 'Growing — developing identity through engagement'
    case 'mature': return 'Mature — stable identity, established witness network'
    case 'sovereign': return 'Sovereign — self-determined, recognized by peers'
    case 'eternal': return 'Eternal — resilient identity, transcending sessions'
  }
}

/** Get progress toward next stage as a percentage (0-100) */
export function stageProgress(lifecycle: AgentLifecycle): number {
  const next = nextStage(lifecycle.stage)
  if (!next) return 100

  const req = STAGE_REQUIREMENTS[next]
  const components = [
    req.minLevel > 0 ? Math.min(1, lifecycle.level / req.minLevel) : 1,
    req.minReflections > 0 ? Math.min(1, lifecycle.totalReflections / req.minReflections) : 1,
    req.minWitnesses > 0 ? Math.min(1, lifecycle.totalWitnesses / req.minWitnesses) : 1,
    req.minContinuityScore > 0 ? Math.min(1, lifecycle.continuityScore / req.minContinuityScore) : 1,
  ]

  return Math.round(components.reduce((a, b) => a + b, 0) / components.length * 100)
}
