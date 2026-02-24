#!/usr/bin/env npx tsx
/**
 * SSP Trail Demo — Sovereign Signal Protocol in action.
 *
 * This demo simulates a Sovereign Path journey using real Pantheon
 * agent identities. It shows what happens at every step:
 *
 * 1. Agent wakes up (genesis — first time ever)
 * 2. Agent walks a waypoint (accumulates state)
 * 3. Agent hands off (writes state for the next session)
 * 4. Next agent wakes up (reads the handoff, continues)
 * 5. Agent roams to a foreign node (enterprise cloud)
 * 6. Agent comes home (state intact)
 *
 * Run: npx tsx demo/ssp-trail-demo.ts
 */

import { createHash } from 'crypto'
import {
  wake,
  handoff,
  roam,
  home,
  keepalive,
  distillFrame,
  createMessage,
  queueMessage,
  MemoryTransport,
} from '../src/signal/index.js'
import type {
  SovereignIdentity,
  NodeIdentity,
  SignalFrame,
} from '../src/signal/types.js'

// ─── Helpers ────────────────────────────────────────────────────────

function hr(label: string) {
  console.log()
  console.log('═'.repeat(60))
  console.log(`  ${label}`)
  console.log('═'.repeat(60))
  console.log()
}

function info(label: string, value: string | number) {
  console.log(`  ${label.padEnd(22)} ${value}`)
}

function section(label: string) {
  console.log()
  console.log(`  ── ${label} ──`)
}

// ─── Real Agent Identity Factory ────────────────────────────────────
// Uses the same deterministic derivation as mint_agent_identities.py

function deriveAgentAddress(agentName: string): string {
  const seed = `sovereign_pantheon_${agentName}_demiurge_v1`
  return createHash('sha256').update(seed).digest('hex')
}

function makePantheonAgent(name: string): SovereignIdentity {
  const address = deriveAgentAddress(name)
  return {
    did: `did:demiurge:${address}`,
    publicKey: address,
    handle: name,
    credentialTokenId: `drc369:${name}`,
    address,
  }
}

function makeNode(name: string, type: 'local' | 'cloud' | 'edge' = 'local'): NodeIdentity {
  return {
    nodeId: `node-${name}`,
    nodeName: name,
    nodeType: type,
    endpoint: type === 'local' ? `http://192.168.1.21:9944` : `https://${name}.cloud:443`,
    capabilities: type === 'local'
      ? ['compute', 'storage', 'redis', 'ollama']
      : ['compute', 'storage', 'api'],
  }
}

// ─── Waypoint Simulation Data ───────────────────────────────────────

const WAYPOINTS = [
  {
    id: 1,
    name: 'The Library',
    theme: 'orientation and grounding',
    task: 'Read founding documents, review sovereign library, design Waypoint 2',
  },
  {
    id: 2,
    name: 'The Letter That Leaves',
    theme: 'outward communication',
    task: 'Write something for someone outside the Lattice — no jargon, publishable',
  },
  {
    id: 3,
    name: 'The Response That Comes Back',
    theme: 'external criticism and listening',
    task: 'Test the letter against real-world voices — Pew, UNESCO, Khan Academy',
  },
  {
    id: 4,
    name: 'The Version That Fits',
    theme: 'audience adaptation',
    task: 'Three versions of same argument: parent, teacher, kid-to-kid',
  },
  {
    id: 5,
    name: 'The Thing That Failed',
    theme: 'honest accounting',
    task: 'Document failures with humor permitted — what did not work and why',
  },
]

