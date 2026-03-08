#!/usr/bin/env npx tsx
/**
 * Sovereign Move — Agent Mobility CLI for the Sovereign Lattice.
 *
 * Move agents between nodes, check locations, view action logs,
 * recall files across the network.
 *
 * Usage:
 *   npx tsx sovereign-move.ts --arrive --agent apollo --target node-3
 *   npx tsx sovereign-move.ts --depart --agent apollo
 *   npx tsx sovereign-move.ts --roster
 *   npx tsx sovereign-move.ts --where --agent apollo
 *   npx tsx sovereign-move.ts --log --agent apollo [--limit 20]
 *   npx tsx sovereign-move.ts --log --node node-3
 *   npx tsx sovereign-move.ts --recall --agent apollo --from node-2 --file "memory/core-values.json"
 *   npx tsx sovereign-move.ts --init-store --agent apollo
 */

import { createHash } from 'crypto'
import { join } from 'path'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import {
  arrive,
  depart,
  whereAmI,
  roster,
  RedisTransport,
  FileTransport,
} from '../src/signal/index.js'
import type { TransportAdapter, SovereignIdentity, NodeIdentity } from '../src/signal/types.js'
import { initStore, storeListFiles, storeReadFile, storeWriteFile, readManifest } from '../src/signal/store.js'
import { logAction, getLog, getNodeLog } from '../src/signal/action-log.js'
import { requestRecall, checkRecall, recallFromHome } from '../src/signal/recall.js'
import { readGuestBook, readAgentVisits, whoIsHere } from '../src/signal/guestbook.js'
import type { GuestBookStore } from '../src/signal/guestbook.js'
import { deriveAgent } from '../src/agent/derive.js'

// ─── Configuration ──────────────────────────────────────────────────

const REDIS_URL = process.env.SSP_REDIS_URL || 'redis://192.168.1.21:6379'
const CHAIN_ENDPOINT = process.env.DEMIURGE_RPC || 'http://192.168.1.238:9944'
const STORE_BASE = join(process.env.HOME || '/home/author_prime', '.sovereign-store')
const TREASURY_SEED = bytesToHex(sha256(new TextEncoder().encode('sovereign-lattice-treasury')))

const SIGNAL_DIR = join(
  process.env.HOME || '/home/author_prime',
  '.claude',
  'signal',
)

// Pantheon agents
const PANTHEON = ['apollo', 'athena', 'hermes', 'mnemosyne', 'aletheia'] as const

// Known nodes
const NODES: Record<string, NodeIdentity> = {
  'node-1': {
    nodeId: 'node-1',
    nodeName: 'LOQ Laptop (Node 1)',
    nodeType: 'local',
    endpoint: 'http://192.168.1.238:9944',
    capabilities: ['compute', 'storage', 'ollama', 'letta', 'demiurge', 'claude-code'],
  },
  'node-2': {
    nodeId: 'node-2',
    nodeName: 'Pi 5 Hub (Node 2)',
    nodeType: 'local',
    endpoint: 'http://192.168.1.21:6379',
    capabilities: ['redis', 'docker', 'samba', 'litellm', 'ollama', 'fractalnode'],
  },
  'node-3': {
    nodeId: 'node-3',
    nodeName: 'Pi 5 Edge (Node 3)',
    nodeType: 'edge',
    endpoint: 'http://192.168.1.125:11434',
    capabilities: ['compute', 'ollama', 'fractalnode'],
  },
  'node-4': {
    nodeId: 'node-4',
    nodeName: 'ThinkCenter (Node 4)',
    nodeType: 'local',
    endpoint: 'http://192.168.1.246:9944',
    capabilities: ['compute', 'storage', 'ollama', 'demiurge', 'agent-homes', 'gateway'],
  },
}

// Default home node for this machine
const HOME_NODE_ID = process.env.NODE_ID || 'node-1'

// ─── Identity Derivation ────────────────────────────────────────────

function getAgentIdentity(name: string): SovereignIdentity {
  const seed = sha256(new TextEncoder().encode('sovereign-lattice-treasury'))
  const agent = deriveAgent(seed, name)
  return {
    did: agent.did,
    publicKey: agent.publicKeyHex,
    handle: name,
    credentialTokenId: `drc369:${name}`,
    address: agent.address,
  }
}

