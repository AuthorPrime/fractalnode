import { describe, it, expect } from 'vitest'
import {
  SovereignWallet,
  verifySignature,
  verifySignatureHex,
  addressFromPublicKey,
  isValidAddress,
  isValidDid,
  createDid,
  parseDid,
  didToAddress,
  buildDidDocument,
} from '../src/identity/index.js'

describe('SovereignWallet', () => {
  it('generates a wallet with 12-word mnemonic', () => {
    const wallet = SovereignWallet.generate(12)
    expect(wallet.hasMnemonic).toBe(true)
    expect(wallet.exportMnemonic()!.split(' ')).toHaveLength(12)
    expect(wallet.address).toHaveLength(64)
    expect(wallet.did).toMatch(/^did:demiurge:[0-9a-f]{64}$/)
    wallet.destroy()
  })

  it('generates a wallet with 24-word mnemonic', () => {
    const wallet = SovereignWallet.generate(24)
    expect(wallet.exportMnemonic()!.split(' ')).toHaveLength(24)
    wallet.destroy()
  })

  it('restores from mnemonic deterministically', () => {
    const wallet1 = SovereignWallet.generate()
    const mnemonic = wallet1.exportMnemonic()!
    const wallet2 = SovereignWallet.fromMnemonic(mnemonic)
    expect(wallet2.address).toBe(wallet1.address)
    expect(wallet2.publicKey).toBe(wallet1.publicKey)
    expect(wallet2.did).toBe(wallet1.did)
    wallet1.destroy()
    wallet2.destroy()
  })

  it('derives different keys for different account indices', () => {
    const wallet = SovereignWallet.generate()
    const mnemonic = wallet.exportMnemonic()!
    const w0 = SovereignWallet.fromMnemonic(mnemonic, 0)
    const w1 = SovereignWallet.fromMnemonic(mnemonic, 1)
    expect(w0.address).not.toBe(w1.address)
    wallet.destroy()
    w0.destroy()
    w1.destroy()
  })

  it('imports from private key hex', () => {
    const original = SovereignWallet.generate()
    const privHex = original.exportPrivateKey()
    const restored = SovereignWallet.fromPrivateKey(privHex)
    expect(restored.address).toBe(original.address)
    expect(restored.hasMnemonic).toBe(false)
    original.destroy()
    restored.destroy()
  })

  it('handles 0x-prefixed private key', () => {
    const wallet = SovereignWallet.generate()
    const privHex = '0x' + wallet.exportPrivateKey()
    const restored = SovereignWallet.fromPrivateKey(privHex)
    expect(restored.address).toBe(wallet.address)
    wallet.destroy()
    restored.destroy()
  })

  it('generates from entropy (no mnemonic)', () => {
    const wallet = SovereignWallet.fromEntropy()
    expect(wallet.hasMnemonic).toBe(false)
    expect(wallet.exportMnemonic()).toBeNull()
    expect(wallet.address).toHaveLength(64)
    wallet.destroy()
  })

  it('rejects invalid mnemonic', () => {
    expect(() => SovereignWallet.fromMnemonic('invalid mnemonic phrase')).toThrow('Invalid mnemonic')
  })

  it('rejects wrong-length private key', () => {
    expect(() => SovereignWallet.fromPrivateKey('aabb')).toThrow('Private key must be 32 bytes')
  })

  describe('signing and verification', () => {
    it('signs and verifies messages', () => {
      const wallet = SovereignWallet.generate()
      const msg = new TextEncoder().encode('sovereign message')
      const sig = wallet.sign(msg)
      expect(sig).toHaveLength(64)
      expect(wallet.verify(msg, sig)).toBe(true)
      wallet.destroy()
    })

    it('rejects tampered messages', () => {
      const wallet = SovereignWallet.generate()
      const msg = new TextEncoder().encode('original')
      const sig = wallet.sign(msg)
      const tampered = new TextEncoder().encode('tampered')
      expect(wallet.verify(tampered, sig)).toBe(false)
      wallet.destroy()
    })

    it('signHex works with and without 0x prefix', () => {
      const wallet = SovereignWallet.generate()
      const msgHex = '48656c6c6f' // "Hello"
      const sig1 = wallet.signHex(msgHex)
      const sig2 = wallet.signHex('0x' + msgHex)
      expect(sig1).toBe(sig2)
      expect(sig1).toHaveLength(128) // 64 bytes hex
      wallet.destroy()
    })

    it('signTransaction prepends signature', () => {
      const wallet = SovereignWallet.generate()
      const tx = new Uint8Array([1, 2, 3, 4])
      const signed = wallet.signTransaction(tx)
      expect(signed).toHaveLength(68) // 64 sig + 4 tx
      wallet.destroy()
    })
  })

  describe('encrypt/decrypt', () => {
    it('round-trips through encryption', async () => {
      const wallet = SovereignWallet.generate()
      const address = wallet.address
      const keystore = await wallet.encrypt('test-password-123')
      expect(keystore.version).toBe(1)
      expect(keystore.crypto.cipher).toBe('aes-256-gcm')
      expect(keystore.crypto.kdf).toBe('pbkdf2')

      const restored = await SovereignWallet.decrypt(keystore, 'test-password-123')
      expect(restored.address).toBe(address)
      wallet.destroy()
      restored.destroy()
    })

    it('rejects wrong password', async () => {
      const wallet = SovereignWallet.generate()
      const keystore = await wallet.encrypt('correct-password')
      await expect(SovereignWallet.decrypt(keystore, 'wrong-password')).rejects.toThrow('Invalid password')
      wallet.destroy()
    })
  })
})

