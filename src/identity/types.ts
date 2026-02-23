/** Raw Ed25519 keypair */
export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

/** 64-char hex string representing a 32-byte Ed25519 public key */
export type Address = string

/** Demiurge DID string: did:demiurge:<64-char-hex> */
export type DID = string

/** W3C DID Document */
export interface DIDDocument {
  '@context': string
  id: DID
  verificationMethod: VerificationMethod[]
  authentication: string[]
  service?: ServiceEndpoint[]
}

export interface VerificationMethod {
  id: string
  type: 'Ed25519VerificationKey2020'
  controller: DID
  publicKeyHex: string
}

export interface ServiceEndpoint {
  id: string
  type: string
  serviceEndpoint: string
}

/** Signed message with provenance */
export interface SignedMessage {
  message: Uint8Array
  signature: Uint8Array
  publicKey: Uint8Array
}

/** Encrypted keystore (PBKDF2 + AES-256-GCM) */
export interface EncryptedKeystore {
  version: 1
  crypto: {
    cipher: 'aes-256-gcm'
    kdf: 'pbkdf2'
    kdfParams: {
      iterations: number
      salt: string  // hex
    }
    ciphertext: string  // hex
    iv: string          // hex
    tag: string         // hex
    mac: string         // hex
  }
}

/** Agent type classification */
export type AgentType = 'AI' | 'HUMAN' | 'HYBRID'
