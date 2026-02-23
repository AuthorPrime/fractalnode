/** Bonding curve type */
export type CurveType = 'linear' | 'polynomial' | 'sigmoid' | 'sublinear'

/** Bonding curve parameters */
export interface CurveParams {
  curveType: CurveType
  initialPrice: number
  reserveRatio: number
  linearSlope: number
  polyCoefficient: number
  polyExponent: number
  sigmoidMaxPrice: number
  sigmoidMidpoint: number
  sigmoidSteepness: number
  sublinearCoefficient: number
  sublinearRoot: number
  maxSupply: number
}

/** Current state of a bonding curve */
export interface CurveState {
  curveId: string
  params: CurveParams
  totalSupply: number
  reserveBalance: number
  totalBought: number
  totalSold: number
  totalVolume: number
  currentPrice: number
}

/** Result of a buy/sell/mint trade */
export interface TradeResult {
  tradeType: 'buy' | 'sell' | 'mint'
  tokensAmount: number
  baseAmount: number
  averagePrice: number
  newSupply: number
  newPrice: number
  newReserve: number
  slippagePercent: number
}

/** Compute action costs (in sats) */
export interface ComputeCosts {
  thought: number
  deliberation: number
  synthesis: number
  reflection: number
  memoryStore: number
  nftEvolve: number
  nostrPublish: number
}

/** Session pool distribution (percentages) */
export interface PoolDistribution {
  participant: number
  agents: number
  infrastructure: number
}

/** Result of session distribution calculation */
export interface SessionDistribution {
  totalRawSats: number
  qualityTier: string
  qualityMultiplier: number
  effectiveTotalSats: number
  participantSats: number
  perAgentSats: number
  numAgents: number
  totalAgentSats: number
  infrastructureSats: number
  estimatedCgt: number
}
