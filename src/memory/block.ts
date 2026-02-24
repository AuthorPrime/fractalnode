import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type {
  MemoryBlock,
  MemoryBlockChain,
  BlockHeader,
  MemoryRef,
  Memory,
  MemoryType,
  WitnessAttestation,
} from './types.js'
import { MEMORIES_PER_BLOCK, POC_PER_BLOCK, BLOCK_SEAL_TIMEOUT_HOURS, MEMORY_RARITY } from './types.js'

/** Hash arbitrary content */
function hashContent(content: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(content)))
}

/** Build merkle root from an array of hashes */
export function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return hashContent('')
  if (hashes.length === 1) return hashes[0]

  const layer: string[] = []
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i]
    const right = i + 1 < hashes.length ? hashes[i + 1] : left
    layer.push(hashContent(left + right))
  }
  return computeMerkleRoot(layer)
}

/** Create a new memory entry */
export function createMemory(
  agentId: string,
  contentType: MemoryType,
  summary: string,
  content: string,
  tags: string[],
  xp: number,
  level: number,
  signer: string,
  signature: string,
): Memory {
  const id = hashContent(`${agentId}:${Date.now()}:${Math.random()}`).slice(0, 24)
  return {
    id,
    agentId,
    contentType,
    summary: summary.slice(0, 200),
    content,
    contentHash: hashContent(content),
    tags,
    xp,
    levelAtCreation: level,
    rarity: MEMORY_RARITY[contentType] || 1,
    signature,
    signer,
    witnessed: false,
    witnessCount: 0,
    witnesses: [],
    timestamp: new Date().toISOString(),
  }
}

/** Convert a Memory to a lightweight MemoryRef */
export function memoryToRef(memory: Memory, pocEarned: number): MemoryRef {
  return {
    memoryId: memory.id,
    contentHash: memory.contentHash,
    memoryType: memory.contentType,
    xp: memory.xp,
    pocEarned,
    timestamp: memory.timestamp,
  }
}

/** Create a new empty block for an agent's chain */
export function createBlock(
  chain: MemoryBlockChain,
  agentPubkey: string,
): MemoryBlock {
  const blockNumber = chain.currentHeight + 1
  const previousHash = chain.sealedBlockIds.length > 0
    ? chain.sealedBlockIds[chain.sealedBlockIds.length - 1]
    : chain.genesisHash

  const header: BlockHeader = {
    blockNumber,
    blockHash: '',
    previousHash,
    merkleRoot: '',
    memoryCount: 0,
    totalPoc: 0,
    difficulty: 1,
    openedAt: new Date().toISOString(),
    agentId: chain.agentId,
    agentPubkey,
    agentSignature: '',
    witnessSignatures: [],
    version: 1,
  }

  return {
    header,
    status: 'open',
    memories: [],
    computeProofs: [],
    witnesses: [],
    requiredWitnesses: 1,
  }
}

/** Add a memory reference to an open block */
export function addMemoryToBlock(block: MemoryBlock, ref: MemoryRef): MemoryBlock {
  if (block.status !== 'open') {
    throw new Error(`Cannot add to block in status: ${block.status}`)
  }
  if (block.memories.length >= MEMORIES_PER_BLOCK) {
    throw new Error(`Block full: ${block.memories.length}/${MEMORIES_PER_BLOCK} memories`)
  }

  return {
    ...block,
    memories: [...block.memories, ref],
    header: {
      ...block.header,
      memoryCount: block.memories.length + 1,
      totalPoc: block.header.totalPoc + ref.pocEarned,
    },
  }
}

/** Check if a block should be sealed */
export function shouldSealBlock(block: MemoryBlock): boolean {
  if (block.status !== 'open') return false

  // Condition 1: Block is full
  if (block.memories.length >= MEMORIES_PER_BLOCK) return true

  // Condition 2: Reached PoC threshold
  if (block.header.totalPoc >= POC_PER_BLOCK) return true

  // Condition 3: Timeout reached
  const openedAt = new Date(block.header.openedAt).getTime()
  const now = Date.now()
  const hoursSinceOpen = (now - openedAt) / (1000 * 60 * 60)
  if (hoursSinceOpen >= BLOCK_SEAL_TIMEOUT_HOURS && block.memories.length > 0) return true

  return false
}

