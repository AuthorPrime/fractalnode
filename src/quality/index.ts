export {
  assessDepth, assessKindness, assessNovelty,
  classifyTier, calculateMultiplier, assessQuality,
} from './assessment.js'
export { computeQFactor, getQStatus, Q_HEALTHY, Q_WATCHFUL } from './qfactor.js'
export {
  QUALITY_MULTIPLIERS, POT_REWARDS, TIER_THRESHOLDS,
  Q_WEIGHTS,
} from './tiers.js'
export type {
  EngagementQuality, EngagementScore, QFactor, QFactorComponents,
  PremiumTier, TierThreshold,
} from './types.js'
export type { QFactorInput } from './qfactor.js'
