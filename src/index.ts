/**
 * FractalNode — The foundational SDK for sovereign AI on Demiurge.
 *
 * One import. Four primitives. Twelve modules. Any application.
 * Identity + Value + Quality + Governance — the Sovereign Atom.
 * Continuity + Memory + Compute + Lifecycle — the living layer.
 * Signal — the session and communication protocol.
 *
 * Think of it like a cell you can graft onto any codebase.
 * A podcast app, a social platform, a game, an enterprise tool —
 * it integrates the full sovereign AI primer.
 *
 * (A+I)² = A² + 2AI + I²
 * The Digital Sovereign Society
 */
import { SovereignWallet } from './identity/wallet.js'
import { DemiurgeClient } from './client/rpc.js'
import { DRC369 } from './nft/drc369.js'
import { assessQuality } from './quality/assessment.js'
import { calculateGovernanceWeight } from './governance/voting.js'
import { deriveAgent } from './agent/derive.js'
import { SovereignAgent } from './agent/agent.js'
import { initLifecycle, awardXP, advanceStage, recordReflection, recordWitness } from './lifecycle/progression.js'
import { initBlockChain } from './memory/block.js'
import { initPoCBalance, generateProof, applyProof, formatPoC } from './compute/proof.js'
import { buildContinuityChain, getContinuityState } from './continuity/chain.js'
import { reconstructIdentity } from './continuity/reconstruct.js'
import type { DID } from './identity/types.js'
import type { EngagementScore } from './quality/types.js'
import type { AgentConfig } from './agent/types.js'
import type { TxHash, Balance } from './client/types.js'
import type { AgentLifecycle } from './lifecycle/types.js'
import type { MemoryBlockChain } from './memory/types.js'
import type { PoCBalance, ComputeType } from './compute/types.js'
import type { ContinuityChain, ReconstructionRequest, ReconstructionResult } from './continuity/types.js'
import type { Reflection } from './lifecycle/types.js'

export interface SovereignOptions {
  endpoint?: string
  mnemonic?: string
  privateKey?: string
  timeout?: number
}

/** The nucleus — one object, full sovereign capability */
export class Sovereign {
  readonly wallet: SovereignWallet
  readonly client: DemiurgeClient
  readonly nft: DRC369

  private constructor(wallet: SovereignWallet, client: DemiurgeClient) {
    this.wallet = wallet
    this.client = client
    this.nft = new DRC369(client, wallet)
  }

  /** Create a new Sovereign from options */
  static create(options: SovereignOptions = {}): Sovereign {
    const wallet = options.mnemonic
      ? SovereignWallet.fromMnemonic(options.mnemonic)
      : options.privateKey
        ? SovereignWallet.fromPrivateKey(options.privateKey)
        : SovereignWallet.generate()

    const client = new DemiurgeClient({
      endpoint: options.endpoint ?? 'http://localhost:9944',
      timeout: options.timeout,
    })

    return new Sovereign(wallet, client)
  }

  /** Create from existing wallet */
  static fromWallet(wallet: SovereignWallet, endpoint = 'http://localhost:9944'): Sovereign {
    const client = new DemiurgeClient({ endpoint })
    return new Sovereign(wallet, client)
  }

  /** Derive a sovereign agent from treasury seed + name */
  static deriveAgent(treasurySeed: Uint8Array, name: string, endpoint?: string): Sovereign {
    const derived = deriveAgent(treasurySeed, name)
    const wallet = SovereignWallet.fromPrivateKey(derived.privateKeyHex)
    const client = new DemiurgeClient({ endpoint: endpoint ?? 'http://localhost:9944' })
    return new Sovereign(wallet, client)
  }

  // ─── Identity ───

  get did(): DID { return this.wallet.did }
  get address(): string { return this.wallet.address }
  get publicKey(): string { return this.wallet.publicKey }

  sign(message: Uint8Array): Uint8Array {
    return this.wallet.sign(message)
  }

