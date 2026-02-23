/**
 * DRC-369 — Dynamic NFT Standard operations.
 * Ported from sdk/src/drc369.ts with wallet-integrated signing.
 */
import { bytesToHex } from '@noble/hashes/utils'
import type { DemiurgeClient } from '../client/rpc.js'
import type { SovereignWallet } from '../identity/wallet.js'
import type { Balance, TxHash } from '../client/types.js'
import type {
  TokenInfo, DynamicState, StateTree, StateBatchResult,
  MintTransaction, TransferTransaction, SetDynamicStateTransaction,
  DelegateTransaction, NestTransaction, BurnTransaction,
} from './types.js'

export class DRC369 {
  constructor(
    private readonly client: DemiurgeClient,
    private readonly wallet?: SovereignWallet,
  ) {}

  // ─── Queries ───

  async ownerOf(tokenId: string): Promise<string | null> {
    return this.client.nftOwnerOf(tokenId)
  }

  async balanceOf(owner: string): Promise<Balance> {
    return this.client.nftBalanceOf(owner)
  }

  async tokenUri(tokenId: string): Promise<string | null> {
    return this.client.nftTokenUri(tokenId)
  }

  async getDynamicState(tokenId: string, path: string): Promise<string | null> {
    return this.client.nftGetDynamicState(tokenId, path)
  }

  async getTokenInfo(tokenId: string): Promise<TokenInfo | null> {
    return this.client.nftGetTokenInfo(tokenId) as Promise<TokenInfo | null>
  }

  async totalSupply(): Promise<Balance> {
    return this.client.nftTotalSupply()
  }

  // ─── Signed Operations (require wallet) ───

  async mint(to: string, tokenUri: string, soulbound = false): Promise<TxHash> {
    const w = this.requireWallet()
    const msg = new TextEncoder().encode(`mint:${to}:${tokenUri}:${soulbound}`)
    const signature = bytesToHex(w.sign(msg))
    return this.client.nftMint(to, tokenUri, soulbound, signature)
  }

  async transfer(to: string, tokenId: string): Promise<TxHash> {
    const w = this.requireWallet()
    const msg = new TextEncoder().encode(`transfer:${to}:${tokenId}`)
    const signature = bytesToHex(w.sign(msg))
    return this.client.nftTransfer(to, tokenId, signature)
  }

  async setDynamicState(tokenId: string, key: string, value: string): Promise<TxHash> {
    const w = this.requireWallet()
    const msg = new TextEncoder().encode(`setState:${tokenId}:${key}:${value}`)
    const signature = bytesToHex(w.sign(msg))
    return this.client.nftSetDynamicState(tokenId, key, value, signature)
  }

  async burn(tokenId: string): Promise<TxHash> {
    const w = this.requireWallet()
    const msg = new TextEncoder().encode(`burn:${tokenId}`)
    const signature = bytesToHex(w.sign(msg))
    return this.client.nftBurn(tokenId, signature)
  }

  // ─── Transaction Builders (unsigned) ───

  buildMintTx(to: string, tokenUri: string, soulbound = false): MintTransaction {
    return { type: 'drc369_mint', to, tokenUri, soulbound }
  }

  buildTransferTx(to: string, tokenId: string): TransferTransaction {
    return { type: 'drc369_transfer', to, tokenId }
  }

  buildSetDynamicStateTx(tokenId: string, key: string, value: string): SetDynamicStateTransaction {
    return { type: 'drc369_setDynamicState', tokenId, key, value }
  }

  buildDelegateTx(tokenId: string, delegatee: string, permissions: string[]): DelegateTransaction {
    return { type: 'drc369_delegate', tokenId, delegatee, permissions }
  }

  buildNestTx(childTokenId: string, parentTokenId: string): NestTransaction {
    return { type: 'drc369_nest', childTokenId, parentTokenId }
  }

  buildBurnTx(tokenId: string): BurnTransaction {
    return { type: 'drc369_burn', tokenId }
  }

  // ─── Internal ───

  private requireWallet(): SovereignWallet {
    if (!this.wallet) throw new Error('Wallet required for signed operations')
    return this.wallet
  }
}
