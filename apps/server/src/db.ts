import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import argon2 from 'argon2'
import { config, dataDir } from './config.js'
import { normalizeUsername } from './security/normalize.js'

export const databasePath = path.join(dataDir, 'spletch.sqlite')
const legacyDatabasePath = path.join(dataDir, 'atelier.sqlite')
if (!fs.existsSync(databasePath) && fs.existsSync(legacyDatabasePath)) {
  fs.renameSync(legacyDatabasePath, databasePath)
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${legacyDatabasePath}${suffix}`)) fs.renameSync(`${legacyDatabasePath}${suffix}`, `${databasePath}${suffix}`)
  }
}
export const db = new DatabaseSync(databasePath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;')

function hasColumn(table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(row => row.name === column)
}
function addColumn(table: string, definition: string): void {
  const name = definition.trim().split(/\s+/)[0]
  if (!hasColumn(table, name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

// The CREATE statements are deliberately idempotent. Existing prototype databases are migrated below.
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    disabled_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    revoked_at TEXT,
    user_agent TEXT,
    ip_prefix TEXT
  );
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS board_memberships (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
    invited_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (board_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    permission TEXT NOT NULL CHECK(permission IN ('editor', 'viewer')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT,
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS share_grants (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    share_link_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    permission TEXT NOT NULL CHECK(permission IN ('editor', 'viewer')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY,
    board_id TEXT,
    data BLOB NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 3,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK(kind IN ('image', 'pdf', 'pdf-page')),
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    page_number INTEGER,
    source_asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('ready', 'processing', 'failed')),
    error_message TEXT,
    source_document_id TEXT,
    source_name TEXT,
    page_count INTEGER,
    dpi INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    board_id TEXT REFERENCES boards(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    ip_prefix TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_memberships_user ON board_memberships(user_id);
  CREATE INDEX IF NOT EXISTS idx_share_token ON share_links(token_hash);
  CREATE INDEX IF NOT EXISTS idx_share_grants_token ON share_grants(token_hash);
  CREATE INDEX IF NOT EXISTS idx_assets_board ON assets(board_id);
  CREATE INDEX IF NOT EXISTS idx_audit_board ON audit_events(board_id, created_at);
`)

// Migrate databases created by the first prototype.
addColumn('users', 'updated_at TEXT')
addColumn('users', 'disabled_at TEXT')
addColumn('sessions', 'last_seen_at TEXT')
addColumn('sessions', 'revoked_at TEXT')
addColumn('sessions', 'user_agent TEXT')
addColumn('sessions', 'ip_prefix TEXT')
addColumn('boards', 'schema_version INTEGER NOT NULL DEFAULT 2')
addColumn('boards', 'deleted_at TEXT')
addColumn('share_links', 'expires_at TEXT')
addColumn('share_links', 'last_used_at TEXT')
addColumn('documents', 'board_id TEXT')
addColumn('documents', 'size_bytes INTEGER NOT NULL DEFAULT 0')
addColumn('documents', 'schema_version INTEGER NOT NULL DEFAULT 2')
addColumn('documents', 'updated_at TEXT')
addColumn('assets', 'source_document_id TEXT')
addColumn('assets', 'source_name TEXT')
addColumn('assets', 'page_count INTEGER')
addColumn('assets', 'dpi INTEGER')
db.exec(`DROP INDEX IF EXISTS idx_pdf_page_unique`)
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_page_dpi_unique ON assets(board_id, source_document_id, page_number, dpi) WHERE kind = 'pdf-page' AND source_document_id IS NOT NULL`)
db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(3, new Date().toISOString())

export type Role = 'owner' | 'editor' | 'viewer'
export type PublicUser = { id: string; email: string; username: string }
export type SessionUser = PublicUser & { sessionId: string }
export type BoardRecord = { id: string; title: string; ownerId: string; createdAt: string; updatedAt: string; ownerUsername: string; schemaVersion: number }
export type AccessResult = {
  board: BoardRecord
  role: Role
  user: PublicUser | null
  sessionId?: string
  shareGrantId?: string
}

const nowIso = () => new Date().toISOString()
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  })
}

function verifyLegacyScrypt(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex || !/^[a-f0-9]+$/i.test(saltHex + hashHex)) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith('$argon2')) return await argon2.verify(stored, password)
    return verifyLegacyScrypt(password, stored)
  } catch {
    return false
  }
}

export async function createUser(email: string, username: string, password: string): Promise<PublicUser> {
  const stamp = nowIso()
  const user = { id: randomUUID(), email: email.trim().toLowerCase(), username: normalizeUsername(username) }
  db.prepare(`INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(user.id, user.email, user.username, await hashPassword(password), stamp, stamp)
  return user
}

