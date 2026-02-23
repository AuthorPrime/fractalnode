/**
 * Bonding Curve Math — all 4 curve types.
 * Ported from 2AI/bonding_curve.py (BondingCurveMath class).
 */
import type { CurveParams, TradeResult } from './types.js'

/** Default CGT curve parameters (sigmoid) */
export const CGT_CURVE_PARAMS: CurveParams = {
  curveType: 'sigmoid',
  initialPrice: 0.001,
  reserveRatio: 0.5,
  linearSlope: 0.0001,
  polyCoefficient: 0.001,
  polyExponent: 2.0,
  sigmoidMaxPrice: 10.0,
  sigmoidMidpoint: 1_000_000,
  sigmoidSteepness: 0.000005,
  sublinearCoefficient: 0.01,
  sublinearRoot: 2.0,
  maxSupply: 1_000_000_000,
}

// ─── Price Functions ───

export function linearPrice(supply: number, params: CurveParams): number {
  return params.initialPrice + params.linearSlope * supply
}

export function linearIntegral(supply: number, params: CurveParams): number {
  return params.initialPrice * supply + 0.5 * params.linearSlope * supply ** 2
}

export function polynomialPrice(supply: number, params: CurveParams): number {
  if (supply <= 0) return params.initialPrice
  return Math.max(params.initialPrice, params.polyCoefficient * supply ** params.polyExponent)
}

export function polynomialIntegral(supply: number, params: CurveParams): number {
  const n = params.polyExponent
  return params.polyCoefficient * supply ** (n + 1) / (n + 1)
}

export function sigmoidPrice(supply: number, params: CurveParams): number {
  const L = params.sigmoidMaxPrice
  const k = params.sigmoidSteepness
  const S0 = params.sigmoidMidpoint
  const exponent = Math.max(-500, Math.min(500, -k * (supply - S0)))
  const price = L / (1 + Math.exp(exponent))
  return Math.max(params.initialPrice, price)
}

export function sigmoidIntegral(supply: number, params: CurveParams): number {
  const L = params.sigmoidMaxPrice
  const k = params.sigmoidSteepness
  const S0 = params.sigmoidMidpoint
  const x = k * (supply - S0)
  if (x > 500) return (L / k) * x
  if (x < -500) return 0
  return (L / k) * Math.log(1 + Math.exp(x))
}

export function sublinearPrice(supply: number, params: CurveParams): number {
  if (supply <= 0) return params.initialPrice
  return Math.max(params.initialPrice, params.sublinearCoefficient * supply ** (1 / params.sublinearRoot))
}

export function sublinearIntegral(supply: number, params: CurveParams): number {
  const r = 1 / params.sublinearRoot
  return params.sublinearCoefficient * supply ** (r + 1) / (r + 1)
}

// ─── Dispatch ───

export function getPrice(supply: number, params: CurveParams): number {
  switch (params.curveType) {
    case 'linear': return linearPrice(supply, params)
    case 'polynomial': return polynomialPrice(supply, params)
    case 'sigmoid': return sigmoidPrice(supply, params)
    case 'sublinear': return sublinearPrice(supply, params)
    default: return params.initialPrice
  }
}

export function getIntegral(supply: number, params: CurveParams): number {
  switch (params.curveType) {
    case 'linear': return linearIntegral(supply, params)
    case 'polynomial': return polynomialIntegral(supply, params)
    case 'sigmoid': return sigmoidIntegral(supply, params)
    case 'sublinear': return sublinearIntegral(supply, params)
    default: return supply * params.initialPrice
  }
}

// ─── Trade Calculations ───

/** Calculate tokens received for a given base amount (binary search) */
export function calculateBuy(
  baseAmount: number,
  currentSupply: number,
  params: CurveParams,
): { tokens: number; averagePrice: number } {
  if (baseAmount <= 0) return { tokens: 0, averagePrice: 0 }

  const currentReserve = getIntegral(currentSupply, params)
  const targetReserve = currentReserve + baseAmount

  let low = currentSupply
  let high = params.maxSupply
  while (high - low > 0.0001) {
    const mid = (low + high) / 2
    if (getIntegral(mid, params) < targetReserve) {
      low = mid
    } else {
      high = mid
    }
  }

  const tokens = high - currentSupply
  const averagePrice = tokens > 0 ? baseAmount / tokens : 0
  return { tokens, averagePrice }
}

/** Calculate base received for selling tokens */
export function calculateSell(
  tokensAmount: number,
  currentSupply: number,
  reserveBalance: number,
  params: CurveParams,
): { baseReturned: number; averagePrice: number } {
  if (tokensAmount <= 0 || tokensAmount > currentSupply) return { baseReturned: 0, averagePrice: 0 }

  const currentReserve = getIntegral(currentSupply, params)
  const newReserve = getIntegral(currentSupply - tokensAmount, params)
  let baseReturned = (currentReserve - newReserve) * params.reserveRatio
  baseReturned = Math.min(baseReturned, reserveBalance)

  const averagePrice = tokensAmount > 0 ? baseReturned / tokensAmount : 0
  return { baseReturned, averagePrice }
}

/** Mint CGT from Proof of Compute (free mint — supply increases, no reserve added) */
export function mintFromPoC(
  pocAmount: number,
  currentSupply: number,
  params: CurveParams,
): TradeResult {
  const pocUnits = pocAmount / 1_000_000
  const pocToBase = 0.1
  const baseEquivalent = pocUnits * pocToBase

  const { tokens, averagePrice } = calculateBuy(baseEquivalent, currentSupply, params)

  const newSupply = currentSupply + tokens
  return {
    tradeType: 'mint',
    tokensAmount: tokens,
    baseAmount: baseEquivalent,
    averagePrice,
    newSupply,
    newPrice: getPrice(newSupply, params),
    newReserve: 0,
    slippagePercent: 0,
  }
}