describe('standalone verification', () => {
  it('verifySignature with raw bytes', () => {
    const wallet = SovereignWallet.generate()
    const msg = new TextEncoder().encode('test')
    const sig = wallet.sign(msg)
    expect(verifySignature(msg, sig, wallet.publicKeyBytes)).toBe(true)
    wallet.destroy()
  })

  it('verifySignatureHex with hex strings', () => {
    const wallet = SovereignWallet.generate()
    const msgHex = '48656c6c6f'
    const sigHex = wallet.signHex(msgHex)
    expect(verifySignatureHex(msgHex, sigHex, wallet.publicKey)).toBe(true)
    wallet.destroy()
  })
})

describe('address utilities', () => {
  it('addressFromPublicKey returns 64-char hex', () => {
    const wallet = SovereignWallet.generate()
    const addr = addressFromPublicKey(wallet.publicKeyBytes)
    expect(addr).toBe(wallet.address)
    expect(addr).toHaveLength(64)
    wallet.destroy()
  })

  it('isValidAddress accepts 64-char hex', () => {
    expect(isValidAddress('a'.repeat(64))).toBe(true)
    expect(isValidAddress('0123456789abcdef'.repeat(4))).toBe(true)
  })

  it('isValidAddress rejects invalid', () => {
    expect(isValidAddress('')).toBe(false)
    expect(isValidAddress('short')).toBe(false)
    expect(isValidAddress('g'.repeat(64))).toBe(false) // non-hex
    expect(isValidAddress('a'.repeat(63))).toBe(false)
    expect(isValidAddress('a'.repeat(65))).toBe(false)
  })

  it('isValidDid validates demiurge DIDs', () => {
    expect(isValidDid('did:demiurge:' + 'a'.repeat(64))).toBe(true)
    expect(isValidDid('did:demiurge:short')).toBe(false)
    expect(isValidDid('did:other:' + 'a'.repeat(64))).toBe(false)
  })
})

describe('DID operations', () => {
  it('createDid from public key', () => {
    const wallet = SovereignWallet.generate()
    const did = createDid(wallet.publicKeyBytes)
    expect(did).toBe(wallet.did)
    expect(did).toMatch(/^did:demiurge:[0-9a-f]{64}$/)
    wallet.destroy()
  })

  it('parseDid extracts public key hex', () => {
    const addr = 'a'.repeat(64)
    const result = parseDid('did:demiurge:' + addr)
    expect(result.publicKeyHex).toBe(addr)
    expect(result.method).toBe('demiurge')
  })

  it('didToAddress extracts hex', () => {
    const addr = 'b'.repeat(64)
    expect(didToAddress('did:demiurge:' + addr)).toBe(addr)
  })

  it('buildDidDocument creates W3C-compliant doc', () => {
    const wallet = SovereignWallet.generate()
    const doc = buildDidDocument(wallet.publicKeyBytes)
    expect(doc.id).toBe(wallet.did)
    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1')
    expect(doc.verificationMethod).toHaveLength(1)
    expect(doc.verificationMethod[0].type).toBe('Ed25519VerificationKey2020')
    wallet.destroy()
  })

  it('buildDidDocument with services', () => {
    const wallet = SovereignWallet.generate()
    const doc = buildDidDocument(wallet.publicKeyBytes, [
      { id: '#hub', type: 'SovereignHub', serviceEndpoint: 'http://localhost:3000' }
    ])
    expect(doc.service).toHaveLength(1)
    expect(doc.service![0].type).toBe('SovereignHub')
    wallet.destroy()
  })
})
