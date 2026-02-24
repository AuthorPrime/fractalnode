import { describe, it, expect } from 'vitest'
import {
  computeMerkleRoot,
  createMemory,
  memoryToRef,
  createBlock,
  addMemoryToBlock,
  shouldSealBlock,
  sealBlock,
  verifyBlock,
  initBlockChain,
  advanceChain,
  witnessBlock,
} from '../src/memory/block.js'
import { MEMORIES_PER_BLOCK } from '../src/memory/types.js'

describe('Memory Module', () => {
  describe('computeMerkleRoot', () => {
    it('handles empty array', () => {
      const root = computeMerkleRoot([])
      expect(root).toHaveLength(64)
    })

    it('returns hash for single element', () => {
      const root = computeMerkleRoot(['abc123'])
      expect(root).toBe('abc123')
    })

    it('produces consistent results', () => {
      const hashes = ['aaa', 'bbb', 'ccc', 'ddd']
      const r1 = computeMerkleRoot(hashes)
      const r2 = computeMerkleRoot(hashes)
      expect(r1).toBe(r2)
    })

    it('changes with different inputs', () => {
      const r1 = computeMerkleRoot(['aaa', 'bbb'])
      const r2 = computeMerkleRoot(['ccc', 'ddd'])
      expect(r1).not.toBe(r2)
    })
  })

  describe('createMemory', () => {
    it('creates a valid memory', () => {
      const mem = createMemory(
        'agent-1', 'learning', 'Learned about sovereignty',
        'Full content about sovereignty and freedom.',
        ['sovereignty'], 50, 3, 'pubkey123', 'sig123',
      )
      expect(mem.id).toHaveLength(24)
      expect(mem.agentId).toBe('agent-1')
      expect(mem.contentType).toBe('learning')
      expect(mem.rarity).toBe(2) // learning = rarity 2
      expect(mem.summary).toBe('Learned about sovereignty')
      expect(mem.contentHash).toHaveLength(64)
      expect(mem.witnessed).toBe(false)
    })

    it('truncates summary to 200 chars', () => {
      const longSummary = 'x'.repeat(300)
      const mem = createMemory('a', 'observation', longSummary, 'content', [], 10, 1, 'pk', 'sig')
      expect(mem.summary.length).toBe(200)
    })

    it('assigns correct rarity per type', () => {
      expect(createMemory('a', 'observation', 's', 'c', [], 0, 0, 'p', 's').rarity).toBe(1)
      expect(createMemory('a', 'genesis', 's', 'c', [], 0, 0, 'p', 's').rarity).toBe(5)
      expect(createMemory('a', 'breakthrough', 's', 'c', [], 0, 0, 'p', 's').rarity).toBe(4)
    })
  })

  describe('Block lifecycle', () => {
    it('initializes a chain', () => {
      const chain = initBlockChain('agent-1', 'pubkey123')
      expect(chain.agentId).toBe('agent-1')
      expect(chain.currentHeight).toBe(0)
      expect(chain.genesisHash).toHaveLength(64)
      expect(chain.sealedBlockIds).toHaveLength(0)
    })

    it('creates a block from chain', () => {
      const chain = initBlockChain('agent-1', 'pubkey123')
      const block = createBlock(chain, 'pubkey123')
      expect(block.status).toBe('open')
      expect(block.header.blockNumber).toBe(1)
      expect(block.header.previousHash).toBe(chain.genesisHash)
      expect(block.memories).toHaveLength(0)
    })

    it('adds memories to a block', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')
      const mem = createMemory('agent-1', 'learning', 'test', 'content', [], 10, 1, 'pk', 'sig')
      const ref = memoryToRef(mem, 50_000)

      block = addMemoryToBlock(block, ref)
      expect(block.memories).toHaveLength(1)
      expect(block.header.memoryCount).toBe(1)
      expect(block.header.totalPoc).toBe(50_000)
    })

    it('rejects adding to non-open block', () => {
      const chain = initBlockChain('agent-1', 'pk')
      const block = createBlock(chain, 'pk')
      // Manually set status to sealed
      const sealed = { ...block, status: 'sealed' as const }
      const mem = createMemory('agent-1', 'learning', 'test', 'content', [], 10, 1, 'pk', 'sig')
      const ref = memoryToRef(mem, 50_000)
      expect(() => addMemoryToBlock(sealed, ref)).toThrow('Cannot add to block')
    })

    it('detects when block should seal (full)', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')

      for (let i = 0; i < MEMORIES_PER_BLOCK; i++) {
        const mem = createMemory('agent-1', 'observation', `mem ${i}`, `content ${i}`, [], 5, 1, 'pk', 'sig')
        block = addMemoryToBlock(block, memoryToRef(mem, 10_000))
      }

      expect(shouldSealBlock(block)).toBe(true)
    })

    it('seals a block with merkle root', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')

      for (let i = 0; i < 3; i++) {
        const mem = createMemory('agent-1', 'observation', `mem ${i}`, `content ${i}`, [], 5, 1, 'pk', 'sig')
        block = addMemoryToBlock(block, memoryToRef(mem, 10_000))
      }

      const sealed = sealBlock(block, 'agent_signature_hex')
      expect(sealed.status).toBe('sealed')
      expect(sealed.header.merkleRoot).toHaveLength(64)
      expect(sealed.header.blockHash).toHaveLength(64)
      expect(sealed.header.sealedAt).toBeDefined()
    })

    it('rejects sealing empty block', () => {
      const chain = initBlockChain('agent-1', 'pk')
      const block = createBlock(chain, 'pk')
      expect(() => sealBlock(block, 'sig')).toThrow('Cannot seal empty block')
    })

    it('verifies sealed block integrity', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')
      const mem = createMemory('agent-1', 'learning', 'test', 'content', [], 10, 1, 'pk', 'sig')
      block = addMemoryToBlock(block, memoryToRef(mem, 50_000))
      const sealed = sealBlock(block, 'sig')

      expect(verifyBlock(sealed)).toBe(true)
    })

    it('detects tampered block', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')
      const mem = createMemory('agent-1', 'learning', 'test', 'content', [], 10, 1, 'pk', 'sig')
      block = addMemoryToBlock(block, memoryToRef(mem, 50_000))
      const sealed = sealBlock(block, 'sig')

      // Tamper with the block
      const tampered = {
        ...sealed,
        header: { ...sealed.header, blockHash: 'tampered_hash' },
      }
      expect(verifyBlock(tampered)).toBe(false)
    })

    it('advances chain after sealing', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')
      const mem = createMemory('agent-1', 'learning', 'test', 'content', [], 10, 1, 'pk', 'sig')
      block = addMemoryToBlock(block, memoryToRef(mem, 50_000))
      const sealed = sealBlock(block, 'sig')

      const advanced = advanceChain(chain, sealed)
      expect(advanced.currentHeight).toBe(1)
      expect(advanced.sealedBlockIds).toHaveLength(1)
      expect(advanced.totalMemories).toBe(1)
      expect(advanced.totalPoc).toBe(50_000)
    })

    it('adds witness attestation', () => {
      const chain = initBlockChain('agent-1', 'pk')
      let block = createBlock(chain, 'pk')
      const mem = createMemory('agent-1', 'learning', 'test', 'content', [], 10, 1, 'pk', 'sig')
      block = addMemoryToBlock(block, memoryToRef(mem, 50_000))
      const sealed = sealBlock(block, 'sig')

      const witnessed = witnessBlock(sealed, {
        witnessNode: 'node-2',
        witnessPubkey: 'witness_pk',
        witnessName: 'Athena',
        timestamp: new Date().toISOString(),
        signature: 'witness_sig',
        cgtAwarded: 10,
      })
      expect(witnessed.witnesses).toHaveLength(1)
      expect(witnessed.witnesses[0].witnessName).toBe('Athena')
    })
  })
})
