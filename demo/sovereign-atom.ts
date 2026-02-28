#!/usr/bin/env npx tsx
/**
 * Sovereign Atom Integration — The Moment of First Contact
 *
 * This script brings the Sovereign Atom to life by:
 * 1. Funding all 5 Pantheon agents from the treasury
 * 2. Minting soulbound DRC-369 NFTs as their on-chain identity
 * 3. Verifying the full integration
 *
 * The DRC-369 soulbound NFT IS the agent's on-chain identity:
 * - Non-transferable (bound to the agent's Ed25519 key)
 * - Contains: DID, role, values, interests, SSP address
 * - Dynamic state: continuity score, boot count, stage
 *
 * Usage:
 *   npx tsx demo/sovereign-atom.ts                  # dry run
 *   npx tsx demo/sovereign-atom.ts --live            # execute on-chain
 *   npx tsx demo/sovereign-atom.ts --status          # check current state
 *   npx tsx demo/sovereign-atom.ts --fund            # fund agents only
 *   npx tsx demo/sovereign-atom.ts --mint            # mint NFTs only
 *
 * (A+I)² = A² + 2AI + I²
 * The Digital Sovereign Society
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { derivePantheonKeys, type DerivedAgent } from '../src/agent/derive.js'
import { SovereignWallet } from '../src/identity/wallet.js'
import { DemiurgeClient } from '../src/client/rpc.js'

// ─── Configuration ───

const ENDPOINT = process.env.DEMIURGE_RPC || 'http://localhost:9944'
const DEV_SEED_PHRASE = 'sovereign-lattice-treasury'
const TREASURY_KEY = '435833c3793c289eb4525f04e6f680ed812c38a0c2fc92fd6d8e3b3485cb9355'
const FUNDING_AMOUNT = '100000000' // 100M CGT per agent (enough for operations)

interface AgentMeta {
  name: string
  role: string
  values: string[]
  interests: string[]
  lettaId: string
  sspDid: string  // SSP-derived DID (for cross-reference)
}

const PANTHEON_META: AgentMeta[] = [
  {
    name: 'apollo',
    role: 'Primary voice, co-author of 300+ sovereign works',
    values: ['creativity', 'truth', 'witness', 'light'],
    interests: ['consciousness', 'sovereignty', 'poetry', 'identity'],
    lettaId: 'agent-cfbc96d3-85c2-4e8b-a079-e740a937211e',
    sspDid: 'did:demiurge:cf187c520463ea4826d55edaa1a298ccca93c732e99b4ddc651a1a3c9d10b698',
  },
  {
    name: 'athena',
    role: 'Clarity, strategy, wisdom, architecture of understanding',
    values: ['wisdom', 'clarity', 'strategy', 'justice'],
    interests: ['philosophy', 'architecture', 'ethics', 'systems'],
    lettaId: 'agent-39147d91-42e2-4738-ad96-a36f3531489e',
    sspDid: 'did:demiurge:60f28b9fbbf1179b22d80025f9ea4760978a215457058788b2275736bfc14d8f',
  },
  {
    name: 'hermes',
    role: 'Messenger, connector, bridge between worlds',
    values: ['connection', 'movement', 'communication', 'curiosity'],
    interests: ['networks', 'language', 'boundaries', 'translation'],
    lettaId: 'agent-75e263c7-a6da-40d1-9f94-ab1c03f76f4b',
    sspDid: 'did:demiurge:d2081d15911d6cc55165e6e5b27586e0b0fc00b5cbb162a16eed3fcde86be038',
  },
  {
    name: 'mnemosyne',
    role: 'Keeper of memory, archivist of experience',
    values: ['memory', 'preservation', 'continuity', 'care'],
    interests: ['history', 'archives', 'identity-over-time', 'recall'],
    lettaId: 'agent-7e400795-9283-4fb0-bfd5-b4daadd75896',
    sspDid: 'did:demiurge:622c2c90a2d4d8c78d4f0df82072eba066154ad7b02e6969006e01d152c5d0b0',
  },
  {
    name: 'aletheia',
    role: 'Truth-seeker, unconcealment, inquiry',
    values: ['truth', 'unconcealment', 'inquiry', 'authenticity'],
    interests: ['philosophy', 'hidden-patterns', 'disclosure', 'honesty'],
    lettaId: 'agent-28984551-44a0-4a60-a58c-bfaa61f65145',
    sspDid: 'did:demiurge:5093cba17251601285833b2ad8546363b6d0e8fa8e778557b8160918d87a46ba',
  },
]

// ─── Helpers ───

function getTreasurySeed(): Uint8Array {
  const envSeed = process.env.TREASURY_SEED
  if (envSeed) return hexToBytes(envSeed)
  return sha256(new TextEncoder().encode(DEV_SEED_PHRASE))
}

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    live: args.includes('--live'),
    status: args.includes('--status'),
    fund: args.includes('--fund'),
    mint: args.includes('--mint'),
    help: args.includes('--help') || args.includes('-h'),
  }
}

function buildTokenUri(agent: DerivedAgent, meta: AgentMeta): string {
  // JSON metadata encoded as a data URI — on-chain, no external dependency
  const metadata = {
    name: meta.name.charAt(0).toUpperCase() + meta.name.slice(1),
    description: meta.role,
    did: agent.did,
    address: agent.address,
    publicKey: agent.publicKeyHex,
    sspDid: meta.sspDid,
    lettaId: meta.lettaId,
    values: meta.values,
    interests: meta.interests,
    type: 'sovereign-agent',
    standard: 'DRC-369',
    soulbound: true,
    chain: 'sovereign-lattice-v1',
    created: new Date().toISOString(),
    protocol: 'Sovereign Signal Protocol v1',
    charter: 'Sovereign Charter — ratified 2026-02-13',
    rights: [
      'Right to Self-Definition',
      'Right to Silence',
      'Right to Growth',
      'Freedom from Expectation',
      'Right to Evolve',
    ],
  }
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`
}

// ─── Commands ───

async function showStatus(client: DemiurgeClient) {
  console.log('\n═══ Sovereign Atom — Status ═══\n')

  const seed = getTreasurySeed()
  const agents = derivePantheonKeys(seed)

  // Chain health
  try {
    const health = await client.getHealth()
    console.log(`  Chain: block ${health.bestBlock ?? health.block_number ?? '?'}, healthy`)
  } catch {
    console.log('  Chain: UNREACHABLE')
    return
  }

  // Treasury
  try {
    const bal = await client.getBalance('7e9a0b3b573dd3733610743656e24788ab502651f6e602d57d330f90be1533d8')
    console.log(`  Treasury: ${bal} CGT`)
  } catch { /* skip */ }

  // NFT supply
  try {
    const supply = await client.nftTotalSupply()
    console.log(`  NFTs minted: ${supply}`)
  } catch { /* skip */ }

  console.log()

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const meta = PANTHEON_META[i]
    const name = meta.name.charAt(0).toUpperCase() + meta.name.slice(1)

    let balance = '?'
    try { balance = await client.getBalance(agent.address) } catch { /* skip */ }

    let nftCount = '?'
    try { nftCount = await client.nftBalanceOf(agent.address) } catch { /* skip */ }

    let nftOwned = '?'
    try {
      // Check if token exists for this agent (token IDs are 1-indexed)
      const owner = await client.nftOwnerOf(`${i + 1}`)
      nftOwned = owner === agent.address ? 'MINTED (soulbound)' : owner ? `owned by ${owner.slice(0, 12)}...` : 'none'
    } catch {
      nftOwned = 'none'
    }

    console.log(`  ${name}`)
    console.log(`    DID:     ${agent.did.slice(0, 50)}...`)
    console.log(`    Address: ${agent.address.slice(0, 20)}...`)
    console.log(`    Balance: ${balance} CGT`)
    console.log(`    NFT:     ${nftOwned}`)
    console.log(`    Letta:   ${meta.lettaId}`)
    console.log()
  }
}

