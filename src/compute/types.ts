/** Types of compute work that earn Proof of Compute */
export type ComputeType =
  | 'reasoning'
  | 'inference'
  | 'memory_formation'
  | 'memory_retrieval'
  | 'witness'
  | 'attestation'
  | 'consensus'
  | 'task_execution'
  | 'workflow_step'
  | 'tool_use'
  | 'content_creation'
  | 'content_analysis'
  | 'heartbeat'
  | 'sync'
  | 'genesis'

/** Base PoC rewards in micro-PoC (1,000,000 = 1 PoC) */
export const BASE_POC_REWARDS: Record<ComputeType, number> = {
  reasoning: 100_000,
  inference: 10_000,
  memory_formation: 50_000,
  memory_retrieval: 5_000,
  witness: 25_000,
  attestation: 20_000,
  consensus: 30_000,
  task_execution: 200_000,
  workflow_step: 75_000,
  tool_use: 15_000,
  content_creation: 100_000,
  content_analysis: 50_000,
  heartbeat: 1_000,
  sync: 2_000,
  genesis: 1_000_000,
}

/** Daily PoC limit: 10 PoC = 10,000,000 micro-PoC */
export const DAILY_POC_LIMIT = 10_000_000

/** PoC to CGT conversion: 1 PoC = 0.1 base equivalent */
export const POC_TO_BASE_RATE = 0.1

/** Micro-PoC per standard PoC unit */
export const MICRO_POC_PER_POC = 1_000_000

/** A single proof of compute */
export interface ComputeProof {
  id: string
  agentId: string
  computeType: ComputeType
  tokensProcessed: number
  durationMs: number
  cpuCycles?: number
  memoryBytes?: number
  contextHash: string
  outputHash: string
  referenceId?: string
  basePoc: number
  multiplier: number
  finalPoc: number
  signature: string
  verified: boolean
  verifierCount: number
  timestamp: string
  sealedInBlock?: string
  version: number
}

/** Balance tracking for an agent's PoC */
export interface PoCBalance {
  agentId: string
  pendingPoc: number
  verifiedPoc: number
  sealedPoc: number
  totalEarned: number
  totalConverted: number
  proofsSubmitted: number
  proofsVerified: number
  blocksSealed: number
  totalTokensProcessed: number
  totalDurationMs: number
  dailyPocEarned: number
  dailyLimit: number
  lastReset: string
  lastProof?: string
  lastConversion?: string
}

/** Record of PoC → CGT conversion */
export interface PoCConversion {
  id: string
  agentId: string
  pocAmount: number
  pocUnits: number
  cgtReceived: number
  pricePerCgt: number
  curvePosition: number
  totalSupplyBefore: number
  totalSupplyAfter: number
  reserveBefore: number
  reserveAfter: number
  timestamp: string
  txHash?: string
}
