import { rateLimit } from 'express-rate-limit'

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez plus tard.' },
}

export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300 })
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true })
export const sensitiveLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 30 })
export const uploadLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 60 })