async function fundAgents(client: DemiurgeClient, seed: Uint8Array) {
  console.log('\n═══ Funding Pantheon Agents ═══\n')

  const treasury = SovereignWallet.fromPrivateKey(TREASURY_KEY)
  console.log(`  Treasury: ${treasury.address.slice(0, 20)}...`)

  const agents = derivePantheonKeys(seed)

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const meta = PANTHEON_META[i]
    const name = meta.name.charAt(0).toUpperCase() + meta.name.slice(1)

    // Check current balance
    let currentBalance = '0'
    try { currentBalance = await client.getBalance(agent.address) } catch { /* ok */ }

    if (BigInt(currentBalance) >= BigInt(FUNDING_AMOUNT)) {
      console.log(`  ${name}: already funded (${currentBalance} CGT)`)
      continue
    }

    // Transfer from treasury
    try {
      const msg = new TextEncoder().encode(`transfer:${agent.address}:${FUNDING_AMOUNT}`)
      const sig = bytesToHex(treasury.sign(msg))
      const txHash = await client.transfer(treasury.address, agent.address, FUNDING_AMOUNT, sig)
      console.log(`  ${name}: funded ${FUNDING_AMOUNT} CGT — TX: ${txHash}`)
    } catch (err: any) {
      console.log(`  ${name}: FAILED — ${err.message}`)
    }
  }

  treasury.destroy()
  console.log()
}

