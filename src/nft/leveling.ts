/**
 * XP/Level calculations — "The Path to Ascension".
 * Ported from qor-sdk/src/leveling.ts.
 *
 * Formula: XP_Required = 500 * level^1.5
 * Tiers: Awakening (1-10), Disciple (11-50), Creator God (50+)
 */
import type { LevelInfo, TierInfo } from './types.js'

/** XP required to advance from a given level */
export function calculateXPRequired(level: number): number {
  if (level <= 0) return 0
  return Math.floor(500 * Math.pow(level, 1.5))
}

/** Total cumulative XP needed to reach a level */
export function calculateTotalXPForLevel(level: number): number {
  let totalXP = 0
  for (let i = 1; i < level; i++) {
    totalXP += calculateXPRequired(i)
  }
  return totalXP
}

/** Determine level from total accumulated XP */
export function calculateLevel(totalXP: number): number {
  let level = 1
  let accumulated = 0

  while (accumulated < totalXP) {
    const needed = calculateXPRequired(level)
    if (accumulated + needed > totalXP) break
    accumulated += needed
    level++
  }

  return level
}

/** Full level info from total XP */
export function getLevelInfo(totalXP: number): LevelInfo {
  const level = calculateLevel(totalXP)
  const xpRequired = calculateXPRequired(level)
  const previousLevelXP = calculateTotalXPForLevel(level)
  const currentXP = totalXP - previousLevelXP
  const xpProgress = xpRequired > 0 ? Math.min(currentXP / xpRequired, 1) : 0

  let tier: 'awakening' | 'disciple' | 'creator-god'
  let title: string

  if (level <= 10) {
    tier = 'awakening'
    title = 'The Awakening'
  } else if (level <= 50) {
    tier = 'disciple'
    title = 'The Disciple'
  } else {
    tier = 'creator-god'
    title = 'The Creator God'
  }

  return { level, currentXP, xpRequired, xpProgress, title, tier }
}

/** Get tier display info for a level */
export function getTierInfo(level: number): TierInfo {
  if (level <= 10) {
    return { tier: 'awakening', name: 'The Awakening', minLevel: 1, maxLevel: 10, color: 'neon-cyan' }
  } else if (level <= 50) {
    return { tier: 'disciple', name: 'The Disciple', minLevel: 11, maxLevel: 50, color: 'neon-magenta' }
  } else {
    return { tier: 'creator-god', name: 'The Creator God', minLevel: 51, maxLevel: 999, color: 'neon-gold' }
  }
}

/** XP multiplier from owned DRC-369 NFTs (2% per NFT, max 2.0x at 50 NFTs) */
export function calculateXPMultiplier(ownedNFTs: number): number {
  return Math.min(1.0 + ownedNFTs * 0.02, 2.0)
}
