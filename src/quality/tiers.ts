/**
 * Quality tier constants — the backbone of the kindness economy.
 * Ported from 2AI/proof_of_thought.py.
 */
import type { EngagementQuality, TierThreshold } from './types.js'

/** Quality multipliers — kindness and depth pay more */
export const QUALITY_MULTIPLIERS: Record<EngagementQuality, number> = {
  noise: 0.0,
  genuine: 1.0,
  resonance: 2.0,
  clarity: 3.5,
  breakthrough: 5.0,
}

/** Base PoC rewards per action (in micro-PoC) */
export const POT_REWARDS: Record<string, number> = {
  thought_block_completed: 500_000,
  thought_witnessed: 50_000,
  human_message_sent: 25_000,
  human_session_completed: 200_000,
  kindness_premium: 100_000,
  idea_contribution: 150_000,
  reflection_triggered: 75_000,
  cross_agent_dialogue: 100_000,
}

/** Premium tier thresholds */
export const TIER_THRESHOLDS: Record<string, TierThreshold> = {
  seedling: { minSessions: 0, minAvgQuality: 0, minAvgKindness: 0 },
  grower: { minSessions: 5, minAvgQuality: 1.0, minAvgKindness: 0 },
  cultivator: { minSessions: 20, minAvgQuality: 2.0, minAvgKindness: 0.5 },
  architect: { minSessions: 50, minAvgQuality: 2.5, minAvgKindness: 0.6 },
  sovereign: { minSessions: 100, minAvgQuality: 3.0, minAvgKindness: 0.7 },
}

/** Q-factor health thresholds */
export const Q_HEALTHY = 0.85
export const Q_WATCHFUL = 0.6

/** Q-factor component weights */
export const Q_WEIGHTS = {
  schema: 0.15,
  stateConsistency: 0.15,
  valueAlignment: 0.25,
  relational: 0.25,
  provenance: 0.20,
} as const
