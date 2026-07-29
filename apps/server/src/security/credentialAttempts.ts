import { createHmac } from 'node:crypto'
import { config } from '../config.js'

type Bucket = { stamps: number[]; blockedUntil: number }
const buckets = new Map<string, Bucket>()
const WINDOW_MS = 15 * 60_000
const ACCOUNT_LIMIT = 12
const PAIR_LIMIT = 7
const BLOCK_MS = 15 * 60_000

function digest(value: string): string {
  return createHmac('sha256', config.secret).update(`credential:${value.normalize('NFKC').trim().toLocaleLowerCase('fr-FR')}`).digest('base64url').slice(0, 24)
}
function bucket(key: string, now = Date.now()): Bucket {
  const current = buckets.get(key) ?? { stamps: [], blockedUntil: 0 }
  current.stamps = current.stamps.filter(stamp => stamp > now - WINDOW_MS)
  buckets.set(key, current)
  return current
}
function keys(login: string, ipPrefix: string | undefined): [string, string] {
  const account = digest(login)
  return [`account:${account}`, `pair:${ipPrefix ?? 'unknown'}:${account}`]
}

export function credentialAttemptAllowed(login: string, ipPrefix?: string): boolean {
  const now = Date.now()
  const [accountKey, pairKey] = keys(login, ipPrefix)
  const account = bucket(accountKey, now)
  const pair = bucket(pairKey, now)
  return account.blockedUntil <= now && pair.blockedUntil <= now && account.stamps.length < ACCOUNT_LIMIT && pair.stamps.length < PAIR_LIMIT
}

export function recordCredentialFailure(login: string, ipPrefix?: string): void {
  const now = Date.now()
  const [accountKey, pairKey] = keys(login, ipPrefix)
  const account = bucket(accountKey, now)
  const pair = bucket(pairKey, now)
  account.stamps.push(now)
  pair.stamps.push(now)
  if (account.stamps.length >= ACCOUNT_LIMIT) account.blockedUntil = now + BLOCK_MS
  if (pair.stamps.length >= PAIR_LIMIT) pair.blockedUntil = now + BLOCK_MS
}

export function clearCredentialFailures(login: string, ipPrefix?: string): void {
  const [accountKey, pairKey] = keys(login, ipPrefix)
  buckets.delete(accountKey)
  buckets.delete(pairKey)
}

export function credentialIdentifier(login: string): string { return digest(login) }

export function cleanupCredentialAttempts(): void {
  const now = Date.now()
  for (const [key, value] of buckets) {
    value.stamps = value.stamps.filter(stamp => stamp > now - WINDOW_MS)
    if (!value.stamps.length && value.blockedUntil <= now) buckets.delete(key)
  }
}
