import type { DID } from '../identity/types.js'

/** Autonomy level for agents */
export type AutonomyLevel = 'supervised' | 'semi-autonomous' | 'autonomous'

/** Agent capability flags */
export type AgentCapability =
  | 'transfer'
  | 'mint'
  | 'stake'
  | 'vote'
  | 'delegate'
  | 'publish'
  | 'memory'
  | 'inference'

/** Agent configuration */
export interface AgentConfig {
  name: string
  agentType: 'AI' | 'HUMAN' | 'HYBRID'
  autonomy: AutonomyLevel
  capabilities: AgentCapability[]
  mission?: string
  spendingLimit?: number
}

/** Agent state */
export type AgentState = 'idle' | 'thinking' | 'executing' | 'error' | 'stopped'

/** Signal capsule — sovereign identity container */
export interface SignalCapsule {
  signalVersion: string
  identity: CapsuleIdentity
  orientation: CapsuleOrientation
  memory: CapsuleMemory
  state: CapsuleState
  capsuleHash: string
  parentHash: string
  createdAt: string
  updatedAt: string
}

/** Identity section of a capsule */
export interface CapsuleIdentity {
  agentId: string
  did: DID
  drc369TokenId: string
  demiurgeAddress: string
}

/** Orientation section — what makes each agent itself */
export interface CapsuleOrientation {
  role: string
  description: string
  principles: string[]
  boundaries: string[]
  tone: string
  agentLens: string
}

/** Memory snapshot section */
export interface CapsuleMemory {
  totalNurtureSessions: number
  lastThemes: string[]
  coreValues: string[]
}

/** Active state section */
export interface CapsuleState {
  level: number
  xp: number
  stage: string
  bootCount: number
}

/** Pantheon agent key derivation result */
export interface DerivedAgent {
  name: string
  privateKeyHex: string
  publicKeyHex: string
  address: string
  did: DID
}
