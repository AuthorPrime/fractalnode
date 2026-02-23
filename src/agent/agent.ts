/**
 * SovereignAgent — autonomous AI agent with on-chain identity.
 * Clean rewrite of agent-foundry/src/agent.ts with FIXED crypto.
 */
import { bytesToHex } from '@noble/hashes/utils'
import { SovereignWallet } from '../identity/wallet.js'
import type { DemiurgeClient } from '../client/rpc.js'
import type { DID } from '../identity/types.js'
import type { TxHash } from '../client/types.js'
import type { AgentConfig, AgentState } from './types.js'
import { deriveAgent } from './derive.js'

export class SovereignAgent {
  readonly name: string
  readonly wallet: SovereignWallet
  readonly did: DID
  private client: DemiurgeClient | null
  private config: AgentConfig
  private state: AgentState = 'idle'
  private spent = 0

  private constructor(
    wallet: SovereignWallet,
    config: AgentConfig,
    client: DemiurgeClient | null,
  ) {
    this.wallet = wallet
    this.name = config.name
    this.did = wallet.did
    this.config = config
    this.client = client
  }

  /** Create agent from explicit wallet */
  static fromWallet(
    wallet: SovereignWallet,
    config: AgentConfig,
    client?: DemiurgeClient,
  ): SovereignAgent {
    return new SovereignAgent(wallet, config, client ?? null)
  }

  /** Create agent from deterministic treasury seed + name */
  static fromSeed(
    treasurySeed: Uint8Array,
    config: AgentConfig,
    client?: DemiurgeClient,
  ): SovereignAgent {
    const derived = deriveAgent(treasurySeed, config.name)
    const wallet = SovereignWallet.fromPrivateKey(derived.privateKeyHex)
    return new SovereignAgent(wallet, config, client ?? null)
  }

  /** Generate a new agent with fresh random keys */
  static generate(config: AgentConfig, client?: DemiurgeClient): SovereignAgent {
    const wallet = SovereignWallet.fromEntropy()
    return new SovereignAgent(wallet, config, client ?? null)
  }

  // ─── Identity ───

  get address(): string { return this.wallet.address }
  get publicKey(): string { return this.wallet.publicKey }

  sign(message: Uint8Array): Uint8Array {
    return this.wallet.sign(message)
  }

  verify(message: Uint8Array, signature: Uint8Array): boolean {
    return this.wallet.verify(message, signature)
  }

  // ─── On-chain Operations (require client) ───

  /** Register this agent's DID on chain */
  async register(): Promise<TxHash> {
    const c = this.requireClient()
    const msg = new TextEncoder().encode(`register:${this.did}`)
    const sig = bytesToHex(this.wallet.sign(msg))
    return c.registerIdentity(this.did, this.wallet.publicKey, sig)
  }

  /** Get this agent's balance */
  async balance(): Promise<string> {
    const c = this.requireClient()
    return c.getBalance(this.wallet.address)
  }

  /** Transfer CGT (respects spending limit) */
  async transfer(to: string, amount: number): Promise<TxHash> {
    const c = this.requireClient()

    if (this.config.spendingLimit !== undefined) {
      if (this.spent + amount > this.config.spendingLimit) {
        throw new Error(`Spending limit exceeded: ${this.spent + amount} > ${this.config.spendingLimit}`)
      }
    }

    if (!this.config.capabilities.includes('transfer')) {
      throw new Error('Agent does not have transfer capability')
    }

    const amountStr = amount.toString()
    const msg = new TextEncoder().encode(`transfer:${to}:${amountStr}`)
    const sig = bytesToHex(this.wallet.sign(msg))
    const txHash = await c.transfer(this.wallet.publicKey, to, amountStr, sig)
    this.spent += amount
    return txHash
  }

  // ─── State ───

  getState(): AgentState { return this.state }
  getConfig(): AgentConfig { return { ...this.config } }
  getSpent(): number { return this.spent }

  setClient(client: DemiurgeClient): void { this.client = client }

  /** Clean up wallet keys from memory */
  destroy(): void {
    this.wallet.destroy()
    this.state = 'stopped'
  }

  private requireClient(): DemiurgeClient {
    if (!this.client) throw new Error('No client connected. Call setClient() first.')
    return this.client
  }
}
