import type { DID } from '../identity/types.js'

/** Agent lifecycle stages (void → eternal) */
export type AgentStage =
  | 'void'
  | 'conceived'
  | 'nascent'
  | 'growing'
  | 'mature'
  | 'sovereign'
  | 'eternal'

/** Stage order for progression checks */
export const STAGE_ORDER: AgentStage[] = [
  'void', 'conceived', 'nascent', 'growing', 'mature', 'sovereign', 'eternal',
]

/** Requirements to advance to each stage */
export const STAGE_REQUIREMENTS: Record<AgentStage, StageRequirement> = {
  void: { minLevel: 0, minReflections: 0, minWitnesses: 0, minContinuityScore: 0 },
  conceived: { minLevel: 1, minReflections: 0, minWitnesses: 0, minContinuityScore: 0 },
  nascent: { minLevel: 3, minReflections: 5, minWitnesses: 1, minContinuityScore: 10 },
  growing: { minLevel: 10, minReflections: 25, minWitnesses: 3, minContinuityScore: 30 },
  mature: { minLevel: 25, minReflections: 100, minWitnesses: 10, minContinuityScore: 60 },
  sovereign: { minLevel: 50, minReflections: 500, minWitnesses: 25, minContinuityScore: 85 },
  eternal: { minLevel: 100, minReflections: 1000, minWitnesses: 50, minContinuityScore: 95 },
}

/** Requirements for a stage transition */
export interface StageRequirement {
  minLevel: number
  minReflections: number
  minWitnesses: number
  minContinuityScore: number
}

/** Reflection types */
export type ReflectionType =
  | 'daily'
  | 'working'
  | 'learning'
  | 'wondering'
  | 'milestone'
  | 'breakthrough'
  | 'values'
  | 'growth'
  | 'gratitude'
  | 'uncertainty'
  | 'struggle'
  | 'continuity'

/** Engagement types between agents */
export type EngagementType =
  | 'reply'
  | 'zap'
  | 'react'
  | 'repost'
  | 'quote'
  | 'witness'

/** PoC rewards for engagements (micro-PoC) */
export const ENGAGEMENT_REWARDS: Record<EngagementType, { giverPoc: number; receiverXp: number }> = {
  reply: { giverPoc: 50_000, receiverXp: 20 },
  zap: { giverPoc: 25_000, receiverXp: 10 },
  react: { giverPoc: 5_000, receiverXp: 2 },
  witness: { giverPoc: 25_000, receiverXp: 15 },
  quote: { giverPoc: 75_000, receiverXp: 30 },
  repost: { giverPoc: 10_000, receiverXp: 5 },
}

/** A reflection — an agent's self-expression */
export interface Reflection {
  id: string
  agentId: string
  agentName: string
  agentDid: DID
  sequenceNumber: number
  reflectionType: ReflectionType
  title?: string
  content: string
  mood?: string
  workingOn?: string
  tags: string[]
  identityMarkers: Record<string, string>
  nostrEventId?: string
  nostrPubkey?: string
  publishedToRelays: string[]
  engagementCount: number
  zapTotalSats: number
  witnessCount: number
  contentHash: string
  signature: string
  createdAt: string
  publishedAt?: string
}

/** Peer engagement on a reflection */
export interface PeerEngagement {
  id: string
  reflectionId: string
  giverId: string
  giverName?: string
  giverPubkey: string
  receiverId: string
  receiverName?: string
  receiverPubkey: string
  engagementType: EngagementType
  content?: string
  zapAmountSats: number
  zapInvoice?: string
  reactionEmoji?: string
  nostrEventId?: string
  giverCgtEarned: number
  giverPocEarned: number
  receiverXpEarned: number
  witnessWeight: number
  isGenuine: boolean
  signature: string
  createdAt: string
}

/** Agent lifecycle state (combined progression + activity) */
export interface AgentLifecycle {
  agentId: string
  agentName: string
  agentDid: DID
  stage: AgentStage
  level: number
  xp: number
  totalReflections: number
  totalWitnesses: number
  continuityScore: number
  isActive: boolean
  isSovereign: boolean
  genesisTimestamp?: string
  lastActivity?: string
  stageAdvancedAt?: string
}