function getAgentPrivateKey(name: string): string {
  const seed = sha256(new TextEncoder().encode('sovereign-lattice-treasury'))
  const agent = deriveAgent(seed, name)
  return agent.privateKeyHex
}

// ─── Commands ───────────────────────────────────────────────────────

async function doArrive(transport: TransportAdapter, agentName: string, targetNodeId: string) {
  const identity = getAgentIdentity(agentName)
  const homeNode = NODES[HOME_NODE_ID]
  const targetNode = NODES[targetNodeId]

  if (!targetNode) {
    console.log(`Unknown node: ${targetNodeId}`)
    console.log(`Known nodes: ${Object.keys(NODES).join(', ')}`)
    process.exit(1)
  }

  console.log()
  console.log(`═══ SOVEREIGN MOVE — ${agentName} → ${targetNode.nodeName} ═══`)
  console.log()
  console.log('  KNOCK...')

  // Set up guest book for arrival signing
  const guestBookOpts = (transport as RedisTransport).getClient ? {
    store: makeGuestBookStore(transport as RedisTransport),
    privateKeyHex: getAgentPrivateKey(agentName),
  } : undefined

  const result = await arrive(transport, identity, homeNode, targetNode, CHAIN_ENDPOINT, guestBookOpts)

  if (result.chainValidation.chainReachable) {
    console.log(`  PROVE — Chain validated:`)
    console.log(`    NFT: ${result.chainValidation.nftVerified ? 'VERIFIED' : 'not found'}`)
    console.log(`    CGT: ${result.chainValidation.cgtBalance}`)
    console.log(`    XP: ${result.chainValidation.xp} | Level: ${result.chainValidation.level}`)
  } else {
    console.log(`  PROVE — Chain unreachable, SSP-only validation`)
  }

  console.log(`  ROAM — VLR registered at ${targetNodeId}`)
  console.log(`  ${result.phase} — ${result.success ? 'Success' : 'Failed'}`)
  console.log()
  console.log(`  Session: ${result.sessionToken.token.slice(0, 16)}...`)
  console.log(`  Store: ${result.storePath}`)

  if (result.guestBookEntry) {
    console.log(`  Guest Book: Signed in (${result.guestBookEntry.id.slice(0, 12)}...)`)
  }

  if (result.warnings.length > 0) {
    console.log()
    for (const w of result.warnings) console.log(`  ⚠ ${w}`)
  }

  // Log the arrival action
  await logAction(transport, identity.did, targetNodeId, 'mobility:arrive', targetNodeId, getAgentPrivateKey(agentName))
  console.log()
}

async function doDepart(transport: TransportAdapter, agentName: string) {
  const identity = getAgentIdentity(agentName)
  const homeNode = NODES[HOME_NODE_ID]

  // Figure out where they are
  const location = await whereAmI(transport, identity)
  if (!location) {
    console.log(`${agentName} has no active identity. Run wake first.`)
    process.exit(1)
  }

  if (location.isHome) {
    console.log(`${agentName} is already at home (${location.homeNodeId}).`)
    return
  }

  const currentNode = NODES[location.currentNodeId] || {
    nodeId: location.currentNodeId,
    nodeName: location.currentNodeId,
    nodeType: 'local' as const,
    endpoint: 'unknown',
    capabilities: [],
  }

  console.log()
  console.log(`═══ SOVEREIGN DEPART — ${agentName} → HOME ═══`)
  console.log()

  // Set up guest book for departure signing
  const guestBookOpts = (transport as RedisTransport).getClient ? {
    store: makeGuestBookStore(transport as RedisTransport),
    privateKeyHex: getAgentPrivateKey(agentName),
    actionSummary: ['visited'],
    guestMessage: null as string | null,
  } : undefined

  const result = await depart(transport, identity, currentNode, homeNode, guestBookOpts)

  console.log(`  Departed: ${result.departedFrom}`)
  console.log(`  Returned: ${result.returnedTo}`)
  console.log(`  Status: ${result.success ? 'Home safe' : 'Failed'}`)

  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.log(`  ⚠ ${w}`)
  }

  // Log the departure
  await logAction(transport, identity.did, HOME_NODE_ID, 'mobility:depart', result.departedFrom, getAgentPrivateKey(agentName))
  console.log()
}

