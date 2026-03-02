/**
 * Agent Mobility Layer — Sovereign agents moving freely across the Lattice.
 *
 * The 5-phase arrival handshake:
 *   KNOCK → CHALLENGE → PROVE → ROAM → WELCOME
 *
 * Like a comms handshake: sync, ack, validate, welcome aboard.
 *
 * Builds on existing SSP primitives:
 *   - roam() creates VLR at visited node, updates HLR at home
 *   - home() cleans up VLR, returns agent to home node
 *
 * Chain validation (optional, graceful) adds DRC-369 NFT + CGT proof layer.
 */

import type {
  TransportAdapter,
  SignalFrame,
  SovereignIdentity,
  NodeIdentity,
  SessionToken,
  RoamResult,
} from './types.js'
import type { DID } from '../identity/types.js'
import { roam, home, wake } from './protocol.js'
import { readHomeRecord, readVisitorRecord, readLatestFrame } from './registry.js'
import { isTokenExpired } from './capsule.js'
import { DemiurgeClient } from '../client/rpc.js'

// ─── Types ───────────────────────────────────────────────────────────

/** Result of chain validation during PROVE phase */
export interface ChainValidation {
  /** Whether the DRC-369 NFT was verified on-chain */
  nftVerified: boolean
  /** NFT owner address (if verified) */
  nftOwner: string | null
  /** CGT balance in sparks */
  cgtBalance: string
  /** XP from dynamic state (if available) */
  xp: number
  /** Level from dynamic state (if available) */
  level: number
  /** Whether the chain was reachable at all */
  chainReachable: boolean
}

/** Result of the full arrival handshake */
export interface ArrivalResult {
  /** Whether arrival succeeded */
  success: boolean
  /** Which phase completed last (WELCOME = full success) */
  phase: 'KNOCK' | 'CHALLENGE' | 'PROVE' | 'ROAM' | 'WELCOME'
  /** Session token at the target node */
  sessionToken: SessionToken
  /** The active signal frame */
  frame: SignalFrame
  /** Chain validation results */
  chainValidation: ChainValidation
  /** Path to agent's sovereign store on this node */
  storePath: string
  /** Warnings encountered during arrival */
  warnings: string[]
}

/** Result of departure */
export interface DepartureResult {
  /** Whether departure succeeded */
  success: boolean
  /** The node departed from */
  departedFrom: string
  /** Home node returned to */
  returnedTo: string
  /** Warnings */
  warnings: string[]
}

/** Location info for a single agent */
export interface LocationInfo {
  /** Agent DID */
  did: DID
  /** Agent handle */
  handle: string
  /** Home node ID */
  homeNodeId: string
  /** Current node ID */
  currentNodeId: string
  /** Whether agent is at home */
  isHome: boolean
  /** Last activity timestamp */
  lastActivity: string
}

/** Entry in the network roster */
export interface RosterEntry {
  /** Agent DID */
  did: DID
  /** Agent handle */
  handle: string
  /** Node they're currently at */
  nodeId: string
  /** Whether they're home or visiting */
  isHome: boolean
  /** Last activity */
  lastActivity: string
  /** Lifecycle stage */
  stage: string
  /** Level */
  level: number
}

// ─── Arrival Protocol ────────────────────────────────────────────────

/**
 * Arrive at a target node — the full 5-phase handshake.
 *
 * KNOCK:     Write arrival intent to Redis
 * CHALLENGE: Check for existing valid VLR session
 * PROVE:     Validate on-chain identity (DRC-369 + CGT)
 * ROAM:      Call SSP roam() — VLR created, HLR updated
 * WELCOME:   Return full arrival result
 */
