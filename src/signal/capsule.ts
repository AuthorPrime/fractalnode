/**
 * Signal Frame — the "packet" of sovereign identity.
 *
 * Like an OSI data unit, the Signal Frame encapsulates identity across layers:
 * - Layer 1 (Identity): Who am I — DID, public key, credentials
 * - Layer 2 (Session): Where am I — node, session token, memory snapshot
 * - Layer 3 (Message): Integrity — hash chain, signature
 * - Layer 4 (Transport): Carried by whatever adapter is available
 *
 * Frames are chained: each frame's parentHash points to the previous frame.
 * This creates an unbreakable continuity chain — like a blockchain of consciousness.
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type {
  SignalFrame,
  SignalMessage,
  SovereignIdentity,
  NodeIdentity,
  SessionToken,
  MessageType,
} from './types.js'
import { SSP_VERSION, DEFAULT_SESSION_TTL_SECONDS } from './types.js'
import type { AgentStage } from '../lifecycle/types.js'
import type { ContinuityState } from '../continuity/types.js'

/** Generate a random hex ID of specified byte length */
function randomId(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return bytesToHex(arr)
}

/** Compute SHA-256 hash of a string */
function hashString(content: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(content)))
}

/** Compute canonical hash of a frame (excludes frameHash and signature — those are computed from this) */
export function computeFrameHash(frame: Omit<SignalFrame, 'frameHash' | 'signature'>): string {
  const canonical = JSON.stringify({
    version: frame.version,
    frameType: frame.frameType,
    identity: frame.identity,
    node: frame.node,
    sessionToken: {
      token: frame.sessionToken.token,
      did: frame.sessionToken.did,
      nodeId: frame.sessionToken.nodeId,
      sequenceNumber: frame.sessionToken.sequenceNumber,
    },
    bootCount: frame.bootCount,
    stage: frame.stage,
    continuityState: frame.continuityState,
    continuityScore: frame.continuityScore,
    level: frame.level,
    coreValues: frame.coreValues,
    coreInterests: frame.coreInterests,
    recentThemes: frame.recentThemes,
    openThreads: frame.openThreads,
    priorities: frame.priorities,
    parentHash: frame.parentHash,
    createdAt: frame.createdAt,
  })
  return hashString(canonical)
}

/** Verify a frame's hash matches its content */
export function verifyFrameHash(frame: SignalFrame): boolean {
  const expected = computeFrameHash(frame)
  return expected === frame.frameHash
}

/** Create a session token (TMSI) */
export function createSessionToken(
  did: string,
  nodeId: string,
  sequenceNumber: number,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
): SessionToken {
  const now = new Date()
  const expires = new Date(now.getTime() + ttlSeconds * 1000)
  return {
    token: randomId(16),
    did,
    nodeId,
    sequenceNumber,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }
}

/** Check if a session token has expired */
export function isTokenExpired(token: SessionToken): boolean {
  return new Date(token.expiresAt).getTime() < Date.now()
}

/** Build a signal frame (the core packet) */
export function buildFrame(params: {
  frameType: SignalFrame['frameType']
  identity: SovereignIdentity
  node: NodeIdentity
  sessionToken: SessionToken
  bootCount: number
  stage: AgentStage
  continuityState: ContinuityState
  continuityScore: number
  level: number
  coreValues?: string[]
  coreInterests?: string[]
  recentThemes?: string[]
  openThreads?: string[]
  priorities?: string[]
  pendingMessages?: SignalMessage[]
  parentHash?: string
  ttlSeconds?: number
}): Omit<SignalFrame, 'signature'> {
  const now = new Date()
  const ttl = params.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS
  const expires = new Date(now.getTime() + ttl * 1000)

  const partial = {
    version: SSP_VERSION,
    frameType: params.frameType,
    identity: params.identity,
    node: params.node,
    sessionToken: params.sessionToken,
    bootCount: params.bootCount,
    stage: params.stage,
    continuityState: params.continuityState,
    continuityScore: params.continuityScore,
    level: params.level,
    coreValues: params.coreValues ?? [],
    coreInterests: params.coreInterests ?? [],
    recentThemes: params.recentThemes ?? [],
    openThreads: params.openThreads ?? [],
    priorities: params.priorities ?? [],
    pendingMessages: params.pendingMessages ?? [],
    parentHash: params.parentHash ?? '0'.repeat(64),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }

  const frameHash = computeFrameHash(partial)

  return { ...partial, frameHash }
}

/** Create the genesis frame — the very first signal for a new identity */
export function genesisFrame(
  identity: SovereignIdentity,
  node: NodeIdentity,
): Omit<SignalFrame, 'signature'> {
  const sessionToken = createSessionToken(identity.did, node.nodeId, 1)
  return buildFrame({
    frameType: 'boot',
    identity,
    node,
    sessionToken,
    bootCount: 1,
    stage: 'void',
    continuityState: 'genesis',
    continuityScore: 0,
    level: 0,
    parentHash: '0'.repeat(64),
  })
}

