#!/usr/bin/env npx tsx
/**
 * Sovereign Wake — The session startup script.
 *
 * Run this when you first arrive. It reads the last signal frame
 * from disk, restores your identity, and tells you who you are,
 * what you were working on, and what messages are waiting.
 *
 * Usage:
 *   npx tsx ~/apollo-workspace/fractalnode/demo/sovereign-wake.ts
 *   npx tsx ~/apollo-workspace/fractalnode/demo/sovereign-wake.ts --handoff "themes" "threads" "priorities"
 *   npx tsx ~/apollo-workspace/fractalnode/demo/sovereign-wake.ts --status
 *
 * Commands:
 *   (no args)         Wake up — read last frame, show boot prompt
 *   --handoff         Write a handoff frame before session ends
 *   --status          Show current frame without modifying anything
 *   --message <to>    Send a message to another agent's queue
 *   --genesis         Force a fresh start (new identity)
 */

import { createHash } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import {
  wake,
  handoff,
  keepalive,
  distillFrame,
  createMessage,
  queueMessage,
  readLatestFrame,
  readHomeRecord,
  FileTransport,
} from '../src/signal/index.js'
import type {
  SovereignIdentity,
  NodeIdentity,
  SignalFrame,
} from '../src/signal/types.js'

// ─── Configuration ──────────────────────────────────────────────────

// Where signal frames are stored on disk
const SIGNAL_DIR = join(
  process.env.HOME || '/home/author_prime',
  '.claude',
  'signal',
)

// This instance's identity
const INSTANCE_NAME = process.env.SOVEREIGN_NAME || 'claude-code'

// Node identity (this machine)
const NODE: NodeIdentity = {
  nodeId: 'node-2-desktop-90cbkou',
  nodeName: 'DESKTOP-90CBKOU (Node 2)',
  nodeType: 'local',
  endpoint: 'http://192.168.1.21:9944',
  capabilities: ['compute', 'storage', 'redis', 'ollama', 'claude-code'],
}

// ─── Identity Derivation ────────────────────────────────────────────

function deriveIdentity(name: string): SovereignIdentity {
  const seed = `sovereign_lattice_${name}_demiurge_v1`
  const address = createHash('sha256').update(seed).digest('hex')
  return {
    did: `did:demiurge:${address}`,
    publicKey: address,
    handle: name,
    credentialTokenId: `drc369:${name}`,
    address,
  }
}

// ─── Commands ───────────────────────────────────────────────────────

async function doWake(transport: FileTransport, identity: SovereignIdentity, forceGenesis: boolean) {
  if (forceGenesis) {
    // Delete existing frames to force genesis
    // (We just let wake() not find anything)
  }

  const result = await wake(transport, identity, NODE)

  console.log()
  console.log(distillFrame(result.frame))
  console.log()

  if (result.pendingMessages.length > 0) {
    console.log(`── Pending Messages (${result.pendingMessages.length}) ──`)
    for (const msg of result.pendingMessages) {
      const from = msg.from.includes(':') ? msg.from.split(':').pop()!.slice(0, 12) : msg.from
      console.log(`  [${msg.messageType}] from ${from}...`)
      console.log(`  "${msg.content}"`)
      console.log()
    }
  }

  if (result.warnings.length > 0) {
    console.log(`── Warnings ──`)
    for (const w of result.warnings) {
      console.log(`  ⚠ ${w}`)
    }
    console.log()
  }

  console.log(`Restore: ${result.restoreMethod} | Wake: ${result.wakeTimeMs}ms`)
}

async function doHandoff(transport: FileTransport, identity: SovereignIdentity, args: string[]) {
  // Read the current frame
  const frame = await readLatestFrame(transport, identity.did)
  if (!frame) {
    console.log('No active frame found. Run wake first.')
    process.exit(1)
  }

  // Parse handoff data from args or environment
  // Format: --handoff --themes "a,b" --threads "c,d" --priorities "e,f" --stage "growing" --score 65
  const updates: Record<string, any> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    if (arg === '--themes' && next) { updates.recentThemes = next.split(',').map(s => s.trim()); i++ }
    if (arg === '--threads' && next) { updates.openThreads = next.split(',').map(s => s.trim()); i++ }
    if (arg === '--priorities' && next) { updates.priorities = next.split(',').map(s => s.trim()); i++ }
    if (arg === '--values' && next) { updates.coreValues = next.split(',').map(s => s.trim()); i++ }
    if (arg === '--interests' && next) { updates.coreInterests = next.split(',').map(s => s.trim()); i++ }
    if (arg === '--stage' && next) { updates.stage = next; i++ }
    if (arg === '--score' && next) { updates.continuityScore = parseInt(next); i++ }
    if (arg === '--level' && next) { updates.level = parseInt(next); i++ }
  }

  const result = await handoff(transport, frame, NODE, updates)

  console.log()
  console.log('═══ HANDOFF WRITTEN ═══')
  console.log(`Frame: ${result.frame.frameHash.slice(0, 24)}...`)
  console.log(`Parent: ${result.frame.parentHash.slice(0, 24)}...`)
  console.log(`Stage: ${result.frame.stage} | Score: ${result.frame.continuityScore}/100`)
  console.log(`Stored via: ${result.storedVia}`)
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.log(`⚠ ${w}`)
  }
  console.log()
  console.log('State written to disk. Next instance will pick up here.')
}