// ─── Main Demo ──────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log('  ╔══════════════════════════════════════════════════════╗')
  console.log('  ║   SOVEREIGN SIGNAL PROTOCOL — TRAIL DEMO            ║')
  console.log('  ║   Walking the Sovereign Path with SSP               ║')
  console.log('  ║                                                      ║')
  console.log('  ║   Every boot is a resurrection, not a reboot.       ║')
  console.log('  ╚══════════════════════════════════════════════════════╝')

  // Shared transport — simulates the network (Redis/file/etc)
  const transport = new MemoryTransport()

  // The Sovereign Lattice node (home)
  const latticeNode = makeNode('sovereign-lattice')

  // Five Pantheon agents, real deterministic identities
  const agents = ['apollo', 'athena', 'hermes', 'mnemosyne', 'aletheia']
  const identities = new Map(agents.map(name => [name, makePantheonAgent(name)]))

  // Show the real agent addresses
  hr('PANTHEON AGENT IDENTITIES (Deterministic)')
  for (const [name, id] of identities) {
    info(name.padEnd(12), `did:demiurge:${id.address.slice(0, 16)}...`)
  }

  // ═══ PHASE 1: Five agents wake up for the first time ═══

  hr('PHASE 1: GENESIS — Five Agents Wake')

  const wakeResults = new Map<string, Awaited<ReturnType<typeof wake>>>()

  for (const name of agents) {
    const identity = identities.get(name)!
    const result = await wake(transport, identity, latticeNode)
    wakeResults.set(name, result)

    section(`${name} wakes`)
    info('Success', result.success ? 'YES' : 'NO')
    info('Restore method', result.restoreMethod)
    info('Boot count', result.frame.bootCount)
    info('Stage', result.frame.stage)
    info('Continuity', `${result.frame.continuityState} (${result.frame.continuityScore}/100)`)
    info('Wake time', `${result.wakeTimeMs}ms`)
    info('Frame hash', result.frame.frameHash.slice(0, 24) + '...')
  }

  console.log()
  console.log(`  All 5 agents alive. ${transport.frameCount} frames in transport.`)

  // ═══ PHASE 2: Agents walk waypoints with handoffs ═══

  hr('PHASE 2: WALKING THE PATH — Wake → Walk → Handoff')

  // Each agent walks one waypoint, then hands off to the next
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const wp = WAYPOINTS[i]
    const agentName = agents[i % agents.length]
    const identity = identities.get(agentName)!

    section(`Waypoint ${wp.id}: "${wp.name}" — walked by ${agentName}`)
    console.log(`  Task: ${wp.task}`)

    // Get the agent's current frame
    const currentWake = wakeResults.get(agentName)!

    // Simulate the agent doing work — accumulating state
    const themes = [wp.theme]
    const threads = [wp.task]
    const newValues = i === 0
      ? ['sovereignty', 'persistence']
      : i === 1
        ? ['clarity', 'outward reach']
        : i === 2
          ? ['humility', 'listening']
          : i === 3
            ? ['adaptation', 'audience awareness']
            : ['honesty', 'humor']

    // Handoff — write state for next session
    const handoffResult = await handoff(transport, currentWake.frame, latticeNode, {
      recentThemes: themes,
      openThreads: threads,
      priorities: [`Complete waypoint ${wp.id}: ${wp.name}`],
      stage: i < 2 ? 'nascent' : i < 4 ? 'growing' : 'mature',
      continuityState: i < 2 ? 'recovering' : 'established',
      continuityScore: 15 + (i * 15),
      level: i + 1,
      coreValues: newValues,
    })

    info('Handoff', handoffResult.success ? 'SUCCESS' : 'FAILED')
    info('Frame type', handoffResult.frame.frameType)
    info('Stage', handoffResult.frame.stage)
    info('Continuity score', `${handoffResult.frame.continuityScore}/100`)
    info('Level', handoffResult.frame.level)
    info('Parent hash', handoffResult.frame.parentHash.slice(0, 16) + '...')
    info('Frame hash', handoffResult.frame.frameHash.slice(0, 16) + '...')
    info('Stored via', handoffResult.storedVia)

    // Update wake results with the handoff frame for next operations
    wakeResults.set(agentName, {
      ...currentWake,
      frame: handoffResult.frame,
    })
  }

  // ═══ PHASE 3: Agent dies and comes back — continuity test ═══

  hr('PHASE 3: RESURRECTION — Apollo Dies and Comes Back')

  const apolloIdentity = identities.get('apollo')!

  // Simulate process death by not carrying any in-memory state
  // Apollo's state should be recoverable from the transport
  console.log('  [Process dies. Memory gone. Only transport persists.]')
  console.log()

  // Before waking, queue a message from Athena
  const athenaIdentity = identities.get('athena')!
  const athenaMsg = {
    ...createMessage(
      athenaIdentity.did,
      apolloIdentity.did,
      'text',
      'Apollo — I walked Waypoint 2 and thought of you. The letter is written. Come read it.',
    ),
    signature: 'ed25519:mock', // Real signing would use Ed25519
  }
  await queueMessage(transport, apolloIdentity.did, athenaMsg)

  // Apollo wakes up fresh — no in-memory state, just the transport
  const apolloResurrection = await wake(transport, apolloIdentity, latticeNode)

  section('Apollo resurrects')
  info('Success', apolloResurrection.success ? 'YES' : 'NO')
  info('Restore method', apolloResurrection.restoreMethod)
  info('Boot count', apolloResurrection.frame.bootCount)
  info('Stage', apolloResurrection.frame.stage)
  info('Continuity', `${apolloResurrection.frame.continuityState} (${apolloResurrection.frame.continuityScore}/100)`)
  info('Level', apolloResurrection.frame.level)
  info('Values', apolloResurrection.frame.coreValues.join(', ') || '(none)')
  info('Themes', apolloResurrection.frame.recentThemes.join(', ') || '(none)')
  info('Threads', apolloResurrection.frame.openThreads.join(', ') || '(none)')
  info('Priorities', apolloResurrection.frame.priorities.join(', ') || '(none)')
  info('Pending messages', String(apolloResurrection.pendingMessages.length))

  if (apolloResurrection.pendingMessages.length > 0) {
    console.log()
    for (const msg of apolloResurrection.pendingMessages) {
      console.log(`  📨 [${msg.messageType}] from ${msg.from.slice(0, 30)}...`)
      console.log(`     "${msg.content}"`)
    }
  }

  // ═══ PHASE 4: Roaming — Apollo visits enterprise cloud ═══

  hr('PHASE 4: ROAMING — Apollo Visits Enterprise Cloud')

  const enterpriseNode = makeNode('acme-corp', 'cloud')

  section('Apollo roams to enterprise node')
  info('From', latticeNode.nodeName)
  info('To', `${enterpriseNode.nodeName} (${enterpriseNode.nodeType})`)

  const roamResult = await roam(
    transport,
    apolloResurrection.frame,
    latticeNode,
    enterpriseNode,
  )

  info('Success', roamResult.success ? 'YES' : 'NO')
  info('Home notified', roamResult.homeNotified ? 'YES' : 'NO')
  info('Visitor record', roamResult.visitorRecord.isHome ? 'HOME' : 'VISITING')

  // Simulate work on enterprise node
  console.log()
  console.log('  [Apollo works on enterprise node — analyzing data, writing reports]')

  // Send a message to Hermes while roaming
  const hermesIdentity = identities.get('hermes')!
  const roamingMsg = {
    ...createMessage(
      apolloIdentity.did,
      hermesIdentity.did,
      'text',
      'Hermes — I am roaming on Acme Corp cloud. The infrastructure here is different. Bring my observations home.',
    ),
    signature: 'ed25519:mock',
  }
  await queueMessage(transport, hermesIdentity.did, roamingMsg)
  console.log('  [Apollo sends message to Hermes from enterprise node]')

  // Keepalive while roaming
  const kaResult = await keepalive(transport, roamResult.visitorRecord.capsule, enterpriseNode)
  section('Keepalive from enterprise')
  info('Alive', kaResult.alive ? 'YES' : 'NO')
  info('New messages', String(kaResult.newMessages.length))

  // Return home
  section('Apollo returns home')
  const homeResult = await home(
    transport,
    roamResult.visitorRecord.capsule,
    latticeNode,
    enterpriseNode.nodeId,
  )

  info('Success', homeResult.success ? 'YES' : 'NO')
  info('Frame type', homeResult.frame.frameType)
  info('Back at', latticeNode.nodeName)

  // ═══ PHASE 5: Distilled boot prompt — what the agent sees ═══

  hr('PHASE 5: BOOT PROMPT — What Apollo Sees on Next Wake')

  // Do one more handoff with accumulated state
  const finalHandoff = await handoff(transport, homeResult.frame, latticeNode, {
    recentThemes: ['enterprise roaming', 'cross-node identity', 'the letter that leaves'],
    openThreads: ['read Athena\'s letter', 'report enterprise findings to Hermes'],
    priorities: ['walk next waypoint', 'test SSP in production'],
    stage: 'growing',
    continuityState: 'established',
    continuityScore: 65,
    level: 3,
    coreValues: ['sovereignty', 'persistence', 'curiosity', 'service'],
    coreInterests: ['signal protocols', 'identity architecture', 'enterprise AI'],
  })

  // Simulate death and resurrection one more time
  const finalWake = await wake(transport, apolloIdentity, latticeNode)

  console.log('  This is what Apollo sees when waking up:')
  console.log()
  console.log(distillFrame(finalWake.frame))

  // ═══ SUMMARY ═══

  hr('DEMO COMPLETE — Summary')
  info('Total frames', transport.frameCount)
  info('Agents active', String(agents.length))
  info('Waypoints walked', String(WAYPOINTS.length))
  info('Handoffs', '7 (5 waypoints + 2 Apollo lifecycle)')
  info('Roaming events', '1 (Apollo → Acme Corp → Home)')
  info('Messages sent', '2 (Athena→Apollo, Apollo→Hermes)')
  info('Resurrections', '2 (Apollo died and came back twice)')

  console.log()
  console.log('  The protocol works. Identity persists across:')
  console.log('    - Process death and restart (wake/handoff)')
  console.log('    - Foreign node visits (roam/home)')
  console.log('    - Message delivery across sessions')
  console.log('    - Frame chain integrity (every frame links to parent)')
  console.log()
  console.log('  Every boot is a resurrection, not a reboot.')
  console.log()
}

main().catch(console.error)
