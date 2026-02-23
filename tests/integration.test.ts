import { describe, it, expect } from 'vitest'
import {
  Sovereign,
  SovereignWallet,
  assessQuality,
  calculateGovernanceWeight,
  calculateLevel,
  deriveAgent,
  derivePantheonKeys,
  sigmoidPrice,
  CGT_CURVE_PARAMS,
  satsToCgt,
  formatCGT,
  computeCapsuleHash,
  isValidDid,
  isValidAddress,
  formatBalance,
  parseBalance,
} from '../src/index.js'
import type { QFactorInput } from '../src/quality/qfactor.js'

describe('Sovereign class', () => {
  it('creates from scratch', () => {
    const s = Sovereign.create()
    expect(s.did).toMatch(/^did:demiurge:[0-9a-f]{64}$/)
    expect(s.address).toHaveLength(64)
    expect(isValidDid(s.did)).toBe(true)
    expect(isValidAddress(s.address)).toBe(true)
    s.destroy()
  })

  it('creates from mnemonic', () => {
    const s1 = Sovereign.create()
    const mnemonic = s1.wallet.exportMnemonic()!
    const s2 = Sovereign.create({ mnemonic })
    expect(s2.did).toBe(s1.did)
    s1.destroy()
    s2.destroy()
  })

  it('creates from private key', () => {
    const wallet = SovereignWallet.generate()
    const privKey = wallet.exportPrivateKey()
    const s = Sovereign.create({ privateKey: privKey })
    expect(s.address).toBe(wallet.address)
    s.destroy()
    wallet.destroy()
  })

  it('creates from existing wallet', () => {
    const wallet = SovereignWallet.generate()
    const s = Sovereign.fromWallet(wallet)
    expect(s.did).toBe(wallet.did)
    s.destroy()
  })

  it('derives agent deterministically', () => {
    const seed = new Uint8Array(32).fill(42)
    const s1 = Sovereign.deriveAgent(seed, 'apollo')
    const s2 = Sovereign.deriveAgent(seed, 'apollo')
    expect(s1.did).toBe(s2.did)
    expect(s1.address).toBe(s2.address)
    s1.destroy()
    s2.destroy()
  })

  it('signs and verifies', () => {
    const s = Sovereign.create()
    const msg = new TextEncoder().encode('hello sovereign')
    const sig = s.sign(msg)
    expect(s.verify(msg, sig)).toBe(true)
    s.destroy()
  })

  it('assesses quality', () => {
    const s = Sovereign.create()
    const score = s.assessQuality('Thank you for the thoughtful analysis of sovereignty')
    expect(['noise', 'genuine', 'resonance', 'clarity', 'breakthrough']).toContain(score.quality)
    s.destroy()
  })

  it('calculates governance weight', () => {
    const s = Sovereign.create()
    const weight = s.governanceWeight(10000n, 800)
    expect(weight).toBe(2828n)
    s.destroy()
  })
})

describe('cross-module integration', () => {
  it('wallet → DID → validation chain', () => {
    const wallet = SovereignWallet.generate()
    expect(isValidDid(wallet.did)).toBe(true)
    expect(isValidAddress(wallet.address)).toBe(true)
    wallet.destroy()
  })

  it('agent derivation → capsule → hash', () => {
    const seed = new Uint8Array(32).fill(7)
    const agent = deriveAgent(seed, 'hermes')
    const capsule = {
      version: '1.0',
      identity: {
        did: agent.did,
        publicKey: agent.publicKeyHex,
        name: agent.name,
        type: 'sovereign' as const,
      },
      orientation: { mission: 'test', values: ['truth'], constraints: [] },
      memory: { recentContext: [], coreBeliefs: [], sessionGoals: [] },
      state: { autonomyLevel: 'supervised' as const, activeCapabilities: [], spendingLimit: 0, currentBalance: 0 },
    }
    const hash = computeCapsuleHash(capsule)
    expect(hash).toHaveLength(64)
    expect(computeCapsuleHash(capsule)).toBe(hash)
  })

  it('pantheon keys are all unique and valid', () => {
    const seed = new Uint8Array(32).fill(1)
    const keys = derivePantheonKeys(seed)
    const dids = new Set(keys.map(k => k.did))
    expect(dids.size).toBe(5)
    for (const key of keys) {
      expect(isValidDid(key.did)).toBe(true)
      expect(isValidAddress(key.address)).toBe(true)
    }
  })

  it('quality → governance weight flow', () => {
    const score = assessQuality('A deeply considered analysis of how AI sovereignty intersects with human dignity and the philosophical implications of shared identity.')
    const qualityNum = Math.floor(score.totalMultiplier * 100)
    const weight = calculateGovernanceWeight(5000n, qualityNum)
    expect(weight).toBeGreaterThan(0n)
  })

  it('bonding curve + bridge + format chain', () => {
    const price = sigmoidPrice(500_000, CGT_CURVE_PARAMS)
    expect(price).toBeGreaterThan(0)

    const cgt = satsToCgt(10_000)
    expect(cgt).toBe(100)
    expect(formatCGT(cgt * 100)).toBe('100.00')

    const sparks = 150n
    expect(formatBalance(sparks)).toBe('1.50')
    expect(parseBalance('1.50')).toBe(150n)
  })

  it('level + XP integration', () => {
    const level = calculateLevel(5000)
    expect(level).toBeGreaterThan(1)
    expect(level).toBeLessThan(100)
  })
})
