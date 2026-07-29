import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import type { Role } from '../db.js'

export type RealtimeTicket = {
  v: 1
  jti: string
  boardId: string
  role: Role
  sessionId?: string
  shareGrantId?: string
  userId?: string
  username: string
  guest: boolean
  iat: number
  exp: number
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
function sign(value: string): string {
  return createHmac('sha256', config.secret).update(`realtime:${value}`).digest('base64url')
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function issueRealtimeTicket(input: Omit<RealtimeTicket, 'v' | 'jti' | 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: RealtimeTicket = { v: 1, jti: randomUUID(), iat: now, exp: now + config.realtimeTicketSeconds, ...input }
  const body = encode(payload)
  return `${body}.${sign(body)}`
}

export function verifyRealtimeTicket(token: string): RealtimeTicket | null {
  const [body, supplied] = token.split('.')
  if (!body || !supplied || !equal(sign(body), supplied)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as RealtimeTicket
    const now = Math.floor(Date.now() / 1000)
    if (payload.v !== 1 || payload.exp <= now || payload.iat > now + 30 || !payload.boardId || !payload.username) return null
    return payload
  } catch {
    return null
  }
}