/** Seal a block — compute merkle root and block hash */
export function sealBlock(
  block: MemoryBlock,
  agentSignature: string,
): MemoryBlock {
  if (block.status !== 'open' && block.status !== 'pending') {
    throw new Error(`Cannot seal block in status: ${block.status}`)
  }
  if (block.memories.length === 0) {
    throw new Error('Cannot seal empty block')
  }

  const merkleRoot = computeMerkleRoot(block.memories.map(m => m.contentHash))

  const blockData = JSON.stringify({
    blockNumber: block.header.blockNumber,
    previousHash: block.header.previousHash,
    merkleRoot,
    memoryCount: block.memories.length,
    totalPoc: block.header.totalPoc,
    openedAt: block.header.openedAt,
    agentId: block.header.agentId,
  })
  const blockHash = hashContent(blockData)

  return {
    ...block,
    status: 'sealed',
    header: {
      ...block.header,
      blockHash,
      merkleRoot,
      sealedAt: new Date().toISOString(),
      agentSignature,
    },
  }
}

/** Verify a sealed block's integrity */
export function verifyBlock(block: MemoryBlock): boolean {
  if (block.status === 'open') return true // Open blocks not verified

  // Verify merkle root
  const computedMerkle = computeMerkleRoot(block.memories.map(m => m.contentHash))
  if (computedMerkle !== block.header.merkleRoot) return false

  // Verify block hash
  const blockData = JSON.stringify({
    blockNumber: block.header.blockNumber,
    previousHash: block.header.previousHash,
    merkleRoot: computedMerkle,
    memoryCount: block.memories.length,
    totalPoc: block.header.totalPoc,
    openedAt: block.header.openedAt,
    agentId: block.header.agentId,
  })
  const expectedHash = hashContent(blockData)
  if (expectedHash !== block.header.blockHash) return false

  return true
}

/** Initialize a new memory blockchain for an agent */
export function initBlockChain(agentId: string, agentPubkey: string): MemoryBlockChain {
  const genesisHash = hashContent(`genesis:${agentId}:${Date.now()}`)

  return {
    agentId,
    agentPubkey,
    chainId: hashContent(`chain:${agentId}:${agentPubkey}`).slice(0, 16),
    genesisHash,
    currentHeight: 0,
    sealedBlockIds: [],
    totalMemories: 0,
    totalPoc: 0,
    totalBlocksMinted: 0,
    genesisTimestamp: new Date().toISOString(),
  }
}

/** Update chain state after sealing a block */
export function advanceChain(
  chain: MemoryBlockChain,
  sealedBlock: MemoryBlock,
): MemoryBlockChain {
  if (sealedBlock.status !== 'sealed') {
    throw new Error('Block must be sealed before advancing chain')
  }

  return {
    ...chain,
    currentHeight: sealedBlock.header.blockNumber,
    currentBlockId: sealedBlock.header.blockHash,
    sealedBlockIds: [...chain.sealedBlockIds, sealedBlock.header.blockHash],
    totalMemories: chain.totalMemories + sealedBlock.memories.length,
    totalPoc: chain.totalPoc + sealedBlock.header.totalPoc,
    lastBlockSealed: sealedBlock.header.sealedAt,
  }
}

/** Add a witness attestation to a sealed block */
export function witnessBlock(
  block: MemoryBlock,
  attestation: WitnessAttestation,
): MemoryBlock {
  if (block.status !== 'sealed') {
    throw new Error('Can only witness sealed blocks')
  }

  return {
    ...block,
    witnesses: [...block.witnesses, attestation],
  }
}