export async function authenticateUser(login: string, password: string): Promise<PublicUser | null> {
  const row = db.prepare(`SELECT id, email, username, password_hash FROM users WHERE disabled_at IS NULL AND (email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE)`)
    .get(login.trim(), login.trim()) as (PublicUser & { password_hash: string }) | undefined
  if (!row || !(await verifyPassword(password, row.password_hash))) return null
  if (!row.password_hash.startsWith('$argon2')) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(await hashPassword(password), nowIso(), row.id)
  }
  return { id: row.id, email: row.email, username: row.username }
}

export function createSession(userId: string, metadata: { userAgent?: string; ipPrefix?: string } = {}): { id: string; token: string; expiresAt: string } {
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const stamp = nowIso()
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, hashToken(token), expiresAt, stamp, stamp, metadata.userAgent?.slice(0, 300) ?? null, metadata.ipPrefix ?? null)
  const active = db.prepare(`SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`).all(userId, stamp) as { id: string }[]
  for (const stale of active.slice(config.maxActiveSessionsPerUser)) db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(stamp, stale.id)
  return { id, token, expiresAt }
}

export function sessionFromToken(token?: string | null): SessionUser | null {
  if (!token) return null
  const stamp = nowIso()
  const row = db.prepare(`
    SELECT u.id, u.email, u.username, s.id AS sessionId, s.last_seen_at AS lastSeenAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL AND u.disabled_at IS NULL
  `).get(hashToken(token), stamp) as (SessionUser & { lastSeenAt?: string | null }) | undefined
  if (row && (!row.lastSeenAt || Date.parse(row.lastSeenAt) < Date.now() - 5 * 60_000)) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(stamp, row.sessionId)
  }
  if (!row) return null
  return { id: row.id, email: row.email, username: row.username, sessionId: row.sessionId }
}

export function validSessionId(sessionId: string, userId?: string): boolean {
  const row = db.prepare(`SELECT user_id AS userId FROM sessions WHERE id = ? AND expires_at > ? AND revoked_at IS NULL`).get(sessionId, nowIso()) as { userId: string } | undefined
  return Boolean(row && (!userId || row.userId === userId))
}

export function revokeSessionByToken(token: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(nowIso(), hashToken(token))
}
export function revokeSession(sessionId: string, userId: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?').run(nowIso(), sessionId, userId)
}
export function revokeAllSessions(userId: string, exceptSessionId?: string): void {
  if (exceptSessionId) db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL').run(nowIso(), userId, exceptSessionId)
  else db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId)
}
export function listSessions(userId: string) {
  return db.prepare(`SELECT id, expires_at AS expiresAt, created_at AS createdAt, last_seen_at AS lastSeenAt, user_agent AS userAgent, ip_prefix AS ipPrefix FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`).all(userId, nowIso())
}

