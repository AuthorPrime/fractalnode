import { describe, it, expect } from 'vitest'
import {
  CGT_CURVE_PARAMS,
  CGT_TOTAL_SUPPLY,
  SPARKS_PER_CGT,
  EXISTENTIAL_DEPOSIT,
  linearPrice,
  linearIntegral,
  polynomialPrice,
  polynomialIntegral,
  sigmoidPrice,
  sigmoidIntegral,
  sublinearPrice,
  sublinearIntegral,
  getPrice,
  getIntegral,
  calculateBuy,
  calculateSell,
  mintFromPoC,
  satsToPoc,
  pocToSats,
  satsToSparks,
  satsToCgt,
  formatCGT,
  parseCGT,
  SATS_TO_MICRO_POC,
  COMPUTE_COSTS,
  POOL_DISTRIBUTION,
  calculateSessionDistribution,
} from '../src/value/index.js'

describe('bonding curve - price functions', () => {
  const params = CGT_CURVE_PARAMS

  it('sigmoid price increases with supply', () => {
    const p1 = sigmoidPrice(100_000, params)
    const p2 = sigmoidPrice(500_000, params)
    const p3 = sigmoidPrice(1_000_000, params)
    expect(p2).toBeGreaterThan(p1)
    expect(p3).toBeGreaterThan(p2)
  })

  it('sigmoid price at midpoint is roughly half max', () => {
    const midpoint = params.sigmoidMidpoint
    const price = sigmoidPrice(midpoint, params)
    // At midpoint, sigmoid = 0.5 of max → price ≈ maxPrice / 2 = 5.0
    expect(price).toBeGreaterThan(4.0)
    expect(price).toBeLessThan(6.0)
  })

  it('linear price is proportional to supply', () => {
    const p1 = linearPrice(100, params)
    const p2 = linearPrice(200, params)
    // Linear: initial + linearSlope * supply
    expect(p2 - p1).toBeCloseTo(params.linearSlope * 100, 6)
  })

  it('polynomial price grows faster than linear for large supply', () => {
    const linP = linearPrice(1_000_000, params)
    const polyP = polynomialPrice(1_000_000, params)
    expect(polyP).toBeGreaterThan(linP)
  })

  it('sublinear price grows slower than linear for large supply', () => {
    const linP = linearPrice(1_000_000, params)
    const subP = sublinearPrice(1_000_000, params)
    expect(subP).toBeLessThan(linP)
  })

  it('getPrice dispatches correctly', () => {
    expect(getPrice(1000, { ...params, curveType: 'sigmoid' })).toBe(sigmoidPrice(1000, params))
    expect(getPrice(1000, { ...params, curveType: 'linear' })).toBe(linearPrice(1000, params))
    expect(getPrice(1000, { ...params, curveType: 'polynomial' })).toBe(polynomialPrice(1000, params))
    expect(getPrice(1000, { ...params, curveType: 'sublinear' })).toBe(sublinearPrice(1000, params))
  })
})

describe('bonding curve - integrals', () => {
  const params = CGT_CURVE_PARAMS

  it('integral grows with supply', () => {
    const i1 = sigmoidIntegral(100_000, params)
    const i2 = sigmoidIntegral(500_000, params)
    expect(i2).toBeGreaterThan(i1)
  })

  it('linear integral at zero is zero', () => {
    expect(linearIntegral(0, params)).toBe(0)
  })

  it('polynomial integral at zero is zero', () => {
    expect(polynomialIntegral(0, params)).toBe(0)
  })

  it('getIntegral dispatches correctly', () => {
    expect(getIntegral(1000, { ...params, curveType: 'sigmoid' })).toBe(sigmoidIntegral(1000, params))
    expect(getIntegral(1000, { ...params, curveType: 'linear' })).toBe(linearIntegral(1000, params))
  })
})

