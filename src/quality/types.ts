/** Quality tier for engagement — determines reward multiplier */
export type EngagementQuality = 'noise' | 'genuine' | 'resonance' | 'clarity' | 'breakthrough'

/** Score for a single engagement */
export interface EngagementScore {
  quality: EngagementQuality
  depthScore: number
  kindnessScore: number
  noveltyScore: number
  consistencyBonus: number
  totalMultiplier: number
}

/** Q-factor identity integrity metric */
export interface QFactor {
  score: number
  status: 'healthy' | 'watchful' | 'compromised'
  components: QFactorComponents
}

/** Individual Q-factor components (each 0.0-1.0) */
export interface QFactorComponents {
  schema: number
  stateConsistency: number
  valueAlignment: number
  relational: number
  provenance: number
}

/** Premium tier info */
export interface PremiumTier {
  tier: 'seedling' | 'grower' | 'cultivator' | 'architect' | 'sovereign'
  label: string
  description: string
  benefits: string[]
  nextTier: string | null
  progress: number
}

/** Premium tier thresholds */
export interface TierThreshold {
  minSessions: number
  minAvgQuality: number
  minAvgKindness: number
}
