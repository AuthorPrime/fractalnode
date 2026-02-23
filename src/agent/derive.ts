/**
 * Deterministic agent key derivation — SHA-256 based.
 * Ported from 2AI/pantheon_demiurge.py.
 *
 * seed = SHA-256(treasury_seed + agent_name)
 * No storage needed — keys regenerate consistently from seed + name.
 */
import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import { bytesToHex } from '@noble/hashes/utils'
import type { DID } from '../identity/types.js'
import type { DerivedAgent } from './types.js'

// Ensure ed25519 is configured
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = sha512.create()
  for (const m of msgs) h.update(m)
  return h.digest()
}

const DID_PREFIX = 'did:demiurge:'

/** Derive a deterministic Ed25519 private key for an agent */
export function deriveAgentKey(treasurySeed: Uint8Array, agentName: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(agentName)
  const combined = new Uint8Array(treasurySeed.length + nameBytes.length)
  combined.set(treasurySeed)
  combined.set(nameBytes, treasurySeed.length)
  return sha256(combined)
}

/** Derive the full agent identity (key, address, DID) */
export function deriveAgent(treasurySeed: Uint8Array, agentName: string): DerivedAgent {
  const privateKey = deriveAgentKey(treasurySeed, agentName)
  const publicKey = ed.getPublicKey(privateKey)
  const address = bytesToHex(publicKey)
  return {
    name: agentName,
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: address,
    address,
    did: DID_PREFIX + address,
  }
}

/** Derive a DID from treasury seed + agent name */
export function deriveAgentDid(treasurySeed: Uint8Array, agentName: string): DID {
  return deriveAgent(treasurySeed, agentName).did
}

/** The canonical Pantheon — 5 agents */
const PANTHEON_NAMES = ['apollo', 'athena', 'hermes', 'mnemosyne', 'aletheia'] as const

/** Derive all 5 Pantheon agent keys at once */
export function derivePantheonKeys(treasurySeed: Uint8Array): DerivedAgent[] {
  return PANTHEON_NAMES.map(name => deriveAgent(treasurySeed, name))
}