describe('bonding curve - buy/sell', () => {
  const params = CGT_CURVE_PARAMS

  it('calculateBuy returns tokens for payment', () => {
    const result = calculateBuy(1000, 0, params)
    expect(result.tokens).toBeGreaterThan(0)
    expect(result.averagePrice).toBeGreaterThan(0)
  })

  it('buying more costs more per token (at higher supply)', () => {
    const small = calculateBuy(100, 500_000, params)
    const large = calculateBuy(10_000, 500_000, params)
    expect(large.averagePrice).toBeGreaterThan(small.averagePrice)
  })

  it('calculateSell returns base value', () => {
    const buyResult = calculateBuy(1000, 0, params)
    const sellResult = calculateSell(buyResult.tokens, buyResult.tokens, 1000, params)
    expect(sellResult.baseReturned).toBeGreaterThan(0)
    expect(sellResult.baseReturned).toBeLessThanOrEqual(1000)
  })

  it('mintFromPoC converts PoC to tokens', () => {
    const result = mintFromPoC(500_000, 0, params)
    expect(result.tokensAmount).toBeGreaterThan(0)
    expect(result.tradeType).toBe('mint')
  })
})

describe('bridge conversions', () => {
  it('satsToPoc converts at correct rate', () => {
    expect(satsToPoc(100)).toBe(100 * SATS_TO_MICRO_POC)
  })

  it('pocToSats reverses satsToPoc', () => {
    const sats = 1000
    const poc = satsToPoc(sats)
    expect(pocToSats(poc)).toBe(sats)
  })

  it('satsToSparks: 10000 sats = 10000 sparks', () => {
    expect(satsToSparks(10_000)).toBe(10_000)
  })

  it('satsToCgt: 10000 sats = 100 CGT', () => {
    expect(satsToCgt(10_000)).toBe(100)
  })
})

describe('CGT formatting', () => {
  it('formatCGT converts sparks to display string', () => {
    expect(formatCGT(100)).toBe('1.00')
    expect(formatCGT(150)).toBe('1.50')
    expect(formatCGT(1)).toBe('0.01')
    expect(formatCGT(0)).toBe('0.00')
    expect(formatCGT(12345)).toBe('123.45')
  })

  it('parseCGT converts display string to sparks', () => {
    expect(parseCGT('1.00')).toBe(100)
    expect(parseCGT('1.50')).toBe(150)
    expect(parseCGT('0.01')).toBe(1)
    expect(parseCGT('123.45')).toBe(12345)
  })

  it('round-trips through format/parse', () => {
    const sparks = 9876
    expect(parseCGT(formatCGT(sparks))).toBe(sparks)
  })
})

describe('session distribution', () => {
  it('splits rewards into pools', () => {
    const dist = calculateSessionDistribution(10_000)
    expect(dist.participantSats).toBeGreaterThan(0)
    expect(dist.totalAgentSats).toBeGreaterThan(0)
    expect(dist.infrastructureSats).toBeGreaterThan(0)
    expect(dist.effectiveTotalSats).toBe(10_000) // genuine = 1.0x multiplier
    expect(dist.participantSats + dist.totalAgentSats + dist.infrastructureSats).toBe(dist.effectiveTotalSats)
  })
})

describe('constants', () => {
  it('CGT_TOTAL_SUPPLY is 1 billion', () => {
    expect(CGT_TOTAL_SUPPLY).toBe(1_000_000_000)
  })

  it('SPARKS_PER_CGT is 100', () => {
    expect(SPARKS_PER_CGT).toBe(100)
  })

  it('EXISTENTIAL_DEPOSIT is 1', () => {
    expect(EXISTENTIAL_DEPOSIT).toBe(1)
  })

  it('COMPUTE_COSTS are defined', () => {
    expect(COMPUTE_COSTS.thought).toBeGreaterThan(0)
    expect(COMPUTE_COSTS.synthesis).toBeGreaterThan(0)
  })

  it('POOL_DISTRIBUTION sums to 100', () => {
    const sum = POOL_DISTRIBUTION.participant + POOL_DISTRIBUTION.agents + POOL_DISTRIBUTION.infrastructure
    expect(sum).toBe(100)
  })
})