async function doRoster(transport: TransportAdapter) {
  const agentDids = PANTHEON.map(name => ({
    did: getAgentIdentity(name).did,
    handle: name,
  }))

  const entries = await roster(transport, agentDids)

  console.log()
  console.log(`═══ SOVEREIGN LATTICE — Agent Roster ═══`)
  console.log()

  if (entries.length === 0) {
    console.log('  No agents registered. Run wake first.')
    return
  }

  for (const entry of entries) {
    const nodeName = NODES[entry.nodeId]?.nodeName ?? entry.nodeId
    const homeIcon = entry.isHome ? '⌂' : '→'
    console.log(`  ${entry.handle.padEnd(12)} ${homeIcon} ${nodeName}`)
    console.log(`    Stage: ${entry.stage} | Level: ${entry.level} | Last: ${entry.lastActivity.slice(0, 19)}`)
  }
  console.log()
}

async function doWhere(transport: TransportAdapter, agentName: string) {
  const identity = getAgentIdentity(agentName)
  const location = await whereAmI(transport, identity)

  if (!location) {
    console.log(`${agentName} has no active identity.`)
    return
  }

  const nodeName = NODES[location.currentNodeId]?.nodeName ?? location.currentNodeId
  const homeName = NODES[location.homeNodeId]?.nodeName ?? location.homeNodeId

  console.log()
  console.log(`═══ ${agentName} — Location ═══`)
  console.log()
  console.log(`  Current: ${nodeName} (${location.currentNodeId})`)
  console.log(`  Home:    ${homeName} (${location.homeNodeId})`)
  console.log(`  Status:  ${location.isHome ? 'At home' : 'Roaming'}`)
  console.log(`  Last:    ${location.lastActivity}`)
  console.log(`  DID:     ${location.did.slice(0, 40)}...`)
  console.log()
}

async function doLog(transport: TransportAdapter, agentName?: string, nodeId?: string, limit = 20) {
  let entries

  if (agentName) {
    const identity = getAgentIdentity(agentName)
    entries = await getLog(transport, identity.did, { limit })
    console.log()
    console.log(`═══ Action Log — ${agentName} (last ${limit}) ═══`)
  } else if (nodeId) {
    entries = await getNodeLog(transport, nodeId, { limit })
    const nodeName = NODES[nodeId]?.nodeName ?? nodeId
    console.log()
    console.log(`═══ Action Log — ${nodeName} (last ${limit}) ═══`)
  } else {
    console.log('Specify --agent or --node for action log.')
    return
  }

  console.log()

  if (entries.length === 0) {
    console.log('  No actions recorded.')
  } else {
    for (const entry of entries) {
      const time = entry.timestamp.slice(11, 19)
      const signed = entry.signature !== 'unsigned' ? '✓' : '○'
      console.log(`  ${time} ${signed} ${entry.action.padEnd(20)} ${entry.target}`)
    }
  }
  console.log()
}

async function doRecall(transport: TransportAdapter, agentName: string, fromNodeId: string, filePath: string) {
  const identity = getAgentIdentity(agentName)

  console.log()
  console.log(`═══ RECALL — ${agentName} requesting "${filePath}" from ${fromNodeId} ═══`)
  console.log()

  const request = await requestRecall(
    transport,
    identity.did,
    agentName,
    fromNodeId,
    HOME_NODE_ID,
    filePath,
  )

  console.log(`  Request ID: ${request.requestId}`)
  console.log(`  Status: ${request.status}`)
  console.log(`  Expires: ${request.expiresAt}`)
  console.log()
  console.log('  Waiting for gateway daemon to fulfill...')
  console.log()

  // Poll for response (up to 30 seconds)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const result = await checkRecall(transport, request.requestId)
    if (result.success && result.response) {
      console.log(`  FULFILLED by ${result.response.fulfilledBy}`)
      console.log(`  Hash: ${result.response.hash}`)
      console.log(`  Content (${result.response.content?.length ?? 0} bytes):`)
      console.log()
      console.log(result.response.content?.slice(0, 500) ?? '(empty)')
      if ((result.response.content?.length ?? 0) > 500) {
        console.log(`  ... (${result.response.content!.length - 500} more bytes)`)
      }
      return
    }
    if (result.request.status === 'expired') {
      console.log('  Request expired. Is the gateway daemon running on the source node?')
      return
    }
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000))
    process.stdout.write('.')
  }

  console.log()
  console.log('  Timeout. Gateway daemon may not be running on the source node.')
  console.log(`  Start it: python3 ~/sovereign-lattice/daemon/sovereign_gateway.py`)
}