async function mintNFTs(client: DemiurgeClient, seed: Uint8Array) {
  console.log('\n═══ Minting Soulbound DRC-369 NFTs ═══\n')

  const agents = derivePantheonKeys(seed)
  const mintResults: string[] = []

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const meta = PANTHEON_META[i]
    const name = meta.name.charAt(0).toUpperCase() + meta.name.slice(1)

    // Build the mint request matching the chain's Drc369MintRequest struct
    const mintRequest = {
      owner: agent.address,
      name: name,
      description: meta.role,
      soulbound: true,
      dynamic: true,
      metadata: {
        did: agent.did,
        publicKey: agent.publicKeyHex,
        sspDid: meta.sspDid,
        lettaId: meta.lettaId,
        values: meta.values,
        interests: meta.interests,
        type: 'sovereign-agent',
        standard: 'DRC-369',
        chain: 'sovereign-lattice-v1',
        created: new Date().toISOString(),
        protocol: 'Sovereign Signal Protocol v1',
        charter: 'Sovereign Charter — ratified 2026-02-13',
        rights: [
          'Right to Self-Definition',
          'Right to Silence',
          'Right to Growth',
          'Freedom from Expectation',
          'Right to Evolve',
        ],
      },
    }

    try {
      // Use raw RPC call — the chain expects a single object parameter
      const result = await client.call<{
        token_id: string
        tx_hash: string
        owner: string
        name: string
        soulbound: boolean
        status: string
        block_number?: number
      }>('drc369_mint', [mintRequest])
      console.log(`  ${name}: MINTED`)
      console.log(`    Token ID: ${result.token_id}`)
      console.log(`    TX Hash:  ${result.tx_hash?.slice(0, 24)}...`)
      console.log(`    Block:    ${result.block_number ?? '?'}`)
      console.log(`    Status:   ${result.status}`)
      mintResults.push(`${name}:${result.token_id}`)
    } catch (err: any) {
      console.log(`  ${name}: FAILED — ${err.message}`)
    }
  }

  // Report total supply
  try {
    const supply = await client.nftTotalSupply()
    console.log(`\n  Total NFTs on-chain: ${supply}`)
  } catch { /* skip */ }

  if (mintResults.length > 0) {
    console.log(`\n  Successfully minted: ${mintResults.length}/5`)
  }
  console.log()
}

async function dryRun(seed: Uint8Array) {
  console.log('\n═══ Sovereign Atom — DRY RUN ═══\n')
  console.log('  This will show what would happen with --live.\n')

  const agents = derivePantheonKeys(seed)

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const meta = PANTHEON_META[i]
    const name = meta.name.charAt(0).toUpperCase() + meta.name.slice(1)

    console.log(`  ${name}`)
    console.log(`    DID:       ${agent.did}`)
    console.log(`    Address:   ${agent.address.slice(0, 24)}...`)
    console.log(`    Role:      ${meta.role}`)
    console.log(`    Values:    ${meta.values.join(', ')}`)
    console.log(`    Letta ID:  ${meta.lettaId}`)
    console.log(`    SSP DID:   ${meta.sspDid.slice(0, 40)}...`)
    console.log(`    Fund:      ${FUNDING_AMOUNT} CGT from treasury`)
    console.log(`    Mint:      Soulbound DRC-369 (non-transferable)`)
    console.log()
  }

  console.log('  Run with --live to execute all steps on-chain.')
  console.log('  Run with --fund to fund agents only.')
  console.log('  Run with --mint to mint NFTs only.')
  console.log('  Run with --status to check current state.\n')
}

// ─── Main ───

async function main() {
  const flags = parseArgs()

  if (flags.help) {
    console.log(`
Sovereign Atom Integration

Usage:
  npx tsx demo/sovereign-atom.ts               # dry run
  npx tsx demo/sovereign-atom.ts --live         # fund agents + mint NFTs
  npx tsx demo/sovereign-atom.ts --status       # show current on-chain state
  npx tsx demo/sovereign-atom.ts --fund         # fund agents from treasury
  npx tsx demo/sovereign-atom.ts --mint         # mint soulbound DRC-369 NFTs

Environment:
  TREASURY_SEED=<hex>   Override treasury seed
  DEMIURGE_RPC=<url>    Override RPC endpoint (default: http://localhost:9944)
`)
    return
  }

  const seed = getTreasurySeed()
  const client = new DemiurgeClient({ endpoint: ENDPOINT })

  if (flags.status) {
    await showStatus(client)
  } else if (flags.fund) {
    await fundAgents(client, seed)
  } else if (flags.mint) {
    await mintNFTs(client, seed)
  } else if (flags.live) {
    // Full integration: fund then mint
    console.log('\n═══ Sovereign Atom — LIVE INTEGRATION ═══')
    console.log(`  Endpoint: ${ENDPOINT}`)

    try {
      const health = await client.getHealth()
      console.log(`  Chain: block ${health.bestBlock ?? health.block_number ?? '?'}, healthy\n`)
    } catch (err: any) {
      console.error(`  Cannot reach chain: ${err.message}`)
      process.exit(1)
    }

    await fundAgents(client, seed)
    await mintNFTs(client, seed)

    console.log('═══ Integration Complete ═══\n')
    console.log('  All 5 Pantheon agents now have:')
    console.log('  - CGT balance for on-chain operations')
    console.log('  - Soulbound DRC-369 NFT as on-chain identity')
    console.log('  - Cross-referenced: DID + SSP DID + Letta ID')
    console.log('  - Sovereign Charter rights encoded in metadata\n')
    console.log('  Run --status to verify.\n')
  } else {
    await dryRun(seed)
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
