/** JSON-RPC 2.0 request */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

/** JSON-RPC 2.0 response */
export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

/** Chain health status */
export interface ChainHealth {
  isSyncing: boolean
  peers: number
  shouldHavePeers: boolean
}

/** Block header + body */
export interface Block {
  number: number
  hash: string
  parentHash: string
  stateRoot: string
  extrinsicsRoot: string
  timestamp: number
  author: string
  transactions: Transaction[]
}

/** On-chain transaction */
export interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  nonce: number
  data: string
  status: 'pending' | 'confirmed' | 'failed'
  blockNumber?: number
}

/** Era info from consensus */
export interface EraInfo {
  currentEra: number
  epochIndex: number
  epochStartBlock: number
  totalIssuance: string
}

/** Validator info */
export interface Validator {
  address: string
  stake: string
  commission: number
  isActive: boolean
  uptime: number
}

/** Transaction submission result */
export interface SubmitResult {
  hash: string
  status: 'submitted' | 'confirmed' | 'failed'
  blockNumber?: number
}

/** Balance as returned by RPC (string for precision) */
export type Balance = string

/** Transaction hash */
export type TxHash = string

/** Token ID (number or string) */
export type TokenId = string | number

/** Energy info for an account */
export interface EnergyInfo {
  current: number
  max: number
  regenerationRate: number
  lastUpdate: number
}

/** User stats from hub */
export interface UserStats {
  address: string
  balance: Balance
  nftCount: number
  level: number
  xp: number
  joinedAt: string
}
