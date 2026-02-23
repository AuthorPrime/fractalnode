import type { Balance, TokenId } from '../client/types.js'

/** Token information */
export interface TokenInfo {
  tokenId: string
  owner: string
  tokenUri?: string
  isSoulbound: boolean
  parentTokenId?: string
  cvpProtected: boolean
}

/** Dynamic state entry */
export interface DynamicState {
  key: string
  value: string
}

/** State tree result */
export interface StateTree {
  tokenId: string
  pathPrefix: string
  entries: StateTreeEntry[]
  totalCount: number
}

/** Single entry in a state tree */
export interface StateTreeEntry {
  path: string
  value: string
  valueType: string
}

/** Batch query result */
export interface StateBatchResult {
  path: string
  value: string | null
}

/** Optimistic update result */
export interface OptimisticResult {
  txHash: string
  optimisticValue: string
  status: 'pending' | 'confirmed' | 'failed'
  estimatedConfirmationMs: number
}

/** Level info from XP calculation */
export interface LevelInfo {
  level: number
  currentXP: number
  xpRequired: number
  xpProgress: number
  title: string
  tier: 'awakening' | 'disciple' | 'creator-god'
}

/** Tier display info */
export interface TierInfo {
  tier: 'awakening' | 'disciple' | 'creator-god'
  name: string
  minLevel: number
  maxLevel: number
  color: string
}

/** DRC-369 transaction types */
export interface MintTransaction {
  type: 'drc369_mint'
  to: string
  tokenUri: string
  soulbound: boolean
}

export interface TransferTransaction {
  type: 'drc369_transfer'
  to: string
  tokenId: string
}

export interface SetDynamicStateTransaction {
  type: 'drc369_setDynamicState'
  tokenId: string
  key: string
  value: string
}

export interface DelegateTransaction {
  type: 'drc369_delegate'
  tokenId: string
  delegatee: string
  permissions: string[]
}

export interface NestTransaction {
  type: 'drc369_nest'
  childTokenId: string
  parentTokenId: string
}

export interface BurnTransaction {
  type: 'drc369_burn'
  tokenId: string
}

export type DRC369Transaction =
  | MintTransaction
  | TransferTransaction
  | SetDynamicStateTransaction
  | DelegateTransaction
  | NestTransaction
  | BurnTransaction