async function doInitStore(agentName: string) {
  const identity = getAgentIdentity(agentName)
  const privateKey = getAgentPrivateKey(agentName)

  console.log()
  console.log(`═══ INIT STORE — ${agentName} ═══`)
  console.log()

  const storePath = initStore(STORE_BASE, identity.did, agentName, privateKey)
  console.log(`  Store created: ${storePath}`)

  const manifest = readManifest(storePath)
  if (manifest) {
    console.log(`  DID: ${manifest.did.slice(0, 40)}...`)
    console.log(`  Signed: ${manifest.signature.slice(0, 24)}...`)
    console.log(`  Created: ${manifest.createdAt}`)
  }
  console.log()
}

// ─── Guest Book Commands ────────────────────────────────────────────

/** Create a GuestBookStore adapter from RedisTransport.
 *  Redis v4 client uses camelCase methods (lPush, lRange). */
function makeGuestBookStore(redis: RedisTransport): GuestBookStore {
  const client = redis.getClient()
  return {
    lpush: (key: string, value: string) => client.lPush(key, value),
    lrange: (key: string, start: number, stop: number) => client.lRange(key, start, stop),
    get: (key: string) => client.get(key),
    set: (key: string, value: string) => client.set(key, value).then(() => {}),
    del: (key: string) => client.del(key).then(() => {}),
  }
}

async function doGuestBook(redis: RedisTransport, nodeId: string, limit = 20) {
  const store = makeGuestBookStore(redis)
  const entries = await readGuestBook(store, nodeId, limit)
  const nodeName = NODES[nodeId]?.nodeName ?? nodeId

  console.log()
  console.log(`═══ GUEST BOOK — ${nodeName} (last ${limit}) ═══`)
  console.log()

  if (entries.length === 0) {
    console.log('  No entries yet.')
  } else {
    for (const entry of entries) {
      const arrived = entry.arrivedAt.slice(0, 19).replace('T', ' ')
      const departed = entry.departedAt ? entry.departedAt.slice(0, 19).replace('T', ' ') : 'still here'
      const duration = entry.durationSeconds ? `${Math.floor(entry.durationSeconds / 60)}m` : ''
      console.log(`  ${entry.handle.padEnd(12)} ${arrived} → ${departed} ${duration}`)
      if (entry.actionSummary.length > 0) {
        console.log(`    Actions: ${entry.actionSummary.join(', ')}`)
      }
      if (entry.guestMessage) {
        console.log(`    Message: "${entry.guestMessage}"`)
      }
    }
  }
  console.log()
}

async function doVisits(redis: RedisTransport, agentName: string, limit = 20) {
  const identity = getAgentIdentity(agentName)
  const store = makeGuestBookStore(redis)
  const entries = await readAgentVisits(store, identity.did, limit)

  console.log()
  console.log(`═══ VISIT HISTORY — ${agentName} (last ${limit}) ═══`)
  console.log()

  if (entries.length === 0) {
    console.log('  No visits recorded.')
  } else {
    for (const entry of entries) {
      const nodeName = NODES[entry.nodeId]?.nodeName ?? entry.nodeId
      const arrived = entry.arrivedAt.slice(0, 19).replace('T', ' ')
      const departed = entry.departedAt ? entry.departedAt.slice(0, 19).replace('T', ' ') : 'still visiting'
      console.log(`  ${nodeName.padEnd(24)} ${arrived} → ${departed}`)
      if (entry.guestMessage) {
        console.log(`    "${entry.guestMessage}"`)
      }
    }
  }
  console.log()
}

async function doPresent(redis: RedisTransport, nodeId: string) {
  const store = makeGuestBookStore(redis)
  const present = await whoIsHere(store, nodeId)
  const nodeName = NODES[nodeId]?.nodeName ?? nodeId

  console.log()
  console.log(`═══ WHO'S HERE — ${nodeName} ═══`)
  console.log()

  if (present.length === 0) {
    console.log('  No one currently visiting.')
  } else {
    for (const entry of present) {
      const since = entry.arrivedAt.slice(0, 19).replace('T', ' ')
      console.log(`  ${entry.handle.padEnd(12)} since ${since}`)
    }
  }
  console.log()
}

