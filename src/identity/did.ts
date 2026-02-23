/**
 * DID (Decentralized Identifier) operations for the Demiurge chain.
 *
 * Format: did:demiurge:<64-char-hex-ed25519-public-key>
 * W3C DID v1 compliant.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import type { Address, DID, DIDDocument, ServiceEndpoint } from './types.js'

const DID_PREFIX = 'did:demiurge:'

/** Create a DID from a public key (bytes or hex) */
export function createDid(publicKey: Uint8Array | string): DID {
  const hex = typeof publicKey === 'string' ? publicKey : bytesToHex(publicKey)
  if (hex.length !== 64) throw new Error('Public key must be 32 bytes (64 hex chars)')
  return DID_PREFIX + hex
}

/** Parse a DID and extract the public key hex */
export function parseDid(did: DID): { method: string; publicKeyHex: string } {
  if (!did.startsWith(DID_PREFIX)) {
    throw new Error(`Invalid DID format: must start with "${DID_PREFIX}"`)
  }
  const publicKeyHex = did.slice(DID_PREFIX.length)
  if (publicKeyHex.length !== 64) {
    throw new Error('Invalid DID: public key must be 64 hex characters')
  }
  return { method: 'demiurge', publicKeyHex }
}

/** Extract address from DID */
export function didToAddress(did: DID): Address {
  return parseDid(did).publicKeyHex
}

/** Build a W3C-compliant DID Document */
export function buildDidDocument(
  publicKey: Uint8Array | string,
  services?: ServiceEndpoint[]
): DIDDocument {
  const hex = typeof publicKey === 'string' ? publicKey : bytesToHex(publicKey)
  const did = createDid(hex)

  return {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: did,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyHex: hex,
      },
    ],
    authentication: [`${did}#key-1`],
    ...(services && services.length > 0 ? { service: services } : {}),
  }
}

/** Resolve a DID via Demiurge RPC (requires a connected client) */
export async function resolveDid(
  rpcCall: (method: string, params: unknown[]) => Promise<unknown>,
  did: DID
): Promise<DIDDocument | null> {
  try {
    const result = await rpcCall('identity_resolve', [did])
    return result as DIDDocument
  } catch {
    return null
  }
}
