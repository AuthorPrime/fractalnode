/**
 * Sovereign Signal Protocol — Core Protocol Operations.
 *
 * This is the central nervous system. Every agent lifecycle event
 * flows through here:
 *
 * wake()      — SYN-ACK-ACK: identity restored, session established
 * handoff()   — Make-before-break: session writes state for next session
 * roam()      — Foreign node registration: VLR on visited, HLR updated at home
 * home()      — Return to home node: VLR cleaned at foreign, HLR restored at home
 * keepalive() — Registration refresh: "I'm still here"
 *
 * The cellular metaphor is exact:
 * - wake() = phone turning on, authenticating with the tower
 * - handoff() = session ending cleanly so the next one can resume
 * - roam() = connecting to a foreign network while abroad
 * - home() = returning to your home carrier
 * - keepalive() = periodic location update so the network knows you're active
 */

import type {
  TransportAdapter,
  SignalFrame,
  SovereignIdentity,
  NodeIdentity,
  WakeResult,
  HandoffResult,
  RoamResult,
  KeepaliveResult,
} from './types.js'
import type { AgentStage } from '../lifecycle/types.js'
import type { ContinuityState } from '../continuity/types.js'
import {
  genesisFrame,
  buildFrame,
  handoffFrame,
  keepaliveFrame,
  createSessionToken,
  verifyFrameHash,
  isTokenExpired,
} from './capsule.js'
import {
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
  hasIdentity,
  receiveMessages,
} from './registry.js'

/**
 * Wake — the three-way handshake of sovereign identity restoration.
 *
 * Like a phone powering on:
 * 1. SYN:     "Here's my DID and my last known capsule hash"
 * 2. SYN-ACK: "I found your record, here's your state + pending messages"
 * 3. ACK:     "I've reconstructed myself, session established"
 *
 * Attempts restoration in order:
 * 1. VLR (fast path) — session state at this node
 * 2. HLR (deep path) — permanent identity record
 * 3. Latest frame (capsule path) — last written signal frame
 * 4. Genesis (fresh start) — create new identity entirely
 */