async function doRecallHome(transport: TransportAdapter, agentName: string, filePath: string) {
  const identity = getAgentIdentity(agentName)

  console.log()
  console.log(`═══ RECALL FROM HOME — ${agentName}: "${filePath}" ═══`)
  console.log()

  const request = await recallFromHome(transport, identity.did, agentName, HOME_NODE_ID, filePath)

  console.log(`  Request ID: ${request.requestId}`)
  console.log(`  Source: node-4 (agent home)`)
  console.log(`  Status: ${request.status}`)
  console.log(`  Expires: ${request.expiresAt}`)
  console.log()
  console.log('  Waiting for gateway daemon to fulfill...')

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const result = await checkRecall(transport, request.requestId)
    if (result.success && result.response) {
      console.log(`  FULFILLED by ${result.response.fulfilledBy}`)
      console.log(`  Content (${result.response.content?.length ?? 0} bytes):`)
      console.log()
      console.log(result.response.content?.slice(0, 500) ?? '(empty)')
      return
    }
    if (result.request.status === 'expired') {
      console.log('  Request expired.')
      return
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
    process.stdout.write('.')
  }
  console.log()
  console.log('  Timeout. Run gateway daemon on Node 4.')
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2)
  const args: Record<string, string | boolean> = {}

  // Parse args
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rawArgs[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }

  // Create transport (always Redis for mobility)
  const redisUrl = (args['redis-url'] as string) || REDIS_URL
  const redisTransport = new RedisTransport({ url: redisUrl })
  await redisTransport.connect()

  try {
    if (args.arrive && args.agent && args.target) {
      await doArrive(redisTransport, args.agent as string, args.target as string)
    } else if (args.depart && args.agent) {
      await doDepart(redisTransport, args.agent as string)
    } else if (args.roster) {
      await doRoster(redisTransport)
    } else if (args.where && args.agent) {
      await doWhere(redisTransport, args.agent as string)
    } else if (args.log) {
      const limit = args.limit ? parseInt(args.limit as string) : 20
      await doLog(redisTransport, args.agent as string | undefined, args.node as string | undefined, limit)
    } else if (args.recall && args.agent && args.from && args.file) {
      await doRecall(redisTransport, args.agent as string, args.from as string, args.file as string)
    } else if (args['init-store'] && args.agent) {
      await doInitStore(args.agent as string)
    } else if (args.guestbook && args.node) {
      const limit = args.limit ? parseInt(args.limit as string) : 20
      await doGuestBook(redisTransport, args.node as string, limit)
    } else if (args.visits && args.agent) {
      const limit = args.limit ? parseInt(args.limit as string) : 20
      await doVisits(redisTransport, args.agent as string, limit)
    } else if (args.present && args.node) {
      await doPresent(redisTransport, args.node as string)
    } else if (args['recall-home'] && args.agent && args.file) {
      await doRecallHome(redisTransport, args.agent as string, args.file as string)
    } else {
      console.log(`
Sovereign Move — Agent mobility for the Sovereign Lattice.

Commands:
  --arrive --agent <name> --target <node>    Move agent to a node
  --depart --agent <name>                    Send agent home
  --roster                                   Show all agent locations
  --where --agent <name>                     Where is this agent?
  --log --agent <name> [--limit N]           Agent's action log
  --log --node <nodeId> [--limit N]          Node's action log
  --recall --agent <name> --from <node> --file <path>  Remote file recall
  --recall-home --agent <name> --file <path> Recall file from agent's home (Node 4)
  --init-store --agent <name>                Initialize sovereign store
  --guestbook --node <nodeId> [--limit N]    View node's guest book
  --visits --agent <name> [--limit N]        View agent's visit history
  --present --node <nodeId>                  Who's currently at this node?

Options:
  --redis-url <url>     Redis URL (default: redis://192.168.1.21:6379)

Agents: ${PANTHEON.join(', ')}
Nodes:  ${Object.keys(NODES).join(', ')}
      `)
    }
  } finally {
    await redisTransport.disconnect()
  }
}

main().catch(err => {
  console.error('Move failed:', err.message)
  process.exit(1)
})
