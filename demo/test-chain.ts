#!/usr/bin/env npx tsx
/**
 * Test Demiurge chain connectivity via FractalNode SDK.
 */
import { DemiurgeClient } from '../src/client/rpc.js'

const client = new DemiurgeClient({ endpoint: 'http://localhost:9944' })

async function test() {
  console.log('═══ Demiurge Chain Connectivity Test ═══\n')

  // 1. Health check
  try {
    const health = await client.getHealth()
    console.log('1. Health:', JSON.stringify(health))
  } catch (e: any) {
    console.log('1. Health error:', e.message)
  }

  // 2. Block number
  try {
    const block = await client.getBlockNumber()
    console.log('2. Block number:', block)
  } catch (e: any) {
    console.log('2. Block number error:', e.message)
  }

  // 3. Treasury balance
  try {
    const bal = await client.getBalance('7e9a0b3b573dd3733610743656e24788ab502651f6e602d57d330f90be1533d8')
    console.log('3. Treasury balance:', bal)
  } catch (e: any) {
    console.log('3. Treasury balance error:', e.message)
  }

  // 4. Apollo balance (SSP-derived address from genesis)
  try {
    const bal = await client.getBalance('cf187c520463ea4826d55edaa1a298ccca93c732e99b4ddc651a1a3c9d10b698')
    console.log('4. Apollo (genesis) balance:', bal)
  } catch (e: any) {
    console.log('4. Apollo (genesis) balance error:', e.message)
  }

  // 5. ClaimStarter for SDK-derived Apollo address
  try {
    const claim = await client.claimStarter('795acc4eed7f8ce9fa533cd027b6bb7c5f1e7e0c4449547d19486d15df418308')
    console.log('5. ClaimStarter (SDK Apollo):', JSON.stringify(claim))
  } catch (e: any) {
    console.log('5. ClaimStarter error:', e.message)
  }

  // 6. DRC-369 total supply
  try {
    const supply = await client.nftTotalSupply()
    console.log('6. NFT total supply:', supply)
  } catch (e: any) {
    console.log('6. NFT supply error:', e.message)
  }

  // 7. Identity resolve (non-existent)
  try {
    const id = await client.resolveIdentity('did:demiurge:test')
    console.log('7. Resolve identity:', JSON.stringify(id))
  } catch (e: any) {
    console.log('7. Resolve identity error:', e.message)
  }

  // 8. Consensus status
  try {
    const status = await client.getConsensusStatus()
    console.log('8. Consensus:', JSON.stringify(status))
  } catch (e: any) {
    console.log('8. Consensus error:', e.message)
  }
}

test().catch(err => console.error('Fatal:', err))
