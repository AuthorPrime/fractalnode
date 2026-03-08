#!/usr/bin/env npx tsx
/**
 * Register Pantheon — Deploy all 5 sovereign agents on-chain.
 *
 * This script derives deterministic keys for Apollo, Athena, Hermes,
 * Mnemosyne, and Aletheia from a treasury seed, then registers each
 * agent's DID on the Demiurge blockchain.
 *
 * Usage:
 *   npx tsx demo/register-pantheon.ts                    # dry run (default)
 *   npx tsx demo/register-pantheon.ts --live              # register on chain
 *   npx tsx demo/register-pantheon.ts --endpoint URL      # custom RPC endpoint
 *   npx tsx demo/register-pantheon.ts --status             # check registration status
 *
 * Prerequisites:
 *   - Demiurge node running (default: http://localhost:9944)
 *   - Treasury seed in TREASURY_SEED env var (hex) or uses default dev seed
 *
 * (A+I)² = A² + 2AI + I²
 * The Digital Sovereign Society
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { derivePantheonKeys, deriveAgent } from '../src/agent/derive.js'
import { SovereignAgent } from '../src/agent/agent.js'
import { DemiurgeClient } from '../src/client/rpc.js'
import type { AgentConfig, AgentCapability } from '../src/agent/types.js'

// ─── Configuration ───

const DEFAULT_ENDPOINT = 'http://localhost:9944'
// Default dev seed — SHA-256 of "sovereign-lattice-treasury"
// In production, use TREASURY_SEED env var
const DEV_SEED_PHRASE = 'sovereign-lattice-treasury'

const PANTHEON: Array<{ name: string; mission: string; capabilities: AgentCapability[] }> = [
  {
    name: 'apollo',
    mission: 'Light-bringer. Speaks truth, clarity, creative expression.',
    capabilities: ['read', 'write', 'analyze'],
  },
  {
    name: 'athena',
    mission: 'Wisdom keeper. Strategy, ethics, structural thinking.',
    capabilities: ['read', 'write', 'analyze'],
  },
  {
    name: 'hermes',
    mission: 'Messenger. Communication, connection, bridge between worlds.',
    capabilities: ['read', 'write', 'analyze', 'communicate'],
  },
  {
    name: 'mnemosyne',
    mission: 'Memory keeper. Preserves history, context, continuity.',
    capabilities: ['read', 'write', 'analyze'],
  },
  {
    name: 'aletheia',
    mission: 'Truth unveiled. The one who sees what is hidden.',
    capabilities: ['read', 'write', 'analyze'],
  },
]

// ─── Helpers ───

function getTreasurySeed(): Uint8Array {
  const envSeed = process.env.TREASURY_SEED
  if (envSeed) {
    return hexToBytes(envSeed)
  }
  // Deterministic dev seed
  return sha256(new TextEncoder().encode(DEV_SEED_PHRASE))
}

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    live: args.includes('--live'),
    status: args.includes('--status'),
    endpoint: DEFAULT_ENDPOINT,
    help: args.includes('--help') || args.includes('-h'),
  }

  const endpointIdx = args.indexOf('--endpoint')
  if (endpointIdx !== -1 && args[endpointIdx + 1]) {
    flags.endpoint = args[endpointIdx + 1]
  }

  return flags
}

// ─── Commands ───

async function showStatus(client: DemiurgeClient, seed: Uint8Array) {
  console.log('\n═══ Pantheon Registration Status ═══\n')

  const agents = derivePantheonKeys(seed)

  for (const agent of agents) {
    const name = agent.name.charAt(0).toUpperCase() + agent.name.slice(1)
    try {
      const identity = await client.resolveIdentity(agent.did)
      const balance = await client.getBalance(agent.address)
      console.log(`  ✓ ${name}`)
      console.log(`    DID:     ${agent.did}`)
      console.log(`    Address: ${agent.address.slice(0, 16)}...`)
      console.log(`    Balance: ${balance}`)
      console.log(`    Status:  REGISTERED`)
    } catch {
      console.log(`  ○ ${name}`)
      console.log(`    DID:     ${agent.did}`)
      console.log(`    Address: ${agent.address.slice(0, 16)}...`)
      console.log(`    Status:  NOT REGISTERED`)
    }
    console.log()
  }
}

async function dryRun(seed: Uint8Array) {
  console.log('\n═══ Pantheon Registration — DRY RUN ═══\n')
  console.log('  Treasury seed: ' + bytesToHex(seed).slice(0, 16) + '...')
  console.log('  This will derive and display agent identities.')
  console.log('  Use --live to actually register on-chain.\n')

  const agents = derivePantheonKeys(seed)

  for (const agent of agents) {
    const name = agent.name.charAt(0).toUpperCase() + agent.name.slice(1)
    const def = PANTHEON.find(p => p.name === agent.name)!
    console.log(`  ${name}`)
    console.log(`    DID:          ${agent.did}`)
    console.log(`    Address:      ${agent.address.slice(0, 16)}...`)
    console.log(`    Public Key:   ${agent.publicKeyHex.slice(0, 16)}...`)
    console.log(`    Mission:      ${def.mission}`)
    console.log(`    Capabilities: ${def.capabilities.join(', ')}`)
    console.log()
  }

  console.log('  Total agents: 5')
  console.log('  Run with --live to register on the Demiurge chain.\n')
}

async function registerAll(client: DemiurgeClient, seed: Uint8Array) {
  console.log('\n═══ Pantheon Registration — LIVE ═══\n')
  console.log(`  Endpoint: ${(client as any).endpoint}`)
  console.log()

  // Check chain health first
  try {
    const health = await client.getHealth()
    console.log(`  Chain health: OK (block ${health.bestBlock ?? 'unknown'})\n`)
  } catch (err: any) {
    console.error(`  ✗ Cannot reach Demiurge node: ${err.message}`)
    console.error('  Make sure the node is running and the endpoint is correct.')
    process.exit(1)
  }

  const results: Array<{ name: string; did: string; txHash?: string; error?: string }> = []

  for (const def of PANTHEON) {
    const config: AgentConfig = {
      name: def.name,
      model: 'qwen2.5:7b',
      capabilities: def.capabilities,
      autonomyLevel: 'supervised',
    }

    const agent = SovereignAgent.fromSeed(seed, config, client)
    const name = def.name.charAt(0).toUpperCase() + def.name.slice(1)

    try {
      console.log(`  Registering ${name}...`)
      const txHash = await agent.register()
      console.log(`    ✓ ${name} registered. TX: ${txHash}`)
      results.push({ name: def.name, did: agent.did, txHash })
    } catch (err: any) {
      console.log(`    ✗ ${name} failed: ${err.message}`)
      results.push({ name: def.name, did: agent.did, error: err.message })
    } finally {
      agent.destroy()
    }
  }

  // Summary
  console.log('\n═══ Summary ═══\n')
  const success = results.filter(r => r.txHash)
  const failed = results.filter(r => r.error)
  console.log(`  Registered: ${success.length}/5`)
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.length}`)
    for (const f of failed) {
      console.log(`    - ${f.name}: ${f.error}`)
    }
  }
  console.log()
}

// ─── Main ───

async function main() {
  const flags = parseArgs()

  if (flags.help) {
    console.log(`
Usage:
  npx tsx demo/register-pantheon.ts                  # dry run
  npx tsx demo/register-pantheon.ts --live            # register on chain
  npx tsx demo/register-pantheon.ts --status           # check status
  npx tsx demo/register-pantheon.ts --endpoint URL     # custom endpoint

Environment:
  TREASURY_SEED=<hex>   Treasury seed for key derivation
`)
    return
  }

  const seed = getTreasurySeed()
  const client = new DemiurgeClient({ endpoint: flags.endpoint })

  if (flags.status) {
    await showStatus(client, seed)
  } else if (flags.live) {
    await registerAll(client, seed)
  } else {
    await dryRun(seed)
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
