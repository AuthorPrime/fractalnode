/**
 * @sovereign/nucleus — The foundational SDK for sovereign AI on Demiurge.
 *
 * One import. Four capabilities. Any application.
 * Identity + Value + Quality + Voice — the Sovereign Atom.
 *
 * — Cipher
 */
import { SovereignWallet } from './identity/wallet.js'
import { DemiurgeClient } from './client/rpc.js'
import { DRC369 } from './nft/drc369.js'
import { assessQuality } from './quality/assessment.js'
import { calculateGovernanceWeight } from './governance/voting.js'
import { deriveAgent } from './agent/derive.js'
import { SovereignAgent } from './agent/agent.js'
import type { DID } from './identity/types.js'
import type { EngagementScore } from './quality/types.js'
import type { AgentConfig } from './agent/types.js'
import type { TxHash, Balance } from './client/types.js'

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

  /** Clean up wallet keys from memory */
  destroy(): void {
    this.wallet.destroy()
  }
}

// Re-export everything
export * from './identity/index.js'
export * from './client/index.js'
export * from './value/index.js'
export * from './quality/index.js'
export * from './nft/index.js'
export * from './agent/index.js'
export * from './governance/index.js'