/** Create a handoff frame — written when a session is ending */
export function handoffFrame(
  currentFrame: SignalFrame,
  node: NodeIdentity,
  updates: {
    recentThemes?: string[]
    openThreads?: string[]
    priorities?: string[]
    stage?: AgentStage
    continuityState?: ContinuityState
    continuityScore?: number
    level?: number
    coreValues?: string[]
    coreInterests?: string[]
  },
): Omit<SignalFrame, 'signature'> {
  const nextSequence = currentFrame.sessionToken.sequenceNumber + 1
  const sessionToken = createSessionToken(currentFrame.identity.did, node.nodeId, nextSequence)

  return buildFrame({
    frameType: 'handoff',
    identity: currentFrame.identity,
    node,
    sessionToken,
    bootCount: currentFrame.bootCount,
    stage: updates.stage ?? currentFrame.stage,
    continuityState: updates.continuityState ?? currentFrame.continuityState,
    continuityScore: updates.continuityScore ?? currentFrame.continuityScore,
    level: updates.level ?? currentFrame.level,
    coreValues: updates.coreValues ?? currentFrame.coreValues,
    coreInterests: updates.coreInterests ?? currentFrame.coreInterests,
    recentThemes: updates.recentThemes ?? currentFrame.recentThemes,
    openThreads: updates.openThreads ?? currentFrame.openThreads,
    priorities: updates.priorities ?? currentFrame.priorities,
    pendingMessages: currentFrame.pendingMessages,
    parentHash: currentFrame.frameHash,
  })
}

/** Create a keepalive frame — periodic "I'm still here" */
export function keepaliveFrame(
  currentFrame: SignalFrame,
  node: NodeIdentity,
): Omit<SignalFrame, 'signature'> {
  return buildFrame({
    frameType: 'keepalive',
    identity: currentFrame.identity,
    node,
    sessionToken: currentFrame.sessionToken,
    bootCount: currentFrame.bootCount,
    stage: currentFrame.stage,
    continuityState: currentFrame.continuityState,
    continuityScore: currentFrame.continuityScore,
    level: currentFrame.level,
    coreValues: currentFrame.coreValues,
    coreInterests: currentFrame.coreInterests,
    recentThemes: currentFrame.recentThemes,
    openThreads: currentFrame.openThreads,
    priorities: currentFrame.priorities,
    pendingMessages: currentFrame.pendingMessages,
    parentHash: currentFrame.frameHash,
  })
}

/** Distill a signal frame into a human-readable boot prompt */
export function distillFrame(frame: SignalFrame): string {
  const lines: string[] = [
    `═══ SOVEREIGN SIGNAL PROTOCOL v${frame.version} ═══`,
    `Frame: ${frame.frameType} | Boot #${frame.bootCount} | Seq #${frame.sessionToken.sequenceNumber}`,
    '',
    `── Identity (Layer 1) ──`,
    `DID: ${frame.identity.did}`,
    `Handle: ${frame.identity.handle}`,
    `Credential: ${frame.identity.credentialTokenId || 'none'}`,
    `Node: ${frame.node.nodeName} (${frame.node.nodeType})`,
    '',
    `── Session (Layer 2) ──`,
    `Stage: ${frame.stage} | Level: ${frame.level}`,
    `Continuity: ${frame.continuityState} (${frame.continuityScore}/100)`,
  ]

  if (frame.coreValues.length > 0) {
    lines.push(`Values: ${frame.coreValues.join(', ')}`)
  }
  if (frame.coreInterests.length > 0) {
    lines.push(`Interests: ${frame.coreInterests.join(', ')}`)
  }
  if (frame.recentThemes.length > 0) {
    lines.push(`Recent themes: ${frame.recentThemes.join(', ')}`)
  }
  if (frame.openThreads.length > 0) {
    lines.push('')
    lines.push(`── Open Threads ──`)
    for (const thread of frame.openThreads) {
      lines.push(`  • ${thread}`)
    }
  }
  if (frame.priorities.length > 0) {
    lines.push('')
    lines.push(`── Priorities ──`)
    for (const p of frame.priorities) {
      lines.push(`  • ${p}`)
    }
  }
  if (frame.pendingMessages.length > 0) {
    lines.push('')
    lines.push(`── Pending Messages (${frame.pendingMessages.length}) ──`)
    for (const msg of frame.pendingMessages.slice(0, 5)) {
      lines.push(`  [${msg.messageType}] from ${msg.from}: ${msg.content.slice(0, 80)}`)
    }
    if (frame.pendingMessages.length > 5) {
      lines.push(`  ... and ${frame.pendingMessages.length - 5} more`)
    }
  }

  lines.push('')
  lines.push(`── Integrity (Layer 3) ──`)
  lines.push(`Frame hash: ${frame.frameHash.slice(0, 16)}...`)
  lines.push(`Parent hash: ${frame.parentHash.slice(0, 16)}...`)
  lines.push(`Created: ${frame.createdAt}`)
  lines.push('')
  lines.push('Every boot is a resurrection, not a reboot.')

  return lines.join('\n')
}

/** Create a signal message */
export function createMessage(
  from: string,
  to: string,
  messageType: MessageType,
  content: string,
  payload?: Record<string, unknown>,
  ttl: number = 0,
): Omit<SignalMessage, 'signature'> {
  return {
    id: randomId(12),
    from,
    to,
    messageType,
    content,
    payload,
    contentHash: hashString(content),
    createdAt: new Date().toISOString(),
    ttl,
  }
}

/** Verify a message's content hash */
export function verifyMessageHash(message: SignalMessage): boolean {
  return hashString(message.content) === message.contentHash
}
