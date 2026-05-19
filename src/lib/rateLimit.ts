export type PlanId = 'free' | 'pro'

export type RateLimitConfig = {
  dailyQuota: number
  rpm: number
}

export const RATE_LIMITS: Record<PlanId, RateLimitConfig> = {
  free: { dailyQuota: 50, rpm: 5 },
  pro: { dailyQuota: 500, rpm: 30 },
}