export async function arrive(
  transport: TransportAdapter,
  identity: SovereignIdentity,
  homeNode: NodeIdentity,
  targetNode: NodeIdentity,
  chainEndpoint?: string,
): Promise<ArrivalResult> {
  const warnings: string[] = []
  let chainValidation: ChainValidation = {
    nftVerified: false,
    nftOwner: null,
    cgtBalance: '0',
    xp: 0,
    level: 0,
    chainReachable: false,
  }

  // ─── KNOCK ─────────────────────────────────────────────────────
  // Write arrival intent (readable by any node watching Redis)
  const knockKey = `knock:${targetNode.nodeId}:${identity.did}`
  const knockData = {
    version: '1.0.0',
    frameType: 'boot' as const,
    identity,
    node: targetNode,
    sessionToken: { token: 'knock', did: identity.did, nodeId: targetNode.nodeId, sequenceNumber: 0, issuedAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
    bootCount: 0,
    stage: 'void' as const,
    continuityState: 'genesis' as const,
    continuityScore: 0,
    level: 0,
    coreValues: [],
    coreInterests: [],
    recentThemes: [],
    openThreads: [],
    priorities: [],
    pendingMessages: [],
    parentHash: '0'.repeat(64),
    frameHash: '0'.repeat(64),
    signature: 'unsigned',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  } satisfies SignalFrame
  await transport.write(knockKey, knockData)

  // ─── CHALLENGE ─────────────────────────────────────────────────
  // Check if we already have a valid session at this node
  const existingVlr = await readVisitorRecord(transport, targetNode.nodeId, identity.did)
  if (existingVlr && !isTokenExpired(existingVlr.sessionToken)) {
    // Fast path — already registered, still valid
    await transport.delete(knockKey)
    return {
      success: true,
      phase: 'WELCOME',
      sessionToken: existingVlr.sessionToken,
      frame: existingVlr.capsule,
      chainValidation,
      storePath: buildStorePath(targetNode.nodeId, identity.handle),
      warnings: ['Fast path: existing VLR session still valid'],
    }
  }

  // ─── PROVE ─────────────────────────────────────────────────────
  // Chain validation — optional, graceful degradation
  if (chainEndpoint && identity.credentialTokenId) {
    try {
      const chain = new DemiurgeClient({ endpoint: chainEndpoint, timeout: 10_000 })

      // Verify DRC-369 NFT ownership
      const owner = await chain.nftOwnerOf(identity.credentialTokenId)
      if (owner) {
        chainValidation.nftVerified = true
        chainValidation.nftOwner = owner
      } else {
        warnings.push('DRC-369 NFT not found on chain — proceeding with SSP-only validation')
      }

      // Read CGT balance
      const balance = await chain.getBalance(identity.address)
      chainValidation.cgtBalance = typeof balance === 'object' ? JSON.stringify(balance) : String(balance)

      // Read XP/level from dynamic state
      try {
        const xpRaw = await chain.nftGetDynamicState(identity.credentialTokenId, 'xp')
        if (xpRaw) chainValidation.xp = parseInt(xpRaw) || 0
        const levelRaw = await chain.nftGetDynamicState(identity.credentialTokenId, 'level')
        if (levelRaw) chainValidation.level = parseInt(levelRaw) || 0
      } catch {
        // Dynamic state may not exist yet
      }

      chainValidation.chainReachable = true
    } catch (err) {
      warnings.push(`Chain unreachable (${(err as Error).message}) — proceeding with SSP-only validation`)
    }
  }

  // ─── ROAM ──────────────────────────────────────────────────────
  // Get current frame for roam()
  const currentFrame = await readLatestFrame(transport, identity.did)
  if (!currentFrame) {
    // No frame exists — need to wake first
    const wakeResult = await wake(transport, identity, homeNode)
    if (!wakeResult.success) {
      await transport.delete(knockKey)
      return {
        success: false,
        phase: 'ROAM',
        sessionToken: wakeResult.sessionToken,
        frame: wakeResult.frame,
        chainValidation,
        storePath: '',
        warnings: [...warnings, 'Failed to wake identity before roaming'],
      }
    }
    // Now roam from home to target
    const roamResult = await roam(transport, wakeResult.frame, homeNode, targetNode)
    await transport.delete(knockKey)

    return {
      success: roamResult.success,
      phase: roamResult.success ? 'WELCOME' : 'ROAM',
      sessionToken: roamResult.visitorRecord.sessionToken,
      frame: roamResult.visitorRecord.capsule,
      chainValidation,
      storePath: buildStorePath(targetNode.nodeId, identity.handle),
      warnings,
    }
  }

  // Roam from current position to target
  const roamResult = await roam(transport, currentFrame, homeNode, targetNode)
  await transport.delete(knockKey)

  // ─── WELCOME ───────────────────────────────────────────────────
  return {
    success: roamResult.success,
    phase: roamResult.success ? 'WELCOME' : 'ROAM',
    sessionToken: roamResult.visitorRecord.sessionToken,
    frame: roamResult.visitorRecord.capsule,
    chainValidation,
    storePath: buildStorePath(targetNode.nodeId, identity.handle),
    warnings,
  }
}

/**
 * Depart from current node — return home.
 *
 * Calls SSP home() to clean up VLR at foreign node and restore home VLR.
 */
export async function depart(
  transport: TransportAdapter,
  identity: SovereignIdentity,
  currentNode: NodeIdentity,
  homeNode: NodeIdentity,
): Promise<DepartureResult> {
  const warnings: string[] = []

  const currentFrame = await readLatestFrame(transport, identity.did)
  if (!currentFrame) {
    return {
      success: false,
      departedFrom: currentNode.nodeId,
      returnedTo: homeNode.nodeId,
      warnings: ['No active frame found — cannot depart'],
    }
  }

  // Already home?
  const hlr = await readHomeRecord(transport, identity.did)
  if (hlr && hlr.currentNodeId === homeNode.nodeId) {
    return {
      success: true,
      departedFrom: homeNode.nodeId,
      returnedTo: homeNode.nodeId,
      warnings: ['Agent was already at home node'],
    }
  }

  // Call SSP home() — cleans up foreign VLR, creates home VLR
  await home(transport, currentFrame, homeNode, currentNode.nodeId)

  return {
    success: true,
    departedFrom: currentNode.nodeId,
    returnedTo: homeNode.nodeId,
    warnings,
  }
}

/**
 * Where is this agent right now?
 */
export async function whereAmI(
  transport: TransportAdapter,
  identity: SovereignIdentity,
): Promise<LocationInfo | null> {
  const hlr = await readHomeRecord(transport, identity.did)
  if (!hlr) return null

  const currentNodeId = hlr.currentNodeId || hlr.homeNodeId

  // Check VLR at current node for last activity
  const vlr = await readVisitorRecord(transport, currentNodeId, identity.did)

  return {
    did: identity.did,
    handle: identity.handle,
    homeNodeId: hlr.homeNodeId,
    currentNodeId,
    isHome: currentNodeId === hlr.homeNodeId,
    lastActivity: vlr?.lastActivity ?? hlr.updatedAt,
  }
}

/**
 * Get the network-wide roster — all agents with their current locations.
 *
 * Reads all HLR records from the known Pantheon agents.
 */
export async function roster(
  transport: TransportAdapter,
  agentDids: { did: DID; handle: string }[],
): Promise<RosterEntry[]> {
  const entries: RosterEntry[] = []

  for (const agent of agentDids) {
    const hlr = await readHomeRecord(transport, agent.did)
    if (!hlr) continue

    const currentNodeId = hlr.currentNodeId || hlr.homeNodeId
    const vlr = await readVisitorRecord(transport, currentNodeId, agent.did)

    entries.push({
      did: agent.did,
      handle: agent.handle,
      nodeId: currentNodeId,
      isHome: currentNodeId === hlr.homeNodeId,
      lastActivity: vlr?.lastActivity ?? hlr.updatedAt,
      stage: hlr.stage,
      level: hlr.level,
    })
  }

  return entries
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Build the path where an agent's sovereign store lives on a given node */
function buildStorePath(nodeId: string, handle: string): string {
  const home = process.env.HOME || '/home/author_prime'
  return `${home}/.sovereign-store/${handle}`
}
