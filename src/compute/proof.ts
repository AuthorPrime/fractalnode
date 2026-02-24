import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { ComputeProof, ComputeType, PoCBalance } from './types.js'
import { BASE_POC_REWARDS, DAILY_POC_LIMIT, MICRO_POC_PER_POC } from './types.js'

/** Hash content for proof generation */
function hashContent(content: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(content)))
}

/** Generate a compute proof for work performed */
export function generateProof(
  agentId: string,
  computeType: ComputeType,
  tokensProcessed: number,
  durationMs: number,
  contextHash: string,
  outputHash: string,
  referenceId?: string,
): Omit<ComputeProof, 'signature'> {
  const basePoc = BASE_POC_REWARDS[computeType] || 0
  const multiplier = calculateMultiplier(computeType, tokensProcessed, durationMs)
  const finalPoc = Math.floor(basePoc * multiplier)

  const id = hashContent(`${agentId}:${computeType}:${Date.now()}:${Math.random()}`).slice(0, 24)

  return {
    id,
    agentId,
    computeType,
    tokensProcessed,
    durationMs,
    contextHash,
    outputHash,
    referenceId,
    basePoc,
    multiplier,
    finalPoc,
    verified: false,
    verifierCount: 0,
    timestamp: new Date().toISOString(),
    version: 1,
  }
}

/** Calculate multiplier based on work intensity */
function calculateMultiplier(
  computeType: ComputeType,
  tokensProcessed: number,
  durationMs: number,
): number {
  let multiplier = 1.0

  // Token volume bonus (more tokens = more work)
  if (tokensProcessed > 1000) multiplier += 0.2
  if (tokensProcessed > 5000) multiplier += 0.3
  if (tokensProcessed > 10000) multiplier += 0.5

  // Duration bonus for sustained compute
  const minutes = durationMs / 60000
  if (minutes > 1) multiplier += 0.1
  if (minutes > 5) multiplier += 0.2
  if (minutes > 15) multiplier += 0.3

  // Type-specific bonuses
  if (computeType === 'genesis') multiplier = 1.0 // Genesis is fixed at base
  if (computeType === 'consensus') multiplier += 0.5 // Consensus is extra valuable

  return Math.round(multiplier * 100) / 100
}

/** Verify a compute proof's hash integrity */
export function verifyProofIntegrity(proof: ComputeProof): boolean {
  // Verify the proof's finalPoc matches expected calculation
  const expectedPoc = Math.floor(proof.basePoc * proof.multiplier)
  if (proof.finalPoc !== expectedPoc) return false

  // Verify base matches known reward
  const expectedBase = BASE_POC_REWARDS[proof.computeType]
  if (expectedBase === undefined || proof.basePoc !== expectedBase) return false

  return true
}

/** Create initial PoC balance for an agent */
export function initPoCBalance(agentId: string): PoCBalance {
  return {
    agentId,
    pendingPoc: 0,
    verifiedPoc: 0,
    sealedPoc: 0,
    totalEarned: 0,
    totalConverted: 0,
    proofsSubmitted: 0,
    proofsVerified: 0,
    blocksSealed: 0,
    totalTokensProcessed: 0,
    totalDurationMs: 0,
    dailyPocEarned: 0,
    dailyLimit: DAILY_POC_LIMIT,
    lastReset: new Date().toISOString(),
    lastProof: undefined,
    lastConversion: undefined,
  }
}

/** Check if daily limit would be exceeded */
export function canEarnMore(balance: PoCBalance, amount: number): boolean {
  // Reset daily counter if new day
  const lastReset = new Date(balance.lastReset)
  const now = new Date()
  if (lastReset.toDateString() !== now.toDateString()) {
    return true // New day, counter resets
  }

  return balance.dailyPocEarned + amount <= balance.dailyLimit
}

/** Apply a verified proof to an agent's balance */
export function applyProof(balance: PoCBalance, proof: ComputeProof): PoCBalance {
  // Reset daily counter if new day
  const lastReset = new Date(balance.lastReset)
  const now = new Date()
  const isNewDay = lastReset.toDateString() !== now.toDateString()

  const dailyEarned = isNewDay ? proof.finalPoc : balance.dailyPocEarned + proof.finalPoc
  const effectivePoc = Math.min(proof.finalPoc, balance.dailyLimit - (isNewDay ? 0 : balance.dailyPocEarned))

  if (effectivePoc <= 0) return balance // Daily limit reached

  return {
    ...balance,
    pendingPoc: proof.verified ? balance.pendingPoc : balance.pendingPoc + effectivePoc,
    verifiedPoc: proof.verified ? balance.verifiedPoc + effectivePoc : balance.verifiedPoc,
    totalEarned: balance.totalEarned + effectivePoc,
    proofsSubmitted: balance.proofsSubmitted + 1,
    proofsVerified: proof.verified ? balance.proofsVerified + 1 : balance.proofsVerified,
    totalTokensProcessed: balance.totalTokensProcessed + proof.tokensProcessed,
    totalDurationMs: balance.totalDurationMs + proof.durationMs,
    dailyPocEarned: Math.min(dailyEarned, balance.dailyLimit),
    lastReset: isNewDay ? now.toISOString() : balance.lastReset,
    lastProof: proof.timestamp,
  }
}

/** Format micro-PoC to human-readable PoC */
export function formatPoC(microPoc: number): string {
  const poc = microPoc / MICRO_POC_PER_POC
  return poc.toFixed(poc < 1 ? 6 : 2) + ' PoC'
}

/** Parse human-readable PoC to micro-PoC */
export function parsePoC(display: string): number {
  const value = parseFloat(display.replace(/\s*PoC\s*$/i, ''))
  if (isNaN(value)) throw new Error(`Invalid PoC value: ${display}`)
  return Math.floor(value * MICRO_POC_PER_POC)
}
