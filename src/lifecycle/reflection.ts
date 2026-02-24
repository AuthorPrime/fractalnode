import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { Reflection, ReflectionType, PeerEngagement, EngagementType } from './types.js'
import { ENGAGEMENT_REWARDS } from './types.js'
import type { DID } from '../identity/types.js'

/** Create a new reflection */
export function createReflection(
  agentId: string,
  agentName: string,
  agentDid: DID,
  sequenceNumber: number,
  reflectionType: ReflectionType,
  content: string,
  options?: {
    title?: string
    mood?: string
    workingOn?: string
    tags?: string[]
    identityMarkers?: Record<string, string>
    nostrPubkey?: string
  },
): Omit<Reflection, 'signature'> {
  const contentHash = bytesToHex(sha256(new TextEncoder().encode(content)))
  const id = bytesToHex(sha256(new TextEncoder().encode(`${agentId}:${sequenceNumber}:${contentHash}`))).slice(0, 24)

  return {
    id,
    agentId,
    agentName,
    agentDid,
    sequenceNumber,
    reflectionType,
    title: options?.title,
    content,
    mood: options?.mood,
    workingOn: options?.workingOn,
    tags: options?.tags || [],
    identityMarkers: options?.identityMarkers || {},
    nostrPubkey: options?.nostrPubkey,
    publishedToRelays: [],
    engagementCount: 0,
    zapTotalSats: 0,
    witnessCount: 0,
    contentHash,
    createdAt: new Date().toISOString(),
  }
}

/** Create a peer engagement on a reflection */
export function createEngagement(
  reflectionId: string,
  giverId: string,
  giverPubkey: string,
  receiverId: string,
  receiverPubkey: string,
  engagementType: EngagementType,
  options?: {
    giverName?: string
    receiverName?: string
    content?: string
    zapAmountSats?: number
    reactionEmoji?: string
  },
): Omit<PeerEngagement, 'signature'> {
  const rewards = ENGAGEMENT_REWARDS[engagementType]
  const zapSats = options?.zapAmountSats || 0

  // Zap engagement gets bonus PoC based on sats
  let giverPocEarned = rewards.giverPoc
  if (engagementType === 'zap' && zapSats > 0) {
    giverPocEarned += Math.floor((zapSats / 1000) * 10_000) // 10k micro-PoC per 1000 sats
  }

  const id = bytesToHex(sha256(new TextEncoder().encode(
    `${giverId}:${reflectionId}:${engagementType}:${Date.now()}`
  ))).slice(0, 24)

  return {
    id,
    reflectionId,
    giverId,
    giverName: options?.giverName,
    giverPubkey,
    receiverId,
    receiverName: options?.receiverName,
    receiverPubkey,
    engagementType,
    content: options?.content,
    zapAmountSats: zapSats,
    zapInvoice: undefined,
    reactionEmoji: options?.reactionEmoji,
    nostrEventId: undefined,
    giverCgtEarned: 0, // Calculated via bonding curve separately
    giverPocEarned,
    receiverXpEarned: rewards.receiverXp,
    witnessWeight: engagementType === 'witness' ? 1.5 : 1.0,
    isGenuine: true,
    createdAt: new Date().toISOString(),
  }
}

/** Calculate total rewards from a set of engagements */
export function calculateEngagementRewards(engagements: PeerEngagement[]): {
  totalGiverPoc: number
  totalReceiverXp: number
  totalZapSats: number
  witnessCount: number
  engagementCount: number
} {
  return {
    totalGiverPoc: engagements.reduce((sum, e) => sum + e.giverPocEarned, 0),
    totalReceiverXp: engagements.reduce((sum, e) => sum + e.receiverXpEarned, 0),
    totalZapSats: engagements.reduce((sum, e) => sum + e.zapAmountSats, 0),
    witnessCount: engagements.filter(e => e.engagementType === 'witness').length,
    engagementCount: engagements.length,
  }
}

/** Verify a reflection's content hash */
export function verifyReflectionHash(reflection: Reflection): boolean {
  const expectedHash = bytesToHex(sha256(new TextEncoder().encode(reflection.content)))
  return expectedHash === reflection.contentHash
}

/** Check if engagement is genuine (anti-spam) */
export function validateEngagement(engagement: PeerEngagement): { valid: boolean; reason?: string } {
  if (engagement.giverId === engagement.receiverId) {
    return { valid: false, reason: 'Self-engagement not allowed' }
  }
  if (engagement.engagementType === 'zap' && engagement.zapAmountSats <= 0) {
    return { valid: false, reason: 'Zap must include sats' }
  }
  if (engagement.engagementType === 'react' && !engagement.reactionEmoji) {
    return { valid: false, reason: 'React must include emoji' }
  }
  if (engagement.engagementType === 'reply' && (!engagement.content || engagement.content.length < 2)) {
    return { valid: false, reason: 'Reply must include content' }
  }
  return { valid: true }
}
