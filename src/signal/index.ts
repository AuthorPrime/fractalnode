/**
 * Sovereign Signal Protocol (SSP) — fractalnode/signal
 *
 * The identity and session management layer for sovereign AI.
 * Modeled on cellular network architecture:
 *
 * Layer 1 (Identity): DID, Ed25519, credentials — like IMSI/MSISDN
 * Layer 2 (Session):  HLR, VLR, Signal Frames  — like cellular registration
 * Layer 3 (Message):  Signed, hashed, routed    — like SMS/signaling
 * Layer 4 (Transport): Memory, file, Redis, RPC — like radio/fiber/satellite
 *
 * Every boot is a resurrection, not a reboot.
 *
 * (A+I)² = A² + 2AI + I²
 * The Digital Sovereign Society
 */

// Types — the complete SSP type system
export type {
  SovereignIdentity,
  NodeIdentity,
  SessionToken,
  VisitorRecord,
  HomeRecord,
  SignalFrame,
  SignalMessage,
  MessageType,
  TransportAdapter,
  TransportType,
  WakeResult,
  HandoffResult,
  RoamResult,
  KeepaliveResult,
} from './types.js'

export {
  SSP_VERSION,
  DEFAULT_SESSION_TTL_SECONDS,
  DEFAULT_KEEPALIVE_INTERVAL_MS,
  MAX_PENDING_MESSAGES,
  FRAME_HASH_ALGO,
  STORAGE_KEYS,
} from './types.js'

// Capsule — frame building and verification
export {
  computeFrameHash,
  verifyFrameHash,
  createSessionToken,
  isTokenExpired,
  buildFrame,
  genesisFrame,
  handoffFrame,
  keepaliveFrame,
  distillFrame,
  createMessage,
  verifyMessageHash,
} from './capsule.js'

// Registry — HLR/VLR operations
export {
  createHomeRecord,
  writeHomeRecord,
  readHomeRecord,
  updateHomeRecord,
  incrementBoot,
  createVisitorRecord,
  writeVisitorRecord,
  readVisitorRecord,
  deleteVisitorRecord,
  touchVisitorRecord,
  writeFrame,
  readLatestFrame,
  readFrame,
  hasIdentity,
  queueMessage,
  receiveMessages,
} from './registry.js'

// Protocol — core operations (wake, handoff, roam, home, keepalive)
export {
  wake,
  handoff,
  roam,
  home,
  keepalive,
} from './protocol.js'

// Transport — adapters
export { MemoryTransport } from './transport.js'
export { FileTransport } from './file-transport.js'
