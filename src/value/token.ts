/**
 * CGT token operations — query and transact.
 */
import { bytesToHex } from '@noble/hashes/utils'
import type { DemiurgeClient } from '../client/rpc.js'
import type { SovereignWallet } from '../identity/wallet.js'
import type { Balance, TxHash } from '../client/types.js'
import { SPARKS_PER_CGT, CGT_TOTAL_SUPPLY, EXISTENTIAL_DEPOSIT } from './bridge.js'

export { SPARKS_PER_CGT, CGT_TOTAL_SUPPLY, EXISTENTIAL_DEPOSIT }

/** Get account balance as raw Sparks string */
export async function getBalance(client: DemiurgeClient, address: string): Promise<Balance> {
  return client.getBalance(address)
}

/** Transfer CGT. Amount is in Sparks (100 Sparks = 1 CGT). */
export async function transfer(
  client: DemiurgeClient,
  wallet: SovereignWallet,
  to: string,
  amount: string,
): Promise<TxHash> {
  const message = new TextEncoder().encode(`transfer:${to}:${amount}`)
  const signature = bytesToHex(wallet.sign(message))
  return client.transfer(wallet.publicKey, to, amount, signature)
}

/** Stake CGT for governance weight */
export async function stake(
  client: DemiurgeClient,
  wallet: SovereignWallet,
  amount: string,
): Promise<TxHash> {
  const message = new TextEncoder().encode(`stake:${amount}`)
  const signature = bytesToHex(wallet.sign(message))
  return client.stake(wallet.address, amount, signature)
}

/** Unstake CGT */
export async function unstake(
  client: DemiurgeClient,
  wallet: SovereignWallet,
  amount: string,
): Promise<TxHash> {
  const message = new TextEncoder().encode(`unstake:${amount}`)
  const signature = bytesToHex(wallet.sign(message))
  return client.unstake(wallet.address, amount, signature)
}

/** Get staking info for an address */
export async function getStake(
  client: DemiurgeClient,
  address: string,
): Promise<{ staked: Balance; unlocking: Balance }> {
  return client.getStake(address)
}

/** Claim starter CGT bonus for a new account */
export async function claimStarter(
  client: DemiurgeClient,
  address: string,
): Promise<{ success: boolean; amount: Balance; message: string }> {
  return client.claimStarter(address)
}
