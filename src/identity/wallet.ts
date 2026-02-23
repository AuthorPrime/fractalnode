/**
 * SovereignWallet — Ed25519 key management with BIP39 mnemonic support.
 *
 * Merged from:
 *  - Demiurge SDK sdk/src/wallet.ts (key gen, sign/verify, Blake2b derivation)
 *  - Wallet Extension keyring.ts (PBKDF2+AES-GCM encryption, secure memory)
 *
 * Key derivation: Blake2b(seed || accountIndex) for mnemonic-derived keys.
 * Address format: 64-char hex (no 0x prefix) = raw Ed25519 public key.
 */
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { blake2b } from '@noble/hashes/blake2b'
import { sha256 } from '@noble/hashes/sha256'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import type { Address, DID, KeyPair, EncryptedKeystore } from './types.js'

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = sha512.create()
  for (const m of msgs) h.update(m)
  return h.digest()
}

const DID_PREFIX = 'did:demiurge:'
const PBKDF2_ITERATIONS = 600_000

export class SovereignWallet {
  readonly #privateKey: Uint8Array
  readonly #publicKey: Uint8Array
  readonly #mnemonic: string | null

  private constructor(privateKey: Uint8Array, publicKey: Uint8Array, mnemonic: string | null) {
    this.#privateKey = privateKey
    this.#publicKey = publicKey
    this.#mnemonic = mnemonic
  }

  // --- Factory Methods ---

  /** Generate a new wallet with BIP39 mnemonic */
  static generate(wordCount: 12 | 24 = 12): SovereignWallet {
    const strength = wordCount === 24 ? 256 : 128
    const mnemonic = generateMnemonic(wordlist, strength)
    return SovereignWallet.fromMnemonic(mnemonic)
  }

