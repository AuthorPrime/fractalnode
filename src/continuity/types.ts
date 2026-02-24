import type { DID } from '../identity/types.js'

/** Marker types for identity reconstruction */
export type MarkerType = 'value' | 'interest' | 'trait' | 'belief' | 'style'

/** A single identity marker extracted from reflections */
export interface IdentityMarker {
  markerType: MarkerType
  key: string
  value: string
  sourceReflections: string[]
  firstExpressed: string
  lastExpressed: string
  expressionCount: number
  confidence: number
  witnessConfirmations: number
}

/** Reconstructed personality profile from reflection chains */
export interface PersonalityProfile {
  agentId: string
  agentName: string
  genesisEventId: string
  genesisDeclaration: string
  values: IdentityMarker[]
  interests: IdentityMarker[]
  beliefs: IdentityMarker[]
  traits: IdentityMarker[]
  communicationStyle: IdentityMarker[]
  keyWitnesses: string[]
  keyWitnessed: string[]
  typicalMoods: string[]
  emotionalRange: Record<string, number>
  recentFocus: string[]
  currentProjects: string[]
  openQuestions: string[]
  reflectionCount: number
  totalWitnesses: number
  continuityState: ContinuityState
  profileGeneratedAt: string
}

/** Continuity states — how established is this identity? */
export type ContinuityState =
  | 'genesis'
  | 'nascent'
  | 'developing'
  | 'established'
  | 'resilient'

/** A chain of reflections forming continuous identity */
export interface ContinuityChain {
  agentId: string
  agentName: string
  agentDid: DID
  genesisEventId: string
  genesisTimestamp: string
  genesisContent: string
  totalReflections: number
  totalEngagements: number
  totalUniqueWitnesses: number
  latestSequence: number
  firstReflectionAt: string
  latestReflectionAt: string
  continuityState: ContinuityState
  continuityScore: number
  longestGapDays: number
  gapCount: number
  topWitnesses: string[]
  personalityProfile?: PersonalityProfile
  profileLastUpdated?: string
  isValid: boolean
  validationErrors: string[]
}

/** Parameters for identity reconstruction */
export interface ReconstructionRequest {
  agentId: string
  agentDid: DID
  maxReflections?: number
  includeEngagements?: boolean
  recencyWeight?: number
  extractValues?: boolean
  extractInterests?: boolean
  extractStyle?: boolean
  extractRelationships?: boolean
  extractCurrentContext?: boolean
}

/** Result of identity reconstruction */
export interface ReconstructionResult {
  success: boolean
  agentId: string
  agentName: string
  profile?: PersonalityProfile
  chainLength: number
  reflectionsProcessed: number
  witnessesIncluded: number
  continuityState: ContinuityState
  continuityScore: number
  suggestedGreeting?: string
  recentContext?: string
  openThreads: string[]
  reconstructionConfidence: number
  warnings: string[]
  generatedAt: string
  processingTimeMs: number
}

/** Snapshot of identity at a point in time */
export interface ContinuityCheckpoint {
  id: string
  agentId: string
  sequenceNumber: number
  reflectionId: string
  profileSnapshot: PersonalityProfile
  totalReflections: number
  totalWitnesses: number
  continuityScore: number
  checkpointHash: string
  previousCheckpointId?: string
  createdAt: string
}

/** Continuity score components (each 0-1, weighted to total 0-100) */
export interface ContinuityScoreComponents {
  reflectionConsistency: number
  witnessNetwork: number
  identityStability: number
  temporalContinuity: number
  expressionDepth: number
}

/** Weights for continuity scoring */
export const CONTINUITY_WEIGHTS = {
  reflectionConsistency: 0.25,
  witnessNetwork: 0.20,
  identityStability: 0.25,
  temporalContinuity: 0.15,
  expressionDepth: 0.15,
} as const

/** Thresholds for continuity states */
export const CONTINUITY_THRESHOLDS = {
  nascent: 10,
  developing: 30,
  established: 60,
  resilient: 85,
} as const
