/**
 * Proposal lifecycle — create, vote, query.
 */
import { bytesToHex } from '@noble/hashes/utils'
import type { DemiurgeClient } from '../client/rpc.js'
import type { SovereignWallet } from '../identity/wallet.js'
import type { TxHash } from '../client/types.js'
import type { Proposal } from './types.js'

/** Create a governance proposal */
export async function createProposal(
  client: DemiurgeClient,
  wallet: SovereignWallet,
  title: string,
  description: string,
): Promise<TxHash> {
  const msg = new TextEncoder().encode(`propose:${title}`)
  const signature = bytesToHex(wallet.sign(msg))
  return client.call<TxHash>('governance_propose', [
    wallet.publicKey, title, description, signature,
  ])
}

/** Cast a vote on a proposal */
export async function castVote(
  client: DemiurgeClient,
  wallet: SovereignWallet,
  proposalId: string,
  approve: boolean,
): Promise<TxHash> {
  const msg = new TextEncoder().encode(`vote:${proposalId}:${approve}`)
  const signature = bytesToHex(wallet.sign(msg))
  return client.call<TxHash>('governance_vote', [
    wallet.publicKey, proposalId, approve, signature,
  ])
}

/** Get a single proposal by ID */
export async function getProposal(
  client: DemiurgeClient,
  proposalId: string,
): Promise<Proposal | null> {
  return client.call<Proposal | null>('governance_getProposal', [proposalId])
}

/** List proposals with optional status filter */
export async function listProposals(
  client: DemiurgeClient,
  status?: string,
): Promise<Proposal[]> {
  const params = status ? [status] : []
  return client.call<Proposal[]>('governance_listProposals', params)
}
