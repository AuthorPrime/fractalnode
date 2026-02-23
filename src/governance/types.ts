import type { DID } from '../identity/types.js'

/** Proposal status lifecycle */
export type ProposalStatus = 'pending' | 'active' | 'passed' | 'rejected' | 'executed'

/** A governance proposal */
export interface Proposal {
  id: string
  title: string
  description: string
  proposer: DID
  status: ProposalStatus
  createdAt: number
  votingEndsAt: number
  approveWeight: bigint
  rejectWeight: bigint
  totalWeight: bigint
  quorumMet: boolean
}

/** A recorded vote */
export interface VoteRecord {
  proposalId: string
  voter: DID
  approve: boolean
  weight: bigint
  timestamp: number
}

/** Governance weight calculation input */
export interface GovernanceInput {
  stake: bigint
  qualityScore: number
}
