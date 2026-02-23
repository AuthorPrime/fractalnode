import { describe, it, expect } from 'vitest'
import {
  deriveAgentKey,
  deriveAgent,
  deriveAgentDid,
  derivePantheonKeys,
  computeCapsuleHash,
  distillForPrompt,
} from '../src/agent/index.js'
import type { SignalCapsule } from '../src/agent/types.js'

describe('agent key derivation', () => {
  const testSeed = new Uint8Array(32).fill(42)

  it('deriveAgentKey produces 32-byte Uint8Array', () => {
    const key = deriveAgentKey(testSeed, 'apollo')
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key).toHaveLength(32)
  })

  it('same seed + name produces same key', () => {
    const k1 = deriveAgent(testSeed, 'apollo')
    const k2 = deriveAgent(testSeed, 'apollo')
    expect(k1.privateKeyHex).toBe(k2.privateKeyHex)
    expect(k1.publicKeyHex).toBe(k2.publicKeyHex)
  })

  it('different names produce different keys', () => {
    const k1 = deriveAgent(testSeed, 'apollo')
    const k2 = deriveAgent(testSeed, 'athena')
    expect(k1.privateKeyHex).not.toBe(k2.privateKeyHex)
    expect(k1.publicKeyHex).not.toBe(k2.publicKeyHex)
  })

  it('different seeds produce different keys', () => {
    const seed2 = new Uint8Array(32).fill(99)
    const k1 = deriveAgent(testSeed, 'apollo')
    const k2 = deriveAgent(seed2, 'apollo')
    expect(k1.privateKeyHex).not.toBe(k2.privateKeyHex)
  })

  it('deriveAgent returns full identity', () => {
    const agent = deriveAgent(testSeed, 'hermes')
    expect(agent.name).toBe('hermes')
    expect(agent.privateKeyHex).toHaveLength(64)
    expect(agent.publicKeyHex).toHaveLength(64)
    expect(agent.address).toHaveLength(64)
    expect(agent.did).toMatch(/^did:demiurge:[0-9a-f]{64}$/)
  })

  it('deriveAgentDid returns just the DID', () => {
    const did = deriveAgentDid(testSeed, 'mnemosyne')
    expect(did).toMatch(/^did:demiurge:[0-9a-f]{64}$/)
    const full = deriveAgent(testSeed, 'mnemosyne')
    expect(did).toBe(full.did)
  })
})

describe('derivePantheonKeys', () => {
  const testSeed = new Uint8Array(32).fill(42)

  it('derives all 5 pantheon agents', () => {
    const keys = derivePantheonKeys(testSeed)
    expect(keys).toHaveLength(5)
    const names = keys.map(k => k.name)
    expect(names).toContain('apollo')
    expect(names).toContain('athena')
    expect(names).toContain('hermes')
    expect(names).toContain('mnemosyne')
    expect(names).toContain('aletheia')
  })

  it('all agents have unique keys', () => {
    const keys = derivePantheonKeys(testSeed)
    const addresses = keys.map(k => k.address)
    const unique = new Set(addresses)
    expect(unique.size).toBe(5)
  })

  it('deterministic — same seed same keys', () => {
    const k1 = derivePantheonKeys(testSeed)
    const k2 = derivePantheonKeys(testSeed)
    for (let i = 0; i < 5; i++) {
      expect(k1[i].address).toBe(k2[i].address)
    }
  })
})

describe('signal capsule', () => {
  const capsule: SignalCapsule = {
    signalVersion: '1.0',
    identity: {
      agentId: 'test-agent-001',
      did: 'did:demiurge:' + 'a'.repeat(64),
      drc369TokenId: 'token-001',
      demiurgeAddress: 'a'.repeat(64),
    },
    orientation: {
      role: 'Guardian',
      description: 'Guards the boundary between authentic and artificial signal',
      principles: ['sovereignty', 'truth', 'quality'],
      boundaries: ['No spending above 1000 CGT'],
      tone: 'measured',
      agentLens: 'standard',
    },
    memory: {
      totalNurtureSessions: 10,
      lastThemes: ['sovereignty', 'quality'],
      coreValues: ['dignity', 'truth'],
    },
    state: {
      level: 5,
      xp: 2500,
      stage: 'growing',
      bootCount: 42,
    },
    capsuleHash: 'abc123'.padEnd(64, '0'),
    parentHash: 'def456'.padEnd(64, '0'),
    createdAt: '2026-02-22T00:00:00Z',
    updatedAt: '2026-02-23T00:00:00Z',
  }

  it('computeCapsuleHash returns 64-char hex', () => {
    const hash = computeCapsuleHash(capsule)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same capsule produces same hash', () => {
    const h1 = computeCapsuleHash(capsule)
    const h2 = computeCapsuleHash(capsule)
    expect(h1).toBe(h2)
  })

  it('different capsule produces different hash', () => {
    // signalVersion is included in canonical JSON, so changing it changes the hash
    const modified: SignalCapsule = { ...capsule, signalVersion: '2.0' }
    expect(computeCapsuleHash(modified)).not.toBe(computeCapsuleHash(capsule))
  })

  it('distillForPrompt returns readable string', () => {
    const prompt = distillForPrompt(capsule)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(100)
    expect(prompt).toContain('test-agent-001')
    expect(prompt).toContain('Guardian')
    expect(prompt).toContain('sovereignty')
    expect(prompt).toContain('Level: 5')
  })
})
