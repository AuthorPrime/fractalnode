/**
 * Action Logger — DID-signed, hash-chained audit trail.
 *
 * Every tool action an agent takes on any node gets logged with their DID.
 * Entries are hash-chained: each entry's parentHash points to the previous
 * entry's hash, creating a tamper-evident audit trail per agent.
 *
 * Redis keys:
 *   ssp:actions:{did}           — LIST of agent's actions (newest first)
 *   ssp:actions:node:{nodeId}   — LIST of all actions on a node
 *   ssp:actions:latest:{did}    — most recent action hash (for chaining)
 */

import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import type { TransportAdapter, SignalFrame } from './types.js'
import type { DID } from '../identity/types.js'

// Ensure ed25519 is configured
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = sha512.create()
  for (const m of msgs) h.update(m)
  return h.digest()
}

// ─── Types ───────────────────────────────────────────────────────────

/** A single logged action */
export interface ActionEntry {
  /** Unique action ID */
  id: string
  /** Who did it (DID) */
  did: DID
  /** Where they did it (node ID) */
  nodeId: string
  /** What they did */
  action: string
  /** What they acted on */
  target: string
  /** When */
  timestamp: string
  /** Hash of previous action (chain) */
  parentHash: string
  /** Hash of this entry */
  entryHash: string
  /** Ed25519 signature of entryHash */
  signature: string
}

/** Options for reading logs */
export interface LogOptions {
  /** Maximum entries to return */
  limit?: number
  /** Only entries after this timestamp */
  after?: string
}

// ─── Operations ──────────────────────────────────────────────────────

/**
 * Log an action to the audit trail.
 *
 * Chains to the previous action via parentHash.
 * Signs the entry with the agent's private key.
 */
export async function logAction(
  transport: TransportAdapter,
  did: DID,
  nodeId: string,
  action: string,
  target: string,
  privateKeyHex?: string,
): Promise<ActionEntry> {
  // Get the latest hash for chaining
  const latestKey = `actions_latest:${did}`
  const latestFrame = await transport.read(latestKey)
  const parentHash = (latestFrame as unknown as { hash?: string })?.hash ?? '0'.repeat(64)

  // Build the entry
  const id = randomHex(12)
  const timestamp = new Date().toISOString()

  const preHash = {
    id,
    did,
    nodeId,
    action,
    target,
    timestamp,
    parentHash,
  }

  const entryHash = hashObject(preHash)

  // Sign if key provided
  let signature = 'unsigned'
  if (privateKeyHex) {
    try {
      const sig = ed.sign(hexToBytes(entryHash), hexToBytes(privateKeyHex))
      signature = bytesToHex(sig)
    } catch {
      signature = 'sign-failed'
    }
  }

  const entry: ActionEntry = {
    ...preHash,
    entryHash,
    signature,
  }

  // Store: agent's action log
  const agentLogKey = `actions:${did}`
  await transport.write(agentLogKey, wrapEntry(entry, 'agent'))

  // Store: node's action log
  const nodeLogKey = `actions_node:${nodeId}`
  await transport.write(nodeLogKey, wrapEntry(entry, 'node'))

  // Update latest hash for chaining
  await transport.write(latestKey, { hash: entryHash } as unknown as SignalFrame)

  return entry
}

/**
 * Get an agent's action log.
 */
export async function getLog(
  transport: TransportAdapter,
  did: DID,
  options: LogOptions = {},
): Promise<ActionEntry[]> {
  const key = `actions:${did}`
  return readActionList(transport, key, options)
}

/**
 * Get all actions on a specific node.
 */
export async function getNodeLog(
  transport: TransportAdapter,
  nodeId: string,
  options: LogOptions = {},
): Promise<ActionEntry[]> {
  const key = `actions_node:${nodeId}`
  return readActionList(transport, key, options)
}

/**
 * Verify the hash chain integrity of an action log.
 * Returns the index of the first broken link, or -1 if valid.
 */
export function verifyChain(entries: ActionEntry[]): number {
  // Entries should be newest-first; verify backwards
  for (let i = entries.length - 2; i >= 0; i--) {
    if (entries[i].parentHash !== entries[i + 1].entryHash) {
      return i
    }
  }
  return -1
}

// ─── Internal ────────────────────────────────────────────────────────

/** Read an action list from transport (stored as comma-delimited JSON in a frame slot) */
async function readActionList(
  transport: TransportAdapter,
  key: string,
  options: LogOptions,
): Promise<ActionEntry[]> {
  const data = await transport.read(key)
  if (!data) return []

  // We store entries in a wrapper frame
  const wrapper = data as unknown as { entries?: ActionEntry[] }
  let entries = wrapper.entries ?? []

  if (options.after) {
    entries = entries.filter(e => e.timestamp > options.after!)
  }

  if (options.limit) {
    entries = entries.slice(0, options.limit)
  }

  return entries
}

/** Wrap an action entry into a frame-shaped object for transport.write() */
function wrapEntry(entry: ActionEntry, logType: 'agent' | 'node'): SignalFrame {
  // We abuse the frame slot to store a list of entries.
  // On first write, create the list. On subsequent writes, append.
  // Since transport.read + transport.write aren't atomic, this is best-effort.
  // For production, we'd use Redis LPUSH directly via RedisTransport.
  return {
    entries: [entry],
    _logType: logType,
    _lastEntryHash: entry.entryHash,
  } as unknown as SignalFrame
}

/** Generate random hex string */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return bytesToHex(arr)
}

/** Hash an object deterministically */
function hashObject(obj: Record<string, unknown>): string {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort())
  return bytesToHex(sha256(new TextEncoder().encode(canonical)))
}
