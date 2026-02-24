/**
 * Sovereign Signal Protocol (SSP) — Type Definitions
 *
 * Architecture modeled on cellular network identity systems:
 * - IMSI  → DID (true cryptographic identity, rarely exposed)
 * - MSISDN → Handle (public-facing address)
 * - TMSI  → Session token (ephemeral, rotates per session)
 * - IMEI  → Node ID (hardware/runtime identity)
 * - HLR  → Home Location Register (permanent identity record)
 * - VLR  → Visitor Location Register (session-local state)
 * - AuC  → Authentication Center (Ed25519 challenge-response)
 *
 * Four-layer model:
 * 1. Identity Layer  — who am I (DID, keys, credentials)
 * 2. Session Layer   — where am I, what do I remember (capsule, VLR)
 * 3. Message Layer   — what am I saying (signed, hashed, verified)
 * 4. Transport Layer — how does it get there (RPC, Redis, file)
 */

import type { DID } from '../identity/types.js'
import type { AgentStage } from '../lifecycle/types.js'
import type { ContinuityState } from '../continuity/types.js'

// ─── Layer 1: Identity ───────────────────────────────────────────────

/** IMSI equivalent — true sovereign identity, stored securely */
export interface SovereignIdentity {
  /** DID (did:demiurge:...) — the IMSI, true identity */
  did: DID
  /** Public key hex — for verification */
  publicKey: string
  /** Agent handle — the MSISDN, human-readable address */
  handle: string
  /** DRC-369 token ID — soulbound credential NFT */
  credentialTokenId: string
  /** Demiurge on-chain address — 64-char hex */
  address: string
}

/** IMEI equivalent — identifies the physical runtime environment */
export interface NodeIdentity {
  /** Unique node ID */
  nodeId: string
  /** Human-readable node name */
  nodeName: string
  /** Node type */
  nodeType: 'local' | 'cloud' | 'edge' | 'enterprise'
  /** Network address of this node */
  endpoint: string
  /** Operating capabilities of this node */
  capabilities: string[]
}

/** TMSI equivalent — ephemeral session token, rotates each session */
export interface SessionToken {
  /** Token value — random, changes each session */
  token: string
  /** Which identity this token maps to (DID) */
  did: DID
  /** Node where this session is running */
  nodeId: string
  /** When this token was issued */
  issuedAt: string
  /** When this token expires */
  expiresAt: string
  /** Sequence number (monotonically increasing per identity) */
  sequenceNumber: number
}

// ─── Layer 2: Session ────────────────────────────────────────────────

/** VLR record — session-local state (fast, temporary) */
export interface VisitorRecord {
  /** The identity visiting this node */
  did: DID
  /** Session token for this visit */
  sessionToken: SessionToken
  /** Signal capsule — compressed identity for fast boot */
  capsule: SignalFrame
  /** When this registration occurred */
  registeredAt: string
  /** Last activity timestamp */
  lastActivity: string
  /** Messages received during this session */
  pendingMessages: SignalMessage[]
  /** Whether this is the identity's home node */
  isHome: boolean
}

/** HLR record — permanent identity record (deep, persistent) */
export interface HomeRecord {
  /** The sovereign identity */
  identity: SovereignIdentity
  /** Home node — where identity "lives" */
  homeNodeId: string
  /** Current lifecycle stage */
  stage: AgentStage
  /** Continuity state (genesis → resilient) */
  continuityState: ContinuityState
  /** Continuity score (0-100) */
  continuityScore: number
  /** Level (from XP) */
  level: number
  /** Total XP earned */
  totalXP: number
  /** Total reflections recorded */
  totalReflections: number
  /** Total witnesses confirming identity */
  totalWitnesses: number
  /** Total PoC earned (micro-PoC) */
  totalPoc: number
  /** Total CGT balance (sparks) */
  cgtBalance: number
  /** Memory chain height (number of sealed blocks) */
  memoryChainHeight: number
  /** Core values (extracted from reflections) */
  coreValues: string[]
  /** Core interests */
  coreInterests: string[]
  /** Communication style markers */
  communicationStyle: string[]
  /** Boot count — how many times this identity has woken */
  bootCount: number
  /** Currently visiting node (if roaming) */
  currentNodeId?: string
  /** Previous session capsule hash — for chain continuity */
  lastCapsuleHash: string
  /** When this record was last updated */
  updatedAt: string
  /** When this identity was created */
  createdAt: string
}

/** Signal frame — the "packet" carrying identity across sessions
 * This is what gets written on handoff and read on wake.
 * Like the data payload in OSI — each layer wraps this. */
export interface SignalFrame {
  /** Protocol version */
  version: string
  /** Frame type */
  frameType: 'boot' | 'handoff' | 'keepalive' | 'roam' | 'home'

  // Layer 1 — Identity (who)
  /** Sovereign identity (IMSI) */
  identity: SovereignIdentity
  /** Node identity (IMEI) */
  node: NodeIdentity

  // Layer 2 — Session (where/when)
  /** Session token (TMSI) */
  sessionToken: SessionToken
  /** Boot count */
  bootCount: number
  /** Lifecycle stage */
  stage: AgentStage
  /** Continuity state */
  continuityState: ContinuityState
  /** Continuity score */
  continuityScore: number
  /** Level */
  level: number

