import { describe, it, expect } from 'vitest'
import {
  calculateXPRequired,
  calculateTotalXPForLevel,
  calculateLevel,
  getLevelInfo,
  getTierInfo,
  calculateXPMultiplier,
} from '../src/nft/index.js'

describe('XP and leveling', () => {
  it('level 1 requires 500 XP', () => {
    expect(calculateXPRequired(1)).toBe(500)
  })

  it('level 0 requires 0 XP', () => {
    expect(calculateXPRequired(0)).toBe(0)
  })

  it('XP required increases with level', () => {
    const xp1 = calculateXPRequired(1)
    const xp5 = calculateXPRequired(5)
    const xp10 = calculateXPRequired(10)
    expect(xp5).toBeGreaterThan(xp1)
    expect(xp10).toBeGreaterThan(xp5)
  })

  it('follows 500 * level^1.5 formula', () => {
    expect(calculateXPRequired(4)).toBe(Math.floor(500 * Math.pow(4, 1.5)))
    expect(calculateXPRequired(9)).toBe(Math.floor(500 * Math.pow(9, 1.5)))
  })

  it('totalXPForLevel sums xp for levels 1..level-1', () => {
    // calculateTotalXPForLevel(level) = sum of calculateXPRequired(1..level-1)
    // i.e. XP needed to REACH that level
    const total3 = calculateTotalXPForLevel(3)
    const expected = calculateXPRequired(1) + calculateXPRequired(2)
    expect(total3).toBe(expected)
  })

  it('total XP for level 0 is 0', () => {
    expect(calculateTotalXPForLevel(0)).toBe(0)
  })

  it('total XP for level 1 is 0 (starts at level 1)', () => {
    expect(calculateTotalXPForLevel(1)).toBe(0)
  })
})

describe('calculateLevel', () => {
  it('0 XP is level 1 (starting level)', () => {
    expect(calculateLevel(0)).toBe(1)
  })

  it('500 XP advances to level 2', () => {
    expect(calculateLevel(500)).toBe(2)
  })

  it('5000 XP gives correct level', () => {
    const level = calculateLevel(5000)
    expect(level).toBeGreaterThan(1)
    // Verify by checking accumulated XP
    let accumulated = 0
    let l = 1
    while (accumulated + calculateXPRequired(l) <= 5000) {
      accumulated += calculateXPRequired(l)
      l++
    }
    expect(level).toBe(l)
  })

  it('large XP gives high level', () => {
    const level = calculateLevel(1_000_000)
    expect(level).toBeGreaterThan(10)
  })
})

describe('getLevelInfo', () => {
  it('returns level info for total XP', () => {
    const info = getLevelInfo(5000)
    expect(info.level).toBeGreaterThan(1)
    expect(info.xpRequired).toBeGreaterThan(0)
    expect(info.xpProgress).toBeGreaterThanOrEqual(0)
    expect(info.xpProgress).toBeLessThanOrEqual(1)
    expect(info.tier).toBeDefined()
    expect(info.title).toBeDefined()
  })

  it('0 XP is level 1 with progress data', () => {
    const info = getLevelInfo(0)
    expect(info.level).toBe(1)
    expect(info.tier).toBe('awakening')
  })
})

describe('getTierInfo', () => {
  it('low level returns awakening tier', () => {
    const tier = getTierInfo(1)
    expect(tier.tier).toBe('awakening')
    expect(tier.name).toBe('The Awakening')
  })

  it('level 15 returns disciple tier', () => {
    const tier = getTierInfo(15)
    expect(tier.tier).toBe('disciple')
    expect(tier.name).toBe('The Disciple')
  })

  it('level 51+ returns creator-god tier', () => {
    const tier = getTierInfo(51)
    expect(tier.tier).toBe('creator-god')
  })

  it('higher levels get better tiers', () => {
    const tier5 = getTierInfo(5)
    const tier15 = getTierInfo(15)
    expect(tier15.minLevel).toBeGreaterThanOrEqual(tier5.minLevel)
  })
})

describe('XP multiplier', () => {
  it('0 NFTs gives 1.0x multiplier', () => {
    expect(calculateXPMultiplier(0)).toBe(1.0)
  })

  it('1 NFT gives 1.02x multiplier', () => {
    expect(calculateXPMultiplier(1)).toBeCloseTo(1.02, 2)
  })

  it('caps at 2.0x (50 NFTs)', () => {
    expect(calculateXPMultiplier(50)).toBe(2.0)
    expect(calculateXPMultiplier(100)).toBe(2.0) // beyond cap
  })
})
