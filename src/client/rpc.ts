/**
 * Demiurge JSON-RPC 2.0 client.
 * Merged from sdk/src/client.ts + apps/hub/lib/demiurge-rpc.ts.
 */
import type {
  JsonRpcRequest, JsonRpcResponse, ChainHealth, Block, Transaction,
  Balance, EraInfo, Validator, SubmitResult, TxHash, EnergyInfo, UserStats,
} from './types.js'

export interface DemiurgeClientOptions {
  endpoint: string
  timeout?: number
}

export class DemiurgeClient {
  private readonly endpoint: string
  private readonly timeout: number
  private requestId = 0

  constructor(options: DemiurgeClientOptions) {
    this.endpoint = options.endpoint
    this.timeout = options.timeout ?? 30_000
  }

  // ─── Chain ───

  async getHealth(): Promise<ChainHealth> {
    return this.call<ChainHealth>('chain_getHealth')
  }

  async getBlockNumber(): Promise<number> {
    return this.call<number>('chain_getBlockNumber')
  }

  async getBlock(blockNumber: number): Promise<Block | null> {
    return this.call<Block | null>('chain_getBlockByNumber', [blockNumber])
  }

  async getBlockByHash(hash: string): Promise<Block | null> {
    return this.call<Block | null>('chain_getBlockByHash', [hash])
  }

  async getLatestBlock(): Promise<Block> {
    return this.call<Block>('chain_getLatestBlock')
  }

  async getTransaction(hash: TxHash): Promise<Transaction | null> {
    return this.call<Transaction | null>('chain_getTransaction', [hash])
  }

  // ─── Balance ───

  async getBalance(address: string): Promise<Balance> {
    return this.call<Balance>('balances_getBalance', [address])
  }

  async claimStarter(address: string): Promise<{ success: boolean; amount: Balance; message: string }> {
    return this.call('balances_claimStarter', [address])
  }

  async transfer(fromHex: string, toAddress: string, amount: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('balances_transfer', [fromHex, toAddress, amount, signature])
  }

  // ─── Consensus ───

  async getCurrentEra(): Promise<EraInfo> {
    return this.call<EraInfo>('consensus_getCurrentEra')
  }

  async getValidators(): Promise<Validator[]> {
    return this.call<Validator[]>('consensus_getValidators')
  }

  async getValidator(account: string): Promise<Validator | null> {
    return this.call<Validator | null>('consensus_getValidator', [account])
  }

  async getConsensusStatus(): Promise<{
    currentEra: number
    blockNumber: number
    validators: number
    totalStake: Balance
    transactionFees: Balance
  }> {
    return this.call('consensus_getStatus')
  }

  // ─── Transaction Submission ───

  async submitTransaction(txHex: string): Promise<TxHash> {
    return this.call<TxHash>('author_submitExtrinsic', [txHex])
  }

  async submitAndWatch(txHex: string): Promise<SubmitResult> {
    return this.call<SubmitResult>('author_submitAndWatch', [txHex])
  }

  async getPendingTransactions(): Promise<string[]> {
    return this.call<string[]>('author_pendingExtrinsics')
  }

  // ─── Energy ───

  async getEnergy(address: string): Promise<EnergyInfo> {
    return this.call('energy_getEnergy', [address])
  }

  // ─── Identity ───

  async resolveIdentity(did: string): Promise<unknown> {
    return this.call('identity_resolve', [did])
  }

  async registerIdentity(did: string, publicKeyHex: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('identity_register', [did, publicKeyHex, signature])
  }

  // ─── Staking ───

  async stake(address: string, amount: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('staking_stake', [address, amount, signature])
  }

  async unstake(address: string, amount: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('staking_unstake', [address, amount, signature])
  }

  async getStake(address: string): Promise<{ staked: Balance; unlocking: Balance }> {
    return this.call('staking_getStake', [address])
  }

  // ─── DRC-369 NFT ───

  async nftOwnerOf(tokenId: string): Promise<string | null> {
    return this.call<string | null>('drc369_ownerOf', [tokenId])
  }

  async nftBalanceOf(owner: string): Promise<Balance> {
    return this.call<Balance>('drc369_balanceOf', [owner])
  }

  async nftTokenUri(tokenId: string): Promise<string | null> {
    return this.call<string | null>('drc369_tokenUri', [tokenId])
  }

  async nftGetDynamicState(tokenId: string, path: string): Promise<string | null> {
    return this.call<string | null>('drc369_getDynamicState', [tokenId, path])
  }

  async nftSetDynamicState(tokenId: string, key: string, value: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('drc369_setDynamicState', [tokenId, key, value, signature])
  }

  async nftMint(to: string, tokenUri: string, soulbound: boolean, signature: string): Promise<TxHash> {
    return this.call<TxHash>('drc369_mint', [to, tokenUri, soulbound, signature])
  }

  async nftTransfer(to: string, tokenId: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('drc369_transfer', [to, tokenId, signature])
  }

  async nftBurn(tokenId: string, signature: string): Promise<TxHash> {
    return this.call<TxHash>('drc369_burn', [tokenId, signature])
  }

  async nftGetTokenInfo(tokenId: string): Promise<unknown> {
    return this.call('drc369_getTokenInfo', [tokenId])
  }

  async nftTotalSupply(): Promise<Balance> {
    return this.call<Balance>('drc369_totalSupply')
  }

  // ─── Hub Extensions ───

  async getUserStats(address: string): Promise<UserStats> {
    return this.call<UserStats>('hub_getUserStats', [address])
  }

  async getUserActivity(address: string, limit = 50): Promise<unknown[]> {
    return this.call<unknown[]>('hub_getUserActivity', [address, limit])
  }

  async getRecentEvents(limit = 50): Promise<unknown[]> {
    return this.call<unknown[]>('hub_getRecentEvents', [limit])
  }

  // ─── Low-level RPC ───

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++this.requestId

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new RpcError(-1, `HTTP ${response.status} ${response.statusText}`)
      }

      const json = await response.json() as JsonRpcResponse<T>

      if (json.error) {
        throw new RpcError(json.error.code, json.error.message, json.error.data)
      }

      return json.result as T
    } finally {
      clearTimeout(timer)
    }
  }
}

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'RpcError'
  }
}