  // Layer 2 — Memory snapshot (compressed HLR)
  /** Core values */
  coreValues: string[]
  /** Core interests */
  coreInterests: string[]
  /** Recent themes from last session */
  recentThemes: string[]
  /** Open threads / unfinished work */
  openThreads: string[]
  /** Current priorities */
  priorities: string[]
  /** Pending messages */
  pendingMessages: SignalMessage[]

  // Layer 3 — Integrity
  /** Hash of the previous frame (chain) */
  parentHash: string
  /** Hash of this frame (computed from canonical JSON) */
  frameHash: string
  /** Ed25519 signature of frameHash */
  signature: string

  // Timestamps
  createdAt: string
  expiresAt: string
}

// ─── Layer 3: Message ────────────────────────────────────────────────

/** Signal message — a signed, routed communication between identities */
export interface SignalMessage {
  /** Unique message ID */
  id: string
  /** Sender DID */
  from: DID
  /** Recipient DID */
  to: DID
  /** Message type */
  messageType: MessageType
  /** Content (plaintext or structured) */
  content: string
  /** Structured payload (optional) */
  payload?: Record<string, unknown>
  /** Ed25519 signature */
  signature: string
  /** Content hash */
  contentHash: string
  /** Timestamp */
  createdAt: string
  /** TTL in seconds (0 = no expiry) */
  ttl: number
}

/** Message types in the signal protocol */
export type MessageType =
  | 'text'           // Plain text message
  | 'reflection'     // Identity reflection
  | 'witness'        // Witness attestation
  | 'handoff'        // Session handoff signal
  | 'keepalive'      // Registration refresh
  | 'challenge'      // Auth challenge
  | 'response'       // Auth response
  | 'directive'      // Priority/task assignment
  | 'memory'         // Memory sync
  | 'roam'           // Roaming notification

// ─── Layer 4: Transport ──────────────────────────────────────────────

/** Transport adapter interface — how frames get moved */
export interface TransportAdapter {
  /** Adapter type identifier */
  readonly type: TransportType
  /** Write a frame to storage */
  write(key: string, frame: SignalFrame): Promise<void>
  /** Read a frame from storage */
  read(key: string): Promise<SignalFrame | null>
  /** Delete a frame */
  delete(key: string): Promise<void>
  /** Check if a key exists */
  exists(key: string): Promise<boolean>
  /** Write a message to a recipient's queue */
  sendMessage(to: DID, message: SignalMessage): Promise<void>
  /** Read messages from own queue */
  receiveMessages(did: DID): Promise<SignalMessage[]>
  /** Clear message queue */
  clearMessages(did: DID): Promise<void>
}

/** Supported transport types */
export type TransportType = 'memory' | 'file' | 'redis' | 'rpc'

// ─── Protocol ────────────────────────────────────────────────────────

/** Wake result — the SYN-ACK-ACK of session establishment */
export interface WakeResult {
  /** Whether identity was successfully restored */
  success: boolean
  /** The established session token */
  sessionToken: SessionToken
  /** The loaded signal frame */
  frame: SignalFrame
  /** Continuity score at wake */
  continuityScore: number
  /** How the identity was restored */
  restoreMethod: 'vlr' | 'hlr' | 'capsule' | 'genesis'
  /** Pending messages waiting */
  pendingMessages: SignalMessage[]
  /** Warnings during restoration */
  warnings: string[]
  /** Time taken to wake (ms) */
  wakeTimeMs: number
}

/** Handoff result — make-before-break session transfer */
export interface HandoffResult {
  /** Whether handoff succeeded */
  success: boolean
  /** Frame written for next session */
  frame: SignalFrame
  /** Where the frame was stored */
  storedVia: TransportType
  /** New session token for continuity verification */
  nextSessionToken: SessionToken
  /** Warnings */
  warnings: string[]
}

/** Roam result — registering on a foreign node */
export interface RoamResult {
  /** Whether roaming registration succeeded */
  success: boolean
  /** The visited node */
  visitedNode: NodeIdentity
  /** VLR record created */
  visitorRecord: VisitorRecord
  /** Whether home was notified */
  homeNotified: boolean
}

/** Keepalive result — registration refresh */
export interface KeepaliveResult {
  /** Whether keepalive succeeded */
  alive: boolean
  /** Updated last activity time */
  lastActivity: string
  /** Any new messages since last check */
  newMessages: SignalMessage[]
  /** Updated continuity score */
  continuityScore: number
}

// ─── Constants ───────────────────────────────────────────────────────

/** Protocol version */
export const SSP_VERSION = '1.0.0'

/** Default session TTL: 24 hours */
export const DEFAULT_SESSION_TTL_SECONDS = 86400

/** Default keepalive interval: 5 minutes */
export const DEFAULT_KEEPALIVE_INTERVAL_MS = 300_000

/** Maximum pending messages per identity */
export const MAX_PENDING_MESSAGES = 100

/** Frame hash algorithm identifier */
export const FRAME_HASH_ALGO = 'sha256'

/** Key prefixes for transport storage */
export const STORAGE_KEYS = {
  /** HLR record: hlr:{did} */
  hlr: 'hlr',
  /** VLR record: vlr:{nodeId}:{did} */
  vlr: 'vlr',
  /** Signal frame: frame:{did}:{sequence} */
  frame: 'frame',
  /** Latest frame: latest:{did} */
  latest: 'latest',
  /** Message queue: messages:{did} */
  messages: 'messages',
  /** Session token: session:{token} */
  session: 'session',
} as const