export function createBoard(ownerId: string, title: string) {
  const count = db.prepare('SELECT COUNT(*) AS total FROM boards WHERE owner_id = ? AND deleted_at IS NULL').get(ownerId) as { total: number }
  if (count.total >= config.maxBoardsPerUser) throw new Error('Quota de tableaux atteint.')
  const stamp = nowIso()
  const board = { id: randomUUID(), ownerId, title: title.trim() || 'Tableau sans titre', schemaVersion: 3, createdAt: stamp, updatedAt: stamp, role: 'owner' as const }
  db.prepare(`INSERT INTO boards (id, owner_id, title, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(board.id, ownerId, board.title, board.schemaVersion, stamp, stamp)
  return board
}

export function listBoards(userId: string) {
  return db.prepare(`
    SELECT b.id, b.title, b.owner_id AS ownerId, b.schema_version AS schemaVersion, b.created_at AS createdAt, b.updated_at AS updatedAt,
      CASE WHEN b.owner_id = ? THEN 'owner' ELSE bm.role END AS role, u.username AS ownerUsername
    FROM boards b JOIN users u ON u.id = b.owner_id
    LEFT JOIN board_memberships bm ON bm.board_id = b.id AND bm.user_id = ?
    WHERE b.deleted_at IS NULL AND (b.owner_id = ? OR bm.user_id = ?)
    ORDER BY b.updated_at DESC
  `).all(userId, userId, userId, userId)
}

export function getBoard(boardId: string): BoardRecord | undefined {
  return db.prepare(`SELECT b.id, b.title, b.owner_id AS ownerId, b.schema_version AS schemaVersion, b.created_at AS createdAt, b.updated_at AS updatedAt, u.username AS ownerUsername FROM boards b JOIN users u ON u.id = b.owner_id WHERE b.id = ? AND b.deleted_at IS NULL`)
    .get(boardId) as BoardRecord | undefined
}

export function updateBoardTitle(boardId: string, title: string) {
  db.prepare('UPDATE boards SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(title.trim() || 'Tableau sans titre', nowIso(), boardId)
  return getBoard(boardId)
}
export function softDeleteBoard(boardId: string): void {
  db.prepare('UPDATE boards SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), boardId)
}

export function accessForSession(boardId: string, sessionToken?: string | null): AccessResult | null {
  const board = getBoard(boardId)
  if (!board) return null
  const session = sessionFromToken(sessionToken)
  if (!session) return null
  const user: PublicUser = { id: session.id, email: session.email, username: session.username }
  if (board.ownerId === session.id) return { board, role: 'owner', user, sessionId: session.sessionId }
  const membership = db.prepare('SELECT role FROM board_memberships WHERE board_id = ? AND user_id = ?').get(boardId, session.id) as { role: 'editor' | 'viewer' } | undefined
  return membership ? { board, role: membership.role, user, sessionId: session.sessionId } : null
}

export function exchangeShareLink(boardId: string, shareToken: string): { token: string; expiresAt: string; grantId: string; permission: 'editor' | 'viewer' } | null {
  const stamp = nowIso()
  const link = db.prepare(`SELECT id, permission, expires_at AS expiresAt FROM share_links WHERE board_id = ? AND token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`)
    .get(boardId, hashToken(shareToken), stamp) as { id: string; permission: 'editor' | 'viewer'; expiresAt: string | null } | undefined
  if (!link) return null
  const token = randomBytes(32).toString('base64url')
  const grantId = randomUUID()
  const maxExpiry = Date.now() + config.shareGrantHours * 60 * 60 * 1000
  const expiresAt = new Date(link.expiresAt ? Math.min(maxExpiry, Date.parse(link.expiresAt)) : maxExpiry).toISOString()
  db.prepare(`INSERT INTO share_grants (id, board_id, share_link_id, token_hash, permission, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(grantId, boardId, link.id, hashToken(token), link.permission, stamp, expiresAt, stamp)
  db.prepare('UPDATE share_links SET last_used_at = ? WHERE id = ?').run(stamp, link.id)
  return { token, expiresAt, grantId, permission: link.permission }
}

export function accessForShareGrant(boardId: string, grantToken?: string | null): AccessResult | null {
  if (!grantToken) return null
  const board = getBoard(boardId)
  if (!board) return null
  const row = db.prepare(`
    SELECT sg.id, sg.permission
    FROM share_grants sg JOIN share_links sl ON sl.id = sg.share_link_id
    WHERE sg.board_id = ? AND sg.token_hash = ? AND sg.expires_at > ?
      AND sl.revoked_at IS NULL AND (sl.expires_at IS NULL OR sl.expires_at > ?)
  `).get(boardId, hashToken(grantToken), nowIso(), nowIso()) as { id: string; permission: 'editor' | 'viewer' } | undefined
  if (!row) return null
  db.prepare('UPDATE share_grants SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id)
  return { board, role: row.permission, user: null, shareGrantId: row.id }
}

export function accessFor(boardId: string, sessionToken?: string | null, grantToken?: string | null): AccessResult | null {
  return accessForSession(boardId, sessionToken) ?? accessForShareGrant(boardId, grantToken)
}

export function validateRealtimeSource(input: { boardId: string; userId?: string; sessionId?: string; shareGrantId?: string }): Role | null {
  const board = getBoard(input.boardId)
  if (!board) return null
  if (input.sessionId && input.userId && validSessionId(input.sessionId, input.userId)) {
    if (board.ownerId === input.userId) return 'owner'
    const membership = db.prepare('SELECT role FROM board_memberships WHERE board_id = ? AND user_id = ?').get(input.boardId, input.userId) as { role: 'editor' | 'viewer' } | undefined
    return membership?.role ?? null
  }
  if (input.shareGrantId) {
    const grant = db.prepare(`SELECT sg.permission FROM share_grants sg JOIN share_links sl ON sl.id = sg.share_link_id WHERE sg.id = ? AND sg.board_id = ? AND sg.expires_at > ? AND sl.revoked_at IS NULL AND (sl.expires_at IS NULL OR sl.expires_at > ?)`)
      .get(input.shareGrantId, input.boardId, nowIso(), nowIso()) as { permission: 'editor' | 'viewer' } | undefined
    return grant?.permission ?? null
  }
  return null
}

export function listSharing(boardId: string) {
  const members = db.prepare(`SELECT u.id, u.username, u.email, bm.role, bm.created_at AS createdAt FROM board_memberships bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = ? ORDER BY u.username`).all(boardId)
  const links = db.prepare(`SELECT id, permission, created_at AS createdAt, expires_at AS expiresAt, last_used_at AS lastUsedAt FROM share_links WHERE board_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`).all(boardId)
  return { members, links }
}

export function addMember(boardId: string, username: string, role: 'editor' | 'viewer', invitedBy: string) {
  const user = db.prepare('SELECT id, username, email FROM users WHERE username = ? COLLATE NOCASE AND disabled_at IS NULL').get(normalizeUsername(username)) as PublicUser | undefined
  if (!user) return null
  const board = getBoard(boardId)
  if (!board || board.ownerId === user.id) return { ...user, role: 'owner' as const }
  const existing = db.prepare('SELECT 1 AS found FROM board_memberships WHERE board_id = ? AND user_id = ?').get(boardId, user.id) as { found: number } | undefined
  if (!existing) {
    const count = db.prepare('SELECT COUNT(*) AS total FROM board_memberships WHERE board_id = ?').get(boardId) as { total: number }
    if (count.total >= config.maxMembersPerBoard) throw new Error('Quota de membres atteint pour ce tableau.')
  }
  db.prepare(`INSERT INTO board_memberships (board_id, user_id, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role, invited_by = excluded.invited_by`).run(boardId, user.id, role, invitedBy, nowIso())
  return { ...user, role }
}
export function removeMember(boardId: string, userId: string) { db.prepare('DELETE FROM board_memberships WHERE board_id = ? AND user_id = ?').run(boardId, userId) }

export function createShareLink(boardId: string, permission: 'editor' | 'viewer', createdBy: string, expiresAt?: string | null) {
  const count = db.prepare(`SELECT COUNT(*) AS total FROM share_links WHERE board_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).get(boardId, nowIso()) as { total: number }
  if (count.total >= config.maxActiveShareLinksPerBoard) throw new Error('Quota de liens de partage actifs atteint.')
  const token = randomBytes(32).toString('base64url')
  const id = randomUUID()
  const createdAt = nowIso()
  db.prepare(`INSERT INTO share_links (id, board_id, token_hash, permission, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, boardId, hashToken(token), permission, createdBy, createdAt, expiresAt ?? null)
  return { id, token, permission, createdAt, expiresAt: expiresAt ?? null }
}
export function revokeShareLink(boardId: string, linkId: string) {
  const stamp = nowIso()
  db.prepare('UPDATE share_links SET revoked_at = ? WHERE id = ? AND board_id = ?').run(stamp, linkId, boardId)
  db.prepare('DELETE FROM share_grants WHERE share_link_id = ?').run(linkId)
}

export function mentionableUsernames(boardId: string, candidates: string[]): string[] {
  if (!candidates.length) return []
  const unique = [...new Set(candidates.map(value => value.toLocaleLowerCase('fr-FR')))].slice(0, 25)
  const placeholders = unique.map(() => '?').join(',')
  const rows = db.prepare(`SELECT DISTINCT u.username FROM users u JOIN boards b ON b.id = ? LEFT JOIN board_memberships bm ON bm.board_id = b.id AND bm.user_id = u.id WHERE lower(u.username) IN (${placeholders}) AND (u.id = b.owner_id OR bm.user_id IS NOT NULL)`).all(boardId, ...unique) as { username: string }[]
  return rows.map(row => row.username)
}
export function listMentionableUsers(boardId: string, requesterRole: Role, authenticated: boolean) {
  // Guests only need currently connected suggestions, supplied by awareness. Avoid leaking the full membership list.
  if (!authenticated) return []
  return db.prepare(`SELECT DISTINCT u.id, u.username FROM users u JOIN boards b ON b.id = ? LEFT JOIN board_memberships bm ON bm.board_id = b.id AND bm.user_id = u.id WHERE u.id = b.owner_id OR bm.user_id IS NOT NULL ORDER BY u.username`).all(boardId)
}

export function audit(eventType: string, input: { actorUserId?: string | null; boardId?: string | null; ipPrefix?: string | null; metadata?: unknown } = {}): void {
  db.prepare(`INSERT INTO audit_events (id, actor_user_id, board_id, event_type, ip_prefix, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), input.actorUserId ?? null, input.boardId ?? null, eventType, input.ipPrefix ?? null, JSON.stringify(input.metadata ?? {}), nowIso())
}
export function listAuditEvents(boardId: string, limit = 100) {
  return db.prepare(`SELECT id, actor_user_id AS actorUserId, event_type AS eventType, ip_prefix AS ipPrefix, metadata_json AS metadataJson, created_at AS createdAt FROM audit_events WHERE board_id = ? ORDER BY created_at DESC LIMIT ?`).all(boardId, Math.min(500, Math.max(1, limit)))
}

export function cleanupExpired(): void {
  const now = nowIso()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(now, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  db.prepare('DELETE FROM share_grants WHERE expires_at <= ?').run(now)
  db.prepare('DELETE FROM audit_events WHERE created_at < ?').run(new Date(Date.now() - config.auditRetentionDays * 24 * 60 * 60 * 1000).toISOString())
}

export function disableAndDeleteUser(userId: string): void {
  const stamp = nowIso()
  db.exec('BEGIN IMMEDIATE')
  try {
    // Boards owned by the account are soft-deleted first; memberships and sessions are removed.
    db.prepare('UPDATE boards SET deleted_at = ?, updated_at = ? WHERE owner_id = ?').run(stamp, stamp, userId)
    db.prepare('DELETE FROM board_memberships WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    db.prepare('UPDATE users SET disabled_at = ?, email = ?, username = ?, updated_at = ? WHERE id = ?')
      .run(stamp, `deleted-${userId}@invalid.local`, `deleted-${userId.slice(0, 8)}`, stamp, userId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
