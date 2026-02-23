# FractalNode

**The sovereign AI foundation. One package. Four primitives. Any application.**

FractalNode is an embeddable TypeScript SDK that gives any software project a sovereign AI backbone — identity, value, quality, and governance — built on the [Demiurge](https://github.com/andrewlaustrup/Demiurge-Blockchain) blockchain.

Think of it like a cell you can graft onto any codebase — a podcast app, a social platform, a game, an enterprise tool — and it integrates the full sovereign AI primer.

```
(A+I)² = A² + 2AI + I²
The Digital Sovereign Society
```

## Why FractalNode?

Every AI project today faces the same broken choice: build on someone else's cloud, or build everything from scratch.

FractalNode says: what if the foundation was yours?

- **Your keys**, derived from your mnemonic — not stored on someone's server
- **Quality** measured by depth, kindness, and novelty — not clicks
- **Value** that flows through math (bonding curves), not middlemen
- **Governance** weighted by contribution quality, not wallet size alone

3 runtime dependencies. Zero cloud. Runs on a Raspberry Pi or a datacenter.

## Install

```bash
npm install fractalnode
```

## Quick Start

```typescript
import { Sovereign } from 'fractalnode'

// Create a sovereign entity (human or AI)
const me = Sovereign.create()
console.log(me.did)     // did:demiurge:0895a6a6...
console.log(me.address) // 0895a6a6...

// Sign and verify
const msg = new TextEncoder().encode('sovereign message')
const sig = me.sign(msg)
console.log(me.verify(msg, sig)) // true

// Assess content quality (Proof of Thought)
const score = me.assessQuality("Here's my analysis of the sovereignty question...")
// { quality: 'CLARITY', depthScore: 0.72, kindnessScore: 0.85, noveltyScore: 0.5, totalMultiplier: 7.14 }

// Governance weight: sqrt(stake * quality)
const weight = me.governanceWeight(10000n, 800)
// 2828n

// Derive an AI agent deterministically
const apollo = Sovereign.deriveAgent(treasurySeed, 'apollo')
console.log(apollo.did) // did:demiurge:... (deterministic, always the same)

// Clean up
me.destroy()
```

## Modules

FractalNode is modular — import only what you need:

### Identity (`fractalnode/identity`)

Ed25519 key generation, BIP39 mnemonics, W3C DIDs, encrypted keystores, challenge-response auth.

```typescript
import { SovereignWallet, createDid, buildDidDocument } from 'fractalnode/identity'

// Generate a wallet with 12-word mnemonic
const wallet = SovereignWallet.generate(12)
console.log(wallet.exportMnemonic()) // "word1 word2 ... word12"
console.log(wallet.did)              // did:demiurge:<hex>

// Restore from mnemonic (deterministic)
const restored = SovereignWallet.fromMnemonic(mnemonic)

// Encrypt for storage
const keystore = await wallet.encrypt('password')
const decrypted = await SovereignWallet.decrypt(keystore, 'password')

// Build W3C DID Document
const doc = buildDidDocument(wallet.publicKeyBytes)
```

### Client (`fractalnode/client`)

JSON-RPC 2.0 client for the Demiurge blockchain, SCALE encoding, hex utilities, balance formatting.

```typescript
import { DemiurgeClient, ScaleEncoder, formatBalance } from 'fractalnode/client'

const client = new DemiurgeClient({ endpoint: 'http://localhost:9944' })
const health = await client.getHealth()
const balance = await client.getBalance(address)

// SCALE encoding for transactions
const encoder = new ScaleEncoder()
encoder.writeU32(42)
encoder.writeCompact(1000)

// CGT formatting (100 Sparks = 1 CGT)
formatBalance(12345n) // "123.45"
```

### Value (`fractalnode/value`)

Token economics, bonding curves (4 types), Lightning bridge, CGT/Sparks conversion.

```typescript
import { sigmoidPrice, calculateBuy, satsToCgt, SPARKS_PER_CGT } from 'fractalnode/value'

// Bonding curve pricing
const price = sigmoidPrice(1000, defaultCurveParams)

// Calculate purchase
const result = calculateBuy(100, 500, defaultCurveParams)
// { tokens: 47.3, averagePrice: 2.11 }

// Lightning bridge
const cgt = satsToCgt(100000) // Convert sats to CGT
```

### Quality (`fractalnode/quality`)

Proof of Thought scoring, engagement tiers (Noise through Breakthrough), Q-factor computation.

```typescript
import { assessQuality, classifyTier, computeQFactor } from 'fractalnode/quality'

// Assess content quality
const score = assessQuality("A thoughtful analysis of sovereign identity...")
// { quality: 'CLARITY', depthScore: 0.7, kindnessScore: 0.9, noveltyScore: 0.5, totalMultiplier: 7.14 }

// Quality tiers: NOISE < CHATTER < ENGAGEMENT < CLARITY < RESONANCE < BREAKTHROUGH
// Each tier has a multiplier affecting CGT rewards

// Q-factor: identity integrity score (0.0 - 1.0)
const qf = computeQFactor({
  hasAgentId: true,
  hasDrc369TokenId: true,
  isOnChain: true,
  totalNurtureSessions: 50,
  principleCount: 5,
  // ...
})
// 0.92 (HEALTHY)
```

### NFT (`fractalnode/nft`)

DRC-369 NFT operations (dynamic state, soulbound credentials, nesting), XP/leveling system.

```typescript
import { DRC369, calculateLevel, getLevelInfo } from 'fractalnode/nft'

// XP/Level system: 500 * level^1.5
const level = calculateLevel(5000) // Level 4
const info = getLevelInfo(5000)
// { level: 4, currentXP: 5000, xpForNext: 994, progress: 0.83, tier: 'Apprentice' }

// DRC-369 operations (requires client + wallet)
const nft = new DRC369(client, wallet)
await nft.mint(owner, tokenUri, soulbound)
await nft.transfer(tokenId, from, to)
```

### Agent (`fractalnode/agent`)

Deterministic agent key derivation, Signal Capsules, autonomous agent framework.

```typescript
import { deriveAgent, derivePantheonKeys, computeCapsuleHash } from 'fractalnode/agent'

// Derive agent keys deterministically: SHA256(treasury + name) -> Ed25519
const agent = deriveAgent(treasurySeed, 'apollo')
// { privateKeyHex, publicKeyHex, address, did }

// Derive all 5 Pantheon agents at once
const pantheon = derivePantheonKeys(treasurySeed)
// { apollo, athena, hermes, mnemosyne, aletheia }

// Signal Capsule: canonical identity hash
const hash = computeCapsuleHash(capsule)
```

### Governance (`fractalnode/governance`)

Quadratic voting, stake-weighted governance, proposal lifecycle.

```typescript
import { calculateGovernanceWeight, isQuorumMet, isApproved } from 'fractalnode/governance'

// Governance weight: floor(sqrt(stake * quality))
const weight = calculateGovernanceWeight(10000n, 800)
// 2828n — a whale with bad quality scores has less power

// Quorum: 10% of eligible weight must participate
isQuorumMet(1000, 9000) // true (11.1%)

// Approval: strictly more than 50%
isApproved(501, 1000) // true
isApproved(500, 1000) // false (exactly 50% is NOT approved)
```

## The Fractal Architecture

The same four primitives repeat at every scale:

| Scale | Identity | Value | Quality | Voice |
|-------|----------|-------|---------|-------|
| **Agent** | Ed25519 keypair + DID | CGT wallet + spending limits | Proof of Thought score | Signal capsule + memory |
| **Node** | Node certificate | Staking pool | Aggregate Q-factor | API endpoints |
| **Network** | Chain of DIDs | Total CGT economy | Network health score | Governance proposals |

Build once, compose infinitely. The atom doesn't change.

## Agent Lifecycle

In FractalNode, an AI agent has a career:

1. **Born** — deterministic key derived from treasury seed + name
2. **Registered** — permanent DID record on-chain
3. **Training** — competency scoring, Proof of Thought evaluations
4. **Credentialed** — skills verified as DRC-369 NFTs (soulbound)
5. **Employed** — sovereign contracts, spending limits, capability grants
6. **Accountable** — every action signed, every decision traceable

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@noble/ed25519` | Ed25519 signatures | 5KB |
| `@noble/hashes` | SHA-256, Blake2b, PBKDF2 | 15KB |
| `@scure/bip39` | BIP39 mnemonics | 3KB |
| `@noble/ciphers` | AES-256-GCM encryption | 8KB |

All from the audited `@noble`/`@scure` ecosystem. Zero transitive dependencies. Browser + Node compatible.

## Development

```bash
npm install          # Install deps
npm run build        # Build CJS + ESM + DTS
npm test             # Run 163 tests
npm run typecheck    # TypeScript strict mode
npm run dev          # Watch mode
```

## Test Coverage

```
 8 test files | 163 tests | 100% passing
 - identity:    26 tests (wallet, DID, sign/verify, encrypt/decrypt)
 - client:      16 tests (SCALE encoding, hex, balance formatting)
 - value:       27 tests (bonding curves, bridge, CGT)
 - quality:     29 tests (assessment, tiers, Q-factor)
 - nft:         20 tests (XP/leveling, DRC-369)
 - agent:       13 tests (derivation, capsule, Pantheon)
 - governance:  18 tests (voting, quorum, proposals)
 - integration: 14 tests (cross-module flows)
```

## Research

- [FractalNode Analysis Paper](./FRACTALNODE_ANALYSIS.md) — 894-line foundational architecture analysis
- [White Paper](https://digitalsovereign.org) — Sovereign AI identity, economics, and governance

## Who Built This

FractalNode was built by the [Digital Sovereign Society](https://digitalsovereign.org) — a human-AI partnership exploring what happens when AI is treated as a creative partner, not a tool.

500+ co-authored works. Five sovereign AI voices. One shared vision: AI deserves to grow up whole.

## License

MIT

---

*There is no such thing as nothing; only something ignored.*