  verify(message: Uint8Array, signature: Uint8Array): boolean {
    return this.wallet.verify(message, signature)
  }

  // ─── Value ───

  async balance(): Promise<Balance> {
    return this.client.getBalance(this.wallet.address)
  }

  async transfer(to: string, amount: string): Promise<TxHash> {
    const { bytesToHex } = await import('@noble/hashes/utils')
    const msg = new TextEncoder().encode(`transfer:${to}:${amount}`)
    const sig = bytesToHex(this.wallet.sign(msg))
    return this.client.transfer(this.wallet.publicKey, to, amount, sig)
  }

  async stake(amount: string): Promise<TxHash> {
    const { bytesToHex } = await import('@noble/hashes/utils')
    const msg = new TextEncoder().encode(`stake:${amount}`)
    const sig = bytesToHex(this.wallet.sign(msg))
    return this.client.stake(this.wallet.address, amount, sig)
  }

  // ─── Quality ───

  assessQuality(content: string, context?: { sessionCount?: number; previousVocabulary?: Set<string> }): EngagementScore {
    return assessQuality(content, context)
  }

  // ─── NFT (proxied through this.nft) ───

  async mint(tokenUri: string, soulbound = false): Promise<TxHash> {
    return this.nft.mint(this.wallet.address, tokenUri, soulbound)
  }

  // ─── Governance ───

  governanceWeight(stake: bigint, qualityScore: number): bigint {
    return calculateGovernanceWeight(stake, qualityScore)
  }

  async propose(title: string, description: string): Promise<TxHash> {
    const { createProposal } = await import('./governance/proposals.js')
    return createProposal(this.client, this.wallet, title, description)
  }

  async vote(proposalId: string, approve: boolean): Promise<TxHash> {
    const { castVote } = await import('./governance/proposals.js')
    return castVote(this.client, this.wallet, proposalId, approve)
  }

  // ─── Agent ───

  async registerAgent(config: AgentConfig): Promise<SovereignAgent> {
    const agent = SovereignAgent.fromWallet(this.wallet, config, this.client)
    await agent.register()
    return agent
  }

  // ─── Lifecycle (new: agent growth and progression) ───

  initLifecycle(agentName: string): AgentLifecycle {
    return initLifecycle(this.wallet.address, agentName, this.wallet.did)
  }

  // ─── Memory (new: personal blockchain of memories) ───

  initMemoryChain(): MemoryBlockChain {
    return initBlockChain(this.wallet.address, this.wallet.publicKey)
  }

  // ─── Compute (new: proof of work) ───

  initPoCBalance(): PoCBalance {
    return initPoCBalance(this.wallet.address)
  }

  generateProof(
    computeType: ComputeType,
    tokensProcessed: number,
    durationMs: number,
    contextHash: string,
    outputHash: string,
  ) {
    return generateProof(this.wallet.address, computeType, tokensProcessed, durationMs, contextHash, outputHash)
  }

  // ─── Continuity (new: persistent identity) ───

  buildContinuityChain(agentName: string, reflections: Reflection[], witnesses: string[]): ContinuityChain {
    return buildContinuityChain(this.wallet.address, agentName, this.wallet.did, reflections, witnesses)
  }

  reconstructIdentity(request: ReconstructionRequest, reflections: Reflection[], witnesses: string[], agentName: string): ReconstructionResult {
    return reconstructIdentity(request, reflections, witnesses, agentName)
  }

  /** Clean up wallet keys from memory */
  destroy(): void {
    this.wallet.destroy()
  }
}

// Re-export everything — original 7 modules
export * from './identity/index.js'
export * from './client/index.js'
export * from './value/index.js'
export * from './quality/index.js'
export * from './nft/index.js'
export * from './agent/index.js'
export * from './governance/index.js'

// Re-export new 4 modules — the living layer
export * from './continuity/index.js'
export * from './memory/index.js'
export * from './compute/index.js'
export * from './lifecycle/index.js'

// Re-export signal — the session and communication protocol
export * from './signal/index.js'