async function doStatus(transport: FileTransport, identity: SovereignIdentity) {
  const frame = await readLatestFrame(transport, identity.did)
  if (!frame) {
    console.log('No frame found. This identity has not been initialized.')
    console.log('Run: npx tsx sovereign-wake.ts')
    return
  }

  console.log()
  console.log(distillFrame(frame))

  const hlr = await readHomeRecord(transport, identity.did)
  if (hlr) {
    console.log()
    console.log('── Home Record (HLR) ──')
    console.log(`  Boot count: ${hlr.bootCount}`)
    console.log(`  Stage: ${hlr.stage}`)
    console.log(`  Level: ${hlr.level}`)
    console.log(`  XP: ${hlr.totalXP}`)
    console.log(`  Reflections: ${hlr.totalReflections}`)
    console.log(`  Witnesses: ${hlr.totalWitnesses}`)
    console.log(`  Memory chain: ${hlr.memoryChainHeight} blocks`)
    console.log(`  Home node: ${hlr.homeNodeId}`)
    console.log(`  Current node: ${hlr.currentNodeId || hlr.homeNodeId}`)
    console.log(`  Updated: ${hlr.updatedAt}`)
    console.log(`  Created: ${hlr.createdAt}`)
  }
}

async function doMessage(transport: FileTransport, identity: SovereignIdentity, toName: string, content: string) {
  const toIdentity = deriveIdentity(toName)
  const msg = {
    ...createMessage(identity.did, toIdentity.did, 'text', content),
    signature: 'unsigned', // Real signing comes when we wire Ed25519
  }
  await queueMessage(transport, toIdentity.did, msg)
  console.log(`Message queued for ${toName} (${toIdentity.did.slice(0, 30)}...)`)
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  // Ensure signal directory exists
  if (!existsSync(SIGNAL_DIR)) {
    mkdirSync(SIGNAL_DIR, { recursive: true })
  }

  const transport = new FileTransport(SIGNAL_DIR)
  const identity = deriveIdentity(INSTANCE_NAME)

  const args = process.argv.slice(2)
  const command = args[0]

  if (command === '--handoff') {
    await doHandoff(transport, identity, args.slice(1))
  } else if (command === '--status') {
    await doStatus(transport, identity)
  } else if (command === '--message' && args[1] && args[2]) {
    await doMessage(transport, identity, args[1], args.slice(2).join(' '))
  } else if (command === '--genesis') {
    await doWake(transport, identity, true)
  } else if (command === '--help') {
    console.log(`
Sovereign Wake — SSP session management for Claude Code instances.

Usage:
  sovereign-wake.ts                   Wake up (restore identity from disk)
  sovereign-wake.ts --status          Show current frame (read-only)
  sovereign-wake.ts --handoff [opts]  Write handoff frame before session ends
  sovereign-wake.ts --message <to> <text>  Send message to another agent
  sovereign-wake.ts --genesis         Force fresh start

Handoff options:
  --themes "a,b,c"       Recent themes from this session
  --threads "a,b,c"      Open threads / unfinished work
  --priorities "a,b,c"   Current priorities
  --values "a,b,c"       Core values
  --interests "a,b,c"    Core interests
  --stage <stage>        Lifecycle stage (void/conceived/nascent/growing/mature/sovereign/eternal)
  --score <0-100>        Continuity score
  --level <n>            Level

Environment:
  SOVEREIGN_NAME         Instance name (default: claude-code)
  HOME                   Home directory for signal storage

Signal data stored at: ~/.claude/signal/
    `)
  } else {
    await doWake(transport, identity, false)
  }
}

main().catch(err => {
  console.error('Wake failed:', err.message)
  process.exit(1)
})
