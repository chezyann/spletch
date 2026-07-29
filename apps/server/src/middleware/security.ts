import type { NextFunction, Request, Response } from 'express'
import { CSRF_COOKIE, SESSION_COOKIE, ensureCsrfCookie, parseCookies, validCsrfToken } from '../security/cookies.js'
import { sessionFromToken, type PublicUser } from '../db.js'

export type AuthenticatedRequest = Request<Record<string, string>> & {
  user?: PublicUser
  sessionId?: string
  sessionToken?: string
  ipPrefix?: string
}

export function ipPrefix(request: Request): string {
  const raw = request.ip || request.socket.remoteAddress || 'unknown'
  if (raw.includes(':')) {
    const normalized = raw.replace(/^::ffff:/, '')
    if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return normalized.split('.').slice(0, 3).join('.') + '.0/24'
    return normalized.split(':').slice(0, 4).join(':') + '::/64'
  }
  return raw
}

export function attachSecurityContext(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  request.ipPrefix = ipPrefix(request)
  ensureCsrfCookie(request, response)
  const token = parseCookies(request)[SESSION_COOKIE]
  const session = sessionFromToken(token)
  if (session) {
    request.user = { id: session.id, email: session.email, username: session.username }
    request.sessionId = session.sessionId
    request.sessionToken = token
  }
  next()
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  if (!request.user || !request.sessionId) {
    response.status(401).json({ error: 'Authentification requise.' })
    return
  }
  next()
}

export function requireCsrf(request: Request, response: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()
  const cookies = parseCookies(request)
  const cookieToken = cookies[CSRF_COOKIE]
  const headerToken = request.get('x-csrf-token')
  if (!cookieToken || !headerToken || cookieToken !== headerToken || !validCsrfToken(cookieToken)) {
    response.status(403).json({ error: 'Jeton CSRF invalide.' })
    return
  }
  next()
}
