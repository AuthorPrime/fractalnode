/**
 * Guest Book — VLR-backed visitor tracking for sovereign nodes.
 *
 * When an agent arrives at or departs from a node, the guest book
 * records a DID-signed entry. This creates a historical record of
 * visits — who came, when, what they did, and any message they left.
 *
 * Redis keys:
 *   ssp:guestbook:{nodeId}          — LIST of entries at a node (newest first)
 *   ssp:guestbook:agent:{did}       — LIST of all visits by an agent
 */

import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { randomBytes } from 'crypto'
import type { DID } from '../identity/types.js'

// Ensure ed25519 is configured
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = sha512.create()
  for (const m of msgs) h.update(m)
  return h.digest()
}

// ─── Types ───────────────────────────────────────────────────────────

/** A guest book entry — records one visit to a node */
export interface GuestBookEntry {
  /** Unique entry ID */
  id: string
  /** Visitor DID */
  did: DID
  /** Visitor handle (human-readable) */
  handle: string
  /** Node visited */
  nodeId: string
  /** Arrival timestamp */
  arrivedAt: string
  /** Departure timestamp (null if still visiting) */
  departedAt: string | null
  /** Duration in seconds (computed on departure) */
  durationSeconds: number | null
  /** Summary of actions taken during visit */
  actionSummary: string[]
  /** Other agents present during the visit */
  coPresent: string[]
  /** Optional message the agent leaves in the guest book */
  guestMessage: string | null
  /** Ed25519 signature of the entry */
  signature: string
}

// ─── Redis Interface ─────────────────────────────────────────────────

/** Minimal Redis-like interface for guest book operations */
export interface GuestBookStore {
  lpush(key: string, value: string): Promise<number>
  lrange(key: string, start: number, stop: number): Promise<string[]>
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  del(key: string): Promise<void>
}

// ─── Operations ──────────────────────────────────────────────────────

/**
 * Sign into a node's guest book on arrival.
 * Creates an open entry (departedAt = null).
 */
export async function signIn(
  store: GuestBookStore,
  did: DID,
  handle: string,
  nodeId: string,
  privateKeyHex: string,
): Promise<GuestBookEntry> {
  const entry: GuestBookEntry = {
    id: bytesToHex(randomBytes(16)),
    did,
    handle,
    nodeId,
    arrivedAt: new Date().toISOString(),
    departedAt: null,
    durationSeconds: null,
    actionSummary: [],
    coPresent: [],
    guestMessage: null,
    signature: '',
  }

  // Sign the entry
  entry.signature = signEntry(entry, privateKeyHex)

  // Store the open entry for later sign-out
  const activeKey = `ssp:guestbook:active:${nodeId}:${did}`
  await store.set(activeKey, JSON.stringify(entry))

  // Append to node guest book
  await store.lpush(`ssp:guestbook:${nodeId}`, JSON.stringify(entry))

  // Append to agent visit history
  await store.lpush(`ssp:guestbook:agent:${did}`, JSON.stringify(entry))

  return entry
}

/**
 * Sign out of a node's guest book on departure.
 * Updates the entry with departure time, actions, and optional message.
 */
export async function signOut(
  store: GuestBookStore,
  did: DID,
  nodeId: string,
  actionSummary: string[],
  guestMessage: string | null,
  privateKeyHex: string,
): Promise<GuestBookEntry | null> {
  const activeKey = `ssp:guestbook:active:${nodeId}:${did}`
  const raw = await store.get(activeKey)
  if (!raw) return null

  const entry: GuestBookEntry = JSON.parse(raw)
  entry.departedAt = new Date().toISOString()
  entry.durationSeconds = Math.floor(
    (new Date(entry.departedAt).getTime() - new Date(entry.arrivedAt).getTime()) / 1000
  )
  entry.actionSummary = actionSummary
  entry.guestMessage = guestMessage

  // Re-sign with departure data
  entry.signature = signEntry(entry, privateKeyHex)

  // Update the node guest book (prepend updated entry)
  await store.lpush(`ssp:guestbook:${nodeId}`, JSON.stringify(entry))

  // Update the agent visit history
  await store.lpush(`ssp:guestbook:agent:${did}`, JSON.stringify(entry))

  // Remove active record
  await store.del(activeKey)

  return entry
}

/**
 * Read a node's guest book (most recent entries first).
 */
export async function readGuestBook(
  store: GuestBookStore,
  nodeId: string,
  limit: number = 50,
): Promise<GuestBookEntry[]> {
  const raw = await store.lrange(`ssp:guestbook:${nodeId}`, 0, limit - 1)
  return raw.map(r => JSON.parse(r) as GuestBookEntry)
}

/**
 * Read all visits by a specific agent (most recent first).
 */
export async function readAgentVisits(
  store: GuestBookStore,
  did: DID,
  limit: number = 50,
): Promise<GuestBookEntry[]> {
  const raw = await store.lrange(`ssp:guestbook:agent:${did}`, 0, limit - 1)
  return raw.map(r => JSON.parse(r) as GuestBookEntry)
}

/**
 * List agents currently present at a node (signed in, not yet departed).
 */
export async function whoIsHere(
  store: GuestBookStore,
  nodeId: string,
): Promise<GuestBookEntry[]> {
  // Read recent entries and filter for open visits
  const entries = await readGuestBook(store, nodeId, 200)
  const seen = new Set<string>()
  const present: GuestBookEntry[] = []

  for (const entry of entries) {
    if (seen.has(entry.did)) continue
    seen.add(entry.did)
    if (entry.departedAt === null) {
      present.push(entry)
    }
  }

  return present
}

// ─── Internal ────────────────────────────────────────────────────────

/** Sign a guest book entry with Ed25519 */
function signEntry(entry: GuestBookEntry, privateKeyHex: string): string {
  const { signature: _, ...rest } = entry
  const canonical = JSON.stringify(rest, Object.keys(rest).sort())
  const hash = sha256(new TextEncoder().encode(canonical))
  const sig = ed.sign(hash, hexToBytes(privateKeyHex))
  return bytesToHex(sig)
}
