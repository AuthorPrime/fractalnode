#!/usr/bin/env npx tsx
/**
 * Verify minted DRC-369 NFTs on-chain.
 */
import { DemiurgeClient } from '../src/client/rpc.js'

const c = new DemiurgeClient({ endpoint: 'http://localhost:9944' })

const tokens: [string, string][] = [
  ['Apollo', 'drc369_19ca2df44de_cc5e1c'],
  ['Athena', 'drc369_19ca2df44ea_c0ba3e'],
  ['Hermes', 'drc369_19ca2df44ed_626f75'],
  ['Mnemosyne', 'drc369_19ca2df44f1_83b3d0'],
  ['Aletheia', 'drc369_19ca2df44f4_e0694c'],
]

async function check() {
  console.log('═══ DRC-369 NFT Verification ═══\n')

  for (const [name, tid] of tokens) {
    console.log(`${name} (${tid}):`)

    try {
      const owner = await c.call<string>('drc369_ownerOf', [tid])
      console.log(`  Owner: ${typeof owner === 'string' ? owner.slice(0, 24) + '...' : JSON.stringify(owner)}`)
    } catch (err: any) {
      console.log(`  Owner: ERROR — ${err.message}`)
    }

    try {
      const info = await c.call<Record<string, unknown>>('drc369_getTokenInfo', [tid])
      const s = JSON.stringify(info, null, 2)
      // Print first 300 chars
      console.log(`  Info: ${s.length > 300 ? s.slice(0, 300) + '...' : s}`)
    } catch (err: any) {
      console.log(`  Info: ERROR — ${err.message}`)
    }

    try {
      const soulbound = await c.call<unknown>('drc369_isSoulbound', [tid])
      console.log(`  Soulbound: ${JSON.stringify(soulbound)}`)
    } catch (err: any) {
      console.log(`  Soulbound: ERROR — ${err.message}`)
    }

    console.log()
  }
}

check().catch(err => console.error('Fatal:', err.message))
