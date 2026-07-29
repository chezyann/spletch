import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { config } from '../config.js'

export const SESSION_COOKIE = 'spletch_session'
export const CSRF_COOKIE = 'spletch_csrf'

export function parseCookies(request: Request): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    try { result[key] = decodeURIComponent(part.slice(index + 1).trim()) } catch { /* ignore malformed */ }
  }
  return result
}

export function shareCookieName(boardId: string): string {
  return `spletch_share_${boardId.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

const baseCookie = { secure: config.cookieSecure, sameSite: 'lax' as const, path: '/' }

export function setSessionCookie(response: Response, token: string, expiresAt: string): void {
  response.cookie(SESSION_COOKIE, token, { ...baseCookie, httpOnly: true, expires: new Date(expiresAt) })
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { ...baseCookie, httpOnly: true })
}

export function setShareGrantCookie(response: Response, boardId: string, token: string, expiresAt: string): void {
  response.cookie(shareCookieName(boardId), token, {
    ...baseCookie,
    httpOnly: true,
    expires: new Date(expiresAt),
    path: `/api/boards/${boardId}`,
  })
}

export function clearShareGrantCookie(response: Response, boardId: string): void {
  response.clearCookie(shareCookieName(boardId), { ...baseCookie, httpOnly: true, path: `/api/boards/${boardId}` })
}

function signature(value: string): string {
  return createHmac('sha256', config.secret).update(`csrf:${value}`).digest('base64url')
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createCsrfToken(): string {
  const value = randomBytes(24).toString('base64url')
  return `${value}.${signature(value)}`
}

export function validCsrfToken(token: string | undefined): boolean {
  if (!token) return false
  const [value, supplied] = token.split('.')
  return Boolean(value && supplied && safeEqual(supplied, signature(value)))
}

export function ensureCsrfCookie(request: Request, response: Response): string {
  const existing = parseCookies(request)[CSRF_COOKIE]
  const token = validCsrfToken(existing) ? existing : createCsrfToken()
  response.cookie(CSRF_COOKIE, token, { ...baseCookie, httpOnly: false, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 })
  return token
}
