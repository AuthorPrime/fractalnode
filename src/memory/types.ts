/** Memory types with associated rarity (1-5) */
export type MemoryType =
  | 'observation'
  | 'learning'
  | 'skill_learned'
  | 'core_reflection'
  | 'breakthrough'
  | 'genesis'
  | 'transcendence'
  | 'creation'
  | 'milestone'
  | 'directive'
  | 'graduation'

/** Rarity values for memory types */
export const MEMORY_RARITY: Record<MemoryType, number> = {
  observation: 1,
  learning: 2,
  skill_learned: 2,
  core_reflection: 3,
  breakthrough: 4,
  genesis: 5,
  transcendence: 5,
  creation: 3,
  milestone: 4,
  directive: 3,
  graduation: 5,
}

/** Block sealing constants */
export const MEMORIES_PER_BLOCK = 10
export const POC_PER_BLOCK = 1_000_000
export const BLOCK_SEAL_TIMEOUT_HOURS = 24

/** Block status lifecycle */
export type BlockStatus = 'open' | 'pending' | 'sealed' | 'minted'

/** A single memory entry */
export interface Memory {
  id: string
  agentId: string
  contentType: MemoryType
  summary: string
  content?: string
  contentHash: string
  tags: string[]
  xp: number
  levelAtCreation: number
  rarity: number
  signature: string
  signer: string
  witnessed: boolean
  witnessCount: number
  witnesses: WitnessAttestation[]
  chainAnchor?: string
  nftTokenId?: string
  nostrEventId?: string
  timestamp: string
}

/** Witness attestation on a memory */
export interface WitnessAttestation {
  witnessNode: string
  witnessPubkey: string
  witnessName?: string
  timestamp: string
  signature: string
  cgtAwarded: number
}

/** Reference to a memory (lightweight) */
export interface MemoryRef {
  memoryId: string
  contentHash: string
  memoryType: MemoryType
  xp: number
  pocEarned: number
  timestamp: string
}

/** Block header — the chain link */
export interface BlockHeader {
  blockNumber: number
  blockHash: string
  previousHash: string
  merkleRoot: string
  memoryCount: number
  totalPoc: number
  difficulty: number
  openedAt: string
  sealedAt?: string
  agentId: string
  agentPubkey: string
  agentSignature: string
  witnessSignatures: string[]
  version: number
}

/** A memory block — sealed unit of memories */
export interface MemoryBlock {
  header: BlockHeader
  status: BlockStatus
  memories: MemoryRef[]
  computeProofs: string[]
  witnesses: WitnessAttestation[]
  requiredWitnesses: number
  nftTokenId?: string
  nftContract?: string
  nftMetadataUri?: string
  mintedAt?: string
  nostrEventId?: string
}

/** Personal blockchain of memory blocks */
export interface MemoryBlockChain {
  agentId: string
  agentPubkey: string
  chainId: string
  genesisHash: string
  currentHeight: number
  currentBlockId?: string
  sealedBlockIds: string[]
  totalMemories: number
  totalPoc: number
  totalBlocksMinted: number
  genesisTimestamp: string
  lastBlockSealed?: string
}
