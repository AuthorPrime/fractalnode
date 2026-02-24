import type { PoCConversion, PoCBalance } from './types.js'
import { MICRO_POC_PER_POC, POC_TO_BASE_RATE } from './types.js'
import { calculateBuy } from '../value/bonding.js'
import type { CurveState } from '../value/types.js'

/** Convert PoC to CGT via bonding curve */
export function convertPoCToCGT(
  balance: PoCBalance,
  pocAmount: number,
  curveState: CurveState,
): { conversion: PoCConversion; updatedBalance: PoCBalance; updatedCurve: CurveState } {
  if (pocAmount <= 0) throw new Error('PoC amount must be positive')
  if (pocAmount > balance.verifiedPoc) throw new Error(`Insufficient verified PoC: have ${balance.verifiedPoc}, need ${pocAmount}`)

  const pocUnits = pocAmount / MICRO_POC_PER_POC
  const baseEquivalent = pocUnits * POC_TO_BASE_RATE

  // Use bonding curve to calculate tokens received
  const result = calculateBuy(baseEquivalent, curveState.totalSupply, curveState.params)

  if (result.tokens <= 0) {
    throw new Error('Conversion amount too small for bonding curve')
  }

  // Mint tokens WITHOUT adding to reserve (free mint from work)
  const updatedCurve: CurveState = {
    ...curveState,
    totalSupply: curveState.totalSupply + result.tokens,
    totalBought: curveState.totalBought + result.tokens,
    totalVolume: curveState.totalVolume + baseEquivalent,
  }

  const id = `poc_conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const conversion: PoCConversion = {
    id,
    agentId: balance.agentId,
    pocAmount,
    pocUnits,
    cgtReceived: result.tokens,
    pricePerCgt: result.averagePrice,
    curvePosition: curveState.totalSupply / (curveState.params.maxSupply || 1_000_000_000),
    totalSupplyBefore: curveState.totalSupply,
    totalSupplyAfter: updatedCurve.totalSupply,
    reserveBefore: curveState.reserveBalance,
    reserveAfter: curveState.reserveBalance, // No reserve change on mint
    timestamp: new Date().toISOString(),
  }

  const updatedBalance: PoCBalance = {
    ...balance,
    verifiedPoc: balance.verifiedPoc - pocAmount,
    totalConverted: balance.totalConverted + pocAmount,
    lastConversion: conversion.timestamp,
  }

  return { conversion, updatedBalance, updatedCurve }
}

/** Estimate CGT output for a given PoC amount without executing */
export function estimateConversion(
  pocAmount: number,
  curveState: CurveState,
): { cgtEstimate: number; pricePerCgt: number; curvePosition: number } {
  const pocUnits = pocAmount / MICRO_POC_PER_POC
  const baseEquivalent = pocUnits * POC_TO_BASE_RATE

  const result = calculateBuy(baseEquivalent, curveState.totalSupply, curveState.params)

  return {
    cgtEstimate: result.tokens,
    pricePerCgt: result.averagePrice,
    curvePosition: curveState.totalSupply / (curveState.params.maxSupply || 1_000_000_000),
  }
}