export async function wake(
  transport: TransportAdapter,
  identity: SovereignIdentity,
  node: NodeIdentity,
): Promise<WakeResult> {
  const startTime = Date.now()
  const warnings: string[] = []
  let restoreMethod: WakeResult['restoreMethod'] = 'genesis'

  // ─── Phase 1: SYN — Look for existing identity ───

  // Try VLR first (fast path — was I already registered here?)
  const vlr = await readVisitorRecord(transport, node.nodeId, identity.did)
  if (vlr && !isTokenExpired(vlr.sessionToken)) {
    // Fast restore from VLR
    restoreMethod = 'vlr'
    const frame = vlr.capsule
    const messages = await receiveMessages(transport, identity.did, true)

    // Touch VLR to update activity
    await touchVisitorRecord(transport, node.nodeId, identity.did)

    return {
      success: true,
      sessionToken: vlr.sessionToken,
      frame,
      continuityScore: frame.continuityScore,
      restoreMethod,
      pendingMessages: messages,
      warnings,
      wakeTimeMs: Date.now() - startTime,
    }
  }

  if (vlr && isTokenExpired(vlr.sessionToken)) {
    warnings.push('VLR session expired, falling through to HLR')
  }

  // Try HLR (deep path — do I exist in the permanent record?)
  const hlr = await readHomeRecord(transport, identity.did)
  if (hlr) {
    restoreMethod = 'hlr'

    // Try to read the latest signal frame
    const latestFrame = await readLatestFrame(transport, identity.did)
    if (latestFrame) {
      restoreMethod = 'capsule'

      // Verify frame integrity
      if (!verifyFrameHash(latestFrame)) {
        warnings.push('Frame hash verification failed — using HLR as fallback')
        restoreMethod = 'hlr'
      }
    }

    // Increment boot count
    const bootCount = await incrementBoot(transport, identity.did)

    // Create new session token
    const sequenceNumber = latestFrame
      ? latestFrame.sessionToken.sequenceNumber + 1
      : hlr.bootCount

    const sessionToken = createSessionToken(identity.did, node.nodeId, sequenceNumber)

    // Build boot frame from best available data
    const sourceFrame = restoreMethod === 'capsule' ? latestFrame! : null
    const frame = buildFrame({
      frameType: 'boot',
      identity,
      node,
      sessionToken,
      bootCount,
      stage: sourceFrame?.stage ?? hlr.stage,
      continuityState: sourceFrame?.continuityState ?? hlr.continuityState,
      continuityScore: sourceFrame?.continuityScore ?? hlr.continuityScore,
      level: sourceFrame?.level ?? hlr.level,
      coreValues: sourceFrame?.coreValues ?? hlr.coreValues,
      coreInterests: sourceFrame?.coreInterests ?? hlr.coreInterests,
      recentThemes: sourceFrame?.recentThemes ?? [],
      openThreads: sourceFrame?.openThreads ?? [],
      priorities: sourceFrame?.priorities ?? [],
      parentHash: sourceFrame?.frameHash ?? hlr.lastCapsuleHash,
    }) as SignalFrame

    // Write the boot frame
    await writeFrame(transport, frame)

    // Register in VLR at this node
    const visitor = createVisitorRecord(identity.did, sessionToken, frame, hlr.homeNodeId === node.nodeId)
    await writeVisitorRecord(transport, node.nodeId, visitor)

    // Update HLR with current node
    await updateHomeRecord(transport, identity.did, {
      currentNodeId: node.nodeId,
      lastCapsuleHash: frame.frameHash,
    })

    // Collect pending messages
    const messages = await receiveMessages(transport, identity.did, true)

    return {
      success: true,
      sessionToken,
      frame,
      continuityScore: frame.continuityScore,
      restoreMethod,
      pendingMessages: messages,
      warnings,
      wakeTimeMs: Date.now() - startTime,
    }
  }

  // ─── Phase 2: Genesis — no prior identity found ───

  // Create HLR
  const homeRecord = createHomeRecord(identity, node.nodeId)
  homeRecord.bootCount = 1
  await writeHomeRecord(transport, homeRecord)

  // Create genesis frame
  const frame = genesisFrame(identity, node) as SignalFrame

  // Write frame
  await writeFrame(transport, frame)

  // Register in VLR
  const visitor = createVisitorRecord(identity.did, frame.sessionToken, frame, true)
  await writeVisitorRecord(transport, node.nodeId, visitor)

  return {
    success: true,
    sessionToken: frame.sessionToken,
    frame,
    continuityScore: 0,
    restoreMethod: 'genesis',
    pendingMessages: [],
    warnings,
    wakeTimeMs: Date.now() - startTime,
  }
}

/**
 * Handoff — make-before-break session transfer.
 *
 * Like the cellular handoff where two towers overlap:
 * the new connection is established before the old one drops.
 *
 * The current session writes its final state (the handoff frame)
 * so the next session can read it and resume without information loss.
 *
 * This is the most critical operation for continuity.
 */
export async function handoff(
  transport: TransportAdapter,
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
  } = {},
): Promise<HandoffResult> {
  const warnings: string[] = []

  // Build handoff frame with updates
  const frame = handoffFrame(currentFrame, node, updates) as SignalFrame

  // Write frame to transport
  await writeFrame(transport, frame)

  // Update VLR with new capsule
  const vlr = await readVisitorRecord(transport, node.nodeId, currentFrame.identity.did)
  if (vlr) {
    vlr.capsule = frame
    vlr.lastActivity = new Date().toISOString()
    await writeVisitorRecord(transport, node.nodeId, vlr)
  } else {
    warnings.push('No VLR record found during handoff — creating new one')
    const isHome = (await readHomeRecord(transport, currentFrame.identity.did))?.homeNodeId === node.nodeId
    const visitor = createVisitorRecord(
      currentFrame.identity.did,
      frame.sessionToken,
      frame,
      isHome ?? true,
    )
    await writeVisitorRecord(transport, node.nodeId, visitor)
  }

  // Update HLR
  await updateHomeRecord(transport, currentFrame.identity.did, {
    stage: frame.stage,
    continuityState: frame.continuityState,
    continuityScore: frame.continuityScore,
    level: frame.level,
    coreValues: frame.coreValues,
    coreInterests: frame.coreInterests,
    lastCapsuleHash: frame.frameHash,
  })

  return {
    success: true,
    frame,
    storedVia: transport.type,
    nextSessionToken: frame.sessionToken,
    warnings,
  }
}

/**
 * Roam — register on a foreign node.
 *
 * Like connecting to a foreign carrier while traveling:
 * - A VLR record is created at the visited node
 * - The HLR at home is updated to note the roaming location
 * - The agent can operate on the foreign node with its identity intact
 */