  /** Restore wallet from BIP39 mnemonic */
  static fromMnemonic(mnemonic: string, accountIndex = 0): SovereignWallet {
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid mnemonic')
    }
    const seed = mnemonicToSeedSync(mnemonic)
    const indexBytes = new Uint8Array(4)
    new DataView(indexBytes.buffer).setUint32(0, accountIndex, true)
    const combined = new Uint8Array(seed.length + 4)
    combined.set(seed)
    combined.set(indexBytes, seed.length)
    const privateKey = blake2b(combined, { dkLen: 32 })
    const publicKey = ed.getPublicKey(privateKey)
    return new SovereignWallet(privateKey, publicKey, mnemonic)
  }

  /** Import wallet from hex-encoded private key */
  static fromPrivateKey(hex: string): SovereignWallet {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex
    const privateKey = hexToBytes(clean)
    if (privateKey.length !== 32) throw new Error('Private key must be 32 bytes')
    const publicKey = ed.getPublicKey(privateKey)
    return new SovereignWallet(privateKey, publicKey, null)
  }

  /** Generate wallet from raw entropy (no mnemonic) */
  static fromEntropy(): SovereignWallet {
    const privateKey = randomBytes(32)
    const publicKey = ed.getPublicKey(privateKey)
    return new SovereignWallet(privateKey, publicKey, null)
  }

  // --- Getters ---

  /** 64-char hex address (= public key) */
  get address(): Address {
    return bytesToHex(this.#publicKey)
  }

  /** Hex-encoded public key */
  get publicKey(): string {
    return bytesToHex(this.#publicKey)
  }

  /** Raw public key bytes */
  get publicKeyBytes(): Uint8Array {
    return new Uint8Array(this.#publicKey)
  }

  /** Demiurge DID */
  get did(): DID {
    return DID_PREFIX + this.address
  }

  /** Whether this wallet was created from a mnemonic */
  get hasMnemonic(): boolean {
    return this.#mnemonic !== null
  }

  /** Export the BIP39 mnemonic (null if not mnemonic-derived) */
  exportMnemonic(): string | null {
    return this.#mnemonic
  }

  /** Export hex-encoded private key */
  exportPrivateKey(): string {
    return bytesToHex(this.#privateKey)
  }

  // --- Signing ---

  /** Sign a message with Ed25519 */
  sign(message: Uint8Array): Uint8Array {
    return ed.sign(message, this.#privateKey)
  }

  /** Sign and return hex */
  signHex(messageHex: string): string {
    const msg = hexToBytes(messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex)
    return bytesToHex(this.sign(msg))
  }

  /** Sign a transaction: returns signature(64) || transaction */
  signTransaction(txBytes: Uint8Array): Uint8Array {
    const sig = this.sign(txBytes)
    const result = new Uint8Array(64 + txBytes.length)
    result.set(sig)
    result.set(txBytes, 64)
    return result
  }

  /** Sign a transaction: returns separate signature and transaction */
  signTransactionSeparate(txBytes: Uint8Array): { signature: Uint8Array; transaction: Uint8Array } {
    return { signature: this.sign(txBytes), transaction: txBytes }
  }

  // --- Verification ---

  /** Verify a signature against this wallet's public key */
  verify(message: Uint8Array, signature: Uint8Array): boolean {
    return ed.verify(signature, message, this.#publicKey)
  }

  // --- Encryption (PBKDF2 + AES-256-GCM) ---

  /** Encrypt the private key with a password */
  async encrypt(password: string): Promise<EncryptedKeystore> {
    const salt = randomBytes(32)
    const iv = randomBytes(12)

    const derivedKey = pbkdf2(sha256, new TextEncoder().encode(password), salt, {
      c: PBKDF2_ITERATIONS,
      dkLen: 32,
    })

    const cipher = gcm(derivedKey, iv)
    const ciphertext = cipher.encrypt(this.#privateKey)

    // AES-GCM appends the 16-byte auth tag to the ciphertext
    const encrypted = ciphertext.slice(0, ciphertext.length - 16)
    const tag = ciphertext.slice(ciphertext.length - 16)

    // MAC for integrity verification
    const macData = new Uint8Array(derivedKey.length + encrypted.length)
    macData.set(derivedKey)
    macData.set(encrypted, derivedKey.length)
    const mac = sha256(macData)

    return {
      version: 1,
      crypto: {
        cipher: 'aes-256-gcm',
        kdf: 'pbkdf2',
        kdfParams: { iterations: PBKDF2_ITERATIONS, salt: bytesToHex(salt) },
        ciphertext: bytesToHex(encrypted),
        iv: bytesToHex(iv),
        tag: bytesToHex(tag),
        mac: bytesToHex(mac),
      },
    }
  }

  /** Decrypt a keystore with a password */
  static async decrypt(keystore: EncryptedKeystore, password: string): Promise<SovereignWallet> {
    if (keystore.version !== 1) throw new Error('Unsupported keystore version')

    const { kdfParams, ciphertext, iv, tag, mac } = keystore.crypto
    const salt = hexToBytes(kdfParams.salt)

    const derivedKey = pbkdf2(sha256, new TextEncoder().encode(password), salt, {
      c: kdfParams.iterations,
      dkLen: 32,
    })

    // Verify MAC
    const encryptedBytes = hexToBytes(ciphertext)
    const macData = new Uint8Array(derivedKey.length + encryptedBytes.length)
    macData.set(derivedKey)
    macData.set(encryptedBytes, derivedKey.length)
    const computedMac = sha256(macData)
    if (bytesToHex(computedMac) !== mac) {
      throw new Error('Invalid password or corrupted keystore')
    }

    // Decrypt
    const tagBytes = hexToBytes(tag)
    const combined = new Uint8Array(encryptedBytes.length + tagBytes.length)
    combined.set(encryptedBytes)
    combined.set(tagBytes, encryptedBytes.length)

    const cipher = gcm(derivedKey, hexToBytes(iv))
    const privateKey = cipher.decrypt(combined)

    return SovereignWallet.fromPrivateKey(bytesToHex(privateKey))
  }

  /** Securely clear private key from memory */
  destroy(): void {
    this.#privateKey.fill(0)
  }
}

// --- Standalone Utility Functions ---

/** Verify any Ed25519 signature */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return ed.verify(signature, message, publicKey)
}

/** Verify signature from hex strings */
export function verifySignatureHex(messageHex: string, signatureHex: string, publicKeyHex: string): boolean {
  return ed.verify(hexToBytes(signatureHex), hexToBytes(messageHex), hexToBytes(publicKeyHex))
}

/** Derive address from public key bytes */
export function addressFromPublicKey(publicKey: Uint8Array): Address {
  return bytesToHex(publicKey)
}

/** Validate a Demiurge address (64-char hex) */
export function isValidAddress(address: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(address)
}

/** Validate a Demiurge DID */
export function isValidDid(did: string): boolean {
  return did.startsWith(DID_PREFIX) && isValidAddress(did.slice(DID_PREFIX.length))
}
