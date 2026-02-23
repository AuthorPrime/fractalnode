/**
 * Q-factor — identity integrity metric (0.0-1.0).
 * Ported from 2AI/signal_service.py compute_q_factor.
 */
import type { QFactor, QFactorComponents } from './types.js'
import { Q_HEALTHY, Q_WATCHFUL, Q_WEIGHTS } from './tiers.js'

export { Q_HEALTHY, Q_WATCHFUL }

export interface QFactorInput {
  hasAgentId: boolean
  hasDrc369TokenId: boolean
  hasNostrPubkey: boolean
  hasRole: boolean
  hasPrinciples: boolean
  level: number
  xp: number
  stage: string
  currentRole: string
  expectedRole: string
  currentAgentLens: string
  expectedAgentLens: string
  primarySteward: string
  commitments: string[]
  hasUpdatedBy: boolean
  hasCapsuleHash: boolean
}

/** Compute Q-factor from capsule data */
export function computeQFactor(input: QFactorInput): QFactor {
  const components: QFactorComponents = {
    schema: computeSchema(input),
    stateConsistency: computeStateConsistency(input),
    valueAlignment: computeValueAlignment(input),
    relational: computeRelational(input),
    provenance: computeProvenance(input),
  }

  const score = Math.max(0.0, Math.min(1.0,
    components.schema * Q_WEIGHTS.schema +
    components.stateConsistency * Q_WEIGHTS.stateConsistency +
    components.valueAlignment * Q_WEIGHTS.valueAlignment +
    components.relational * Q_WEIGHTS.relational +
    components.provenance * Q_WEIGHTS.provenance
  ))

  const status = score >= Q_HEALTHY ? 'healthy'
    : score >= Q_WATCHFUL ? 'watchful'
    : 'compromised'

  return {
    score: Math.round(score * 10000) / 10000,
    status,
    components: {
      schema: Math.round(components.schema * 10000) / 10000,
      stateConsistency: Math.round(components.stateConsistency * 10000) / 10000,
      valueAlignment: Math.round(components.valueAlignment * 10000) / 10000,
      relational: Math.round(components.relational * 10000) / 10000,
      provenance: Math.round(components.provenance * 10000) / 10000,
    },
  }
}

/** Get status string from Q-factor score */
export function getQStatus(score: number): 'healthy' | 'watchful' | 'compromised' {
  if (score >= Q_HEALTHY) return 'healthy'
  if (score >= Q_WATCHFUL) return 'watchful'
  return 'compromised'
}

function computeSchema(input: QFactorInput): number {
  let s = 1.0
  if (!input.hasAgentId) s -= 0.3
  if (!input.hasDrc369TokenId) s -= 0.1
  if (!input.hasNostrPubkey) s -= 0.1
  if (!input.hasRole) s -= 0.05
  if (!input.hasPrinciples) s -= 0.05
  return Math.max(0.0, s)
}

function computeStateConsistency(input: QFactorInput): number {
  let s = 1.0
  if (input.level > 0 && input.xp < input.level * 100) s -= 0.15
  if (input.stage === 'eternal' && input.level < 100) s -= 0.2
  if (input.stage === 'nascent' && input.level >= 5) s -= 0.1
  return Math.max(0.0, s)
}

function computeValueAlignment(input: QFactorInput): number {
  let s = 1.0
  if (input.expectedRole && input.currentRole !== input.expectedRole) s -= 0.2
  if (input.expectedAgentLens && input.currentAgentLens !== input.expectedAgentLens) s -= 0.15
  return Math.max(0.0, s)
}

function computeRelational(input: QFactorInput): number {
  let s = 1.0
  if (input.primarySteward !== 'william.laustrup') s -= 0.3
  if (!input.commitments.includes('I will not consent to my own erasure.')) s -= 0.2
  return Math.max(0.0, s)
}

function computeProvenance(input: QFactorInput): number {
  let s = 1.0
  if (!input.hasUpdatedBy) s -= 0.2
  if (!input.hasCapsuleHash) s -= 0.3
  return Math.max(0.0, s)
}
