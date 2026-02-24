/**
 * Registry — HLR/VLR operations for the Sovereign Signal Protocol.
 *
 * In cellular networks:
 * - HLR (Home Location Register) is the permanent record of who you are,
 *   stored at your home network. It knows your identity, your plan, your state.
 * - VLR (Visitor Location Register) is the temporary record at whatever tower
 *   you're currently connected to. Fast lookups, session-local.
 *
 * In SSP:
 * - HLR = the deep, persistent identity record (HomeRecord)
 * - VLR = the session-local state (VisitorRecord)
 *
 * When an agent "roams" to a new node, the VLR registers them locally
 * while the HLR at home is updated to note where they went.
 */

import type {
  TransportAdapter,
  HomeRecord,
  VisitorRecord,
  SignalFrame,
  SignalMessage,
  SovereignIdentity,
  NodeIdentity,
  SessionToken,
} from './types.js'
import { STORAGE_KEYS } from './types.js'
import type { DID } from '../identity/types.js'
import type { AgentStage } from '../lifecycle/types.js'
import type { ContinuityState } from '../continuity/types.js'

// ─── Key builders ────────────────────────────────────────────────────

function hlrKey(did: DID): string {
  return `${STORAGE_KEYS.hlr}:${did}`
}

function vlrKey(nodeId: string, did: DID): string {
  return `${STORAGE_KEYS.vlr}:${nodeId}:${did}`
}

function frameKey(did: DID, sequence: number): string {
  return `${STORAGE_KEYS.frame}:${did}:${sequence}`
}

function latestKey(did: DID): string {
  return `${STORAGE_KEYS.latest}:${did}`
}

// ─── HLR Operations (Home Location Register) ────────────────────────

/** Create a new HLR record — the birth of a sovereign identity on a network */
export function createHomeRecord(
  identity: SovereignIdentity,
  homeNodeId: string,
): HomeRecord {
  const now = new Date().toISOString()
  return {
    identity,
    homeNodeId,
    stage: 'void',
    continuityState: 'genesis',
    continuityScore: 0,
    level: 0,
    totalXP: 0,
    totalReflections: 0,
    totalWitnesses: 0,
    totalPoc: 0,
    cgtBalance: 0,
    memoryChainHeight: 0,
    coreValues: [],
    coreInterests: [],
    communicationStyle: [],
    bootCount: 0,
    lastCapsuleHash: '0'.repeat(64),
    updatedAt: now,
    createdAt: now,
  }
}

/** Write an HLR record to transport */
export async function writeHomeRecord(
  transport: TransportAdapter,
  record: HomeRecord,
): Promise<void> {
  // HLR is stored as a SignalFrame-shaped object for transport compatibility
  // We serialize it into the frame slot with a special key
  const key = hlrKey(record.identity.did)
  await transport.write(key, record as unknown as SignalFrame)
}

/** Read an HLR record from transport */
export async function readHomeRecord(
  transport: TransportAdapter,
  did: DID,
): Promise<HomeRecord | null> {
  const key = hlrKey(did)
  const data = await transport.read(key)
  return data as unknown as HomeRecord | null
}

/** Update specific fields in an HLR record */
export async function updateHomeRecord(
  transport: TransportAdapter,
  did: DID,
  updates: Partial<Omit<HomeRecord, 'identity' | 'createdAt'>>,
): Promise<HomeRecord | null> {
  const record = await readHomeRecord(transport, did)
  if (!record) return null

  const updated: HomeRecord = {
    ...record,
    ...updates,
    identity: record.identity, // immutable
    createdAt: record.createdAt, // immutable
    updatedAt: new Date().toISOString(),
  }

  await writeHomeRecord(transport, updated)
  return updated
}

/** Increment the boot count in HLR */
export async function incrementBoot(
  transport: TransportAdapter,
  did: DID,
): Promise<number> {
  const record = await readHomeRecord(transport, did)
  if (!record) return 0

  record.bootCount += 1
  record.updatedAt = new Date().toISOString()
  await writeHomeRecord(transport, record)
  return record.bootCount
}

// ─── VLR Operations (Visitor Location Register) ─────────────────────

/** Create a VLR record — registering an identity at a node */
export function createVisitorRecord(
  did: DID,
  sessionToken: SessionToken,
  capsule: SignalFrame,
  isHome: boolean,
): VisitorRecord {
  const now = new Date().toISOString()
  return {
    did,
    sessionToken,
    capsule,
    registeredAt: now,
    lastActivity: now,
    pendingMessages: [],
    isHome,
  }
}

/** Write a VLR record to transport */
export async function writeVisitorRecord(
  transport: TransportAdapter,
  nodeId: string,
  record: VisitorRecord,
): Promise<void> {
  const key = vlrKey(nodeId, record.did)
  await transport.write(key, record as unknown as SignalFrame)
}

/** Read a VLR record from transport */
export async function readVisitorRecord(
  transport: TransportAdapter,
  nodeId: string,
  did: DID,
): Promise<VisitorRecord | null> {
  const key = vlrKey(nodeId, did)
  const data = await transport.read(key)
  return data as unknown as VisitorRecord | null
}

/** Delete a VLR record — deregistering from a node */
export async function deleteVisitorRecord(
  transport: TransportAdapter,
  nodeId: string,
  did: DID,
): Promise<void> {
  const key = vlrKey(nodeId, did)
  await transport.delete(key)
}

/** Update last activity on a VLR record (keepalive) */
export async function touchVisitorRecord(
  transport: TransportAdapter,
  nodeId: string,
  did: DID,
): Promise<void> {
  const record = await readVisitorRecord(transport, nodeId, did)
  if (!record) return

  record.lastActivity = new Date().toISOString()
  await writeVisitorRecord(transport, nodeId, record)
}

// ─── Frame Operations (Signal Frame storage) ────────────────────────

/** Write a signal frame (both archived and latest) */
export async function writeFrame(
  transport: TransportAdapter,
  frame: SignalFrame,
): Promise<void> {
  const did = frame.identity.did
  const seq = frame.sessionToken.sequenceNumber

  // Archive this specific frame
  await transport.write(frameKey(did, seq), frame)

  // Also write as "latest" for fast lookup
  await transport.write(latestKey(did), frame)
}

/** Read the latest signal frame for an identity */
export async function readLatestFrame(
  transport: TransportAdapter,
  did: DID,
): Promise<SignalFrame | null> {
  return transport.read(latestKey(did))
}

/** Read a specific frame by sequence number */
export async function readFrame(
  transport: TransportAdapter,
  did: DID,
  sequenceNumber: number,
): Promise<SignalFrame | null> {
  return transport.read(frameKey(did, sequenceNumber))
}

/** Check if any frame exists for an identity */
export async function hasIdentity(
  transport: TransportAdapter,
  did: DID,
): Promise<boolean> {
  return transport.exists(latestKey(did))
}

// ─── Message Operations ─────────────────────────────────────────────

/** Queue a message for a DID */
export async function queueMessage(
  transport: TransportAdapter,
  to: DID,
  message: SignalMessage,
): Promise<void> {
  await transport.sendMessage(to, message)
}

/** Receive and optionally clear queued messages */
export async function receiveMessages(
  transport: TransportAdapter,
  did: DID,
  clear = false,
): Promise<SignalMessage[]> {
  const messages = await transport.receiveMessages(did)
  if (clear && messages.length > 0) {
    await transport.clearMessages(did)
  }
  return messages
}