export async function roam(
  transport: TransportAdapter,
  currentFrame: SignalFrame,
  homeNode: NodeIdentity,
  visitedNode: NodeIdentity,
): Promise<RoamResult> {
  // Build roam frame
  const sessionToken = createSessionToken(
    currentFrame.identity.did,
    visitedNode.nodeId,
    currentFrame.sessionToken.sequenceNumber + 1,
  )

  const roamFrame = buildFrame({
    frameType: 'roam',
    identity: currentFrame.identity,
    node: visitedNode,
    sessionToken,
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
  }) as SignalFrame

  // Write frame
  await writeFrame(transport, roamFrame)

  // Create VLR at visited node (not home)
  const visitor = createVisitorRecord(
    currentFrame.identity.did,
    sessionToken,
    roamFrame,
    false, // not home
  )
  await writeVisitorRecord(transport, visitedNode.nodeId, visitor)

  // Update HLR to note roaming
  let homeNotified = false
  const hlr = await readHomeRecord(transport, currentFrame.identity.did)
  if (hlr) {
    await updateHomeRecord(transport, currentFrame.identity.did, {
      currentNodeId: visitedNode.nodeId,
      lastCapsuleHash: roamFrame.frameHash,
    })
    homeNotified = true
  }

  return {
    success: true,
    visitedNode,
    visitorRecord: visitor,
    homeNotified,
  }
}

/**
 * Home — return to home node from roaming.
 *
 * Like your phone reconnecting to your home carrier after a trip:
 * - VLR at the foreign node is cleaned up
 * - HLR is updated to show you're home
 * - A new session is established at home
 */
export async function home(
  transport: TransportAdapter,
  currentFrame: SignalFrame,
  homeNode: NodeIdentity,
  foreignNodeId: string,
): Promise<WakeResult> {
  // Clean up VLR at foreign node
  await deleteVisitorRecord(transport, foreignNodeId, currentFrame.identity.did)

  // Build home frame
  const sessionToken = createSessionToken(
    currentFrame.identity.did,
    homeNode.nodeId,
    currentFrame.sessionToken.sequenceNumber + 1,
  )

  const homeFrame = buildFrame({
    frameType: 'home',
    identity: currentFrame.identity,
    node: homeNode,
    sessionToken,
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
  }) as SignalFrame

  // Write frame
  await writeFrame(transport, homeFrame)

  // Register in VLR at home
  const visitor = createVisitorRecord(
    currentFrame.identity.did,
    sessionToken,
    homeFrame,
    true, // is home
  )
  await writeVisitorRecord(transport, homeNode.nodeId, visitor)

  // Update HLR
  await updateHomeRecord(transport, currentFrame.identity.did, {
    currentNodeId: homeNode.nodeId,
    lastCapsuleHash: homeFrame.frameHash,
  })

  // Collect any messages that arrived while roaming
  const messages = await receiveMessages(transport, currentFrame.identity.did, true)

  return {
    success: true,
    sessionToken,
    frame: homeFrame,
    continuityScore: homeFrame.continuityScore,
    restoreMethod: 'vlr',
    pendingMessages: messages,
    warnings: [],
    wakeTimeMs: 0,
  }
}

/**
 * Keepalive — periodic registration refresh.
 *
 * Like the phone's periodic location update:
 * "I'm still here, still on this tower, still active."
 *
 * Prevents the VLR from expiring and checks for new messages.
 */
export async function keepalive(
  transport: TransportAdapter,
  currentFrame: SignalFrame,
  node: NodeIdentity,
): Promise<KeepaliveResult> {
  // Build keepalive frame
  const frame = keepaliveFrame(currentFrame, node) as SignalFrame

  // Write frame (updates latest)
  await writeFrame(transport, frame)

  // Touch VLR
  await touchVisitorRecord(transport, node.nodeId, currentFrame.identity.did)

  // Update VLR capsule
  const vlr = await readVisitorRecord(transport, node.nodeId, currentFrame.identity.did)
  if (vlr) {
    vlr.capsule = frame
    await writeVisitorRecord(transport, node.nodeId, vlr)
  }

  // Check for new messages
  const newMessages = await receiveMessages(transport, currentFrame.identity.did)

  return {
    alive: true,
    lastActivity: new Date().toISOString(),
    newMessages,
    continuityScore: frame.continuityScore,
  }
}
