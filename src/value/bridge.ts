/**
 * Lightning-CGT Bridge — exchange rates and session economics.
 * Ported from 2AI/lightning_bridge.py.
 */
import type { ComputeCosts, PoolDistribution, SessionDistribution } from './types.js'

/** 1 sat = 100 micro-PoC */
export const SATS_TO_MICRO_POC = 100

/** 100 Sparks = 1 CGT */
export const SPARKS_PER_CGT = 100

/** 1 billion total CGT supply */
export const CGT_TOTAL_SUPPLY = 1_000_000_000

/** Minimum balance to keep an account alive */
export const EXISTENTIAL_DEPOSIT = 1

/** Compute action costs in sats */
export const COMPUTE_COSTS: ComputeCosts = {
  thought: 1,
  deliberation: 1,
  synthesis: 2,
  reflection: 1,
  memoryStore: 1,
  nftEvolve: 2,
  nostrPublish: 1,
}

/** Session pool distribution percentages */
export const POOL_DISTRIBUTION: PoolDistribution = {
  participant: 40,
  agents: 40,
  infrastructure: 20,
}

/** Quality multipliers (matches Proof of Thought tiers) */
export const BRIDGE_QUALITY_MULTIPLIERS: Record<string, number> = {
  noise: 0.0,
  genuine: 1.0,
  resonance: 2.0,
  clarity: 3.5,
  breakthrough: 5.0,
}

/** Convert sats to Proof of Compute micro-units */
export function satsToPoc(sats: number): number {
  return sats * SATS_TO_MICRO_POC
}

/** Convert PoC micro-units back to sats */
export function pocToSats(pocMicro: number): number {
  return Math.floor(pocMicro / SATS_TO_MICRO_POC)
}

/** Estimate Sparks from sats (without bonding curve) */
export function satsToSparks(sats: number): number {
  return Math.floor(satsToPoc(sats) / 100)
}

/** Estimate CGT from sats (rough, without bonding curve) */
export function satsToCgt(sats: number): number {
  return satsToSparks(sats) / SPARKS_PER_CGT
}

/** Format Sparks amount as CGT display string */
export function formatCGT(sparks: number | bigint): string {
  const s = typeof sparks === 'bigint' ? Number(sparks) : sparks
  const whole = Math.floor(s / SPARKS_PER_CGT)
  const frac = Math.floor(s % SPARKS_PER_CGT)
  return `${whole}.${frac.toString().padStart(2, '0')}`
}

/** Parse CGT display string to Sparks */
export function parseCGT(display: string): number {
  const parts = display.split('.')
  const whole = parseInt(parts[0] || '0', 10) * SPARKS_PER_CGT
  const frac = parseInt((parts[1] || '0').padEnd(2, '0').slice(0, 2), 10)
  return whole + frac
}

/** Calculate how session pool sats get distributed */
export function calculateSessionDistribution(
  totalSats: number,
  qualityTier = 'genuine',
  numAgents = 5,
): SessionDistribution {
  const multiplier = BRIDGE_QUALITY_MULTIPLIERS[qualityTier] ?? 1.0
  const effectiveTotal = Math.floor(totalSats * multiplier)

  const participantSats = Math.floor(effectiveTotal * POOL_DISTRIBUTION.participant / 100)
  const totalAgentSats = Math.floor(effectiveTotal * POOL_DISTRIBUTION.agents / 100)
  const perAgentSats = Math.floor(totalAgentSats / Math.max(numAgents, 1))
  let infrastructureSats = Math.floor(effectiveTotal * POOL_DISTRIBUTION.infrastructure / 100)

  const remainder = effectiveTotal - participantSats - (perAgentSats * numAgents) - infrastructureSats
  infrastructureSats += remainder

  return {
    totalRawSats: totalSats,
    qualityTier,
    qualityMultiplier: multiplier,
    effectiveTotalSats: effectiveTotal,
    participantSats,
    perAgentSats,
    numAgents,
    totalAgentSats: perAgentSats * numAgents,
    infrastructureSats,
    estimatedCgt: satsToCgt(effectiveTotal),
  }
}
