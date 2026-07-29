import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { config, projectRoot } from './config.js'
import {
  accessFor, addMember, audit, authenticateUser, cleanupExpired, createBoard, createSession, createShareLink, createUser,
  disableAndDeleteUser, exchangeShareLink, getBoard, listAuditEvents, listBoards, listMentionableUsers, listSessions,
  listSharing, removeMember, revokeAllSessions, revokeSession, revokeSessionByToken, revokeShareLink, softDeleteBoard,
  updateBoardTitle,
} from './db.js'
import { realtimeServer } from './realtime.js'
import { attachSecurityContext, requireAuth, requireCsrf, type AuthenticatedRequest } from './middleware/security.js'
import { apiLimiter, authLimiter, sensitiveLimiter, uploadLimiter } from './middleware/rate-limits.js'
import { requireBoardEditor, requireBoardOwner, resolveBoardAccess, type BoardAccessRequest } from './middleware/board-access.js'
import { clearSessionCookie, ensureCsrfCookie, parseCookies, SESSION_COOKIE, setSessionCookie, setShareGrantCookie, shareCookieName } from './security/cookies.js'
import { issueRealtimeTicket } from './security/tickets.js'
import { normalizeDisplayName } from './security/normalize.js'
import { cleanupCredentialAttempts, clearCredentialFailures, credentialAttemptAllowed, credentialIdentifier, recordCredentialFailure } from './security/credentialAttempts.js'
import { assetAbsolutePath, getAsset, listAssets, purgeDeletedBoards, storeUploadedAsset } from './assets/service.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', config.trustProxy)
app.use((request, response, next) => {
  const supplied = request.get('x-request-id')
  const requestId = supplied && /^[a-zA-Z0-9._:-]{1,80}$/.test(supplied) ? supplied : randomUUID()
  response.setHeader('X-Request-Id', requestId)
  response.locals.requestId = requestId
  next()
})

const wsOrigins = config.webOrigins.map(origin => origin.replace(/^http/, 'ws'))
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", ...config.webOrigins, ...wsOrigins],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  hsts: config.env === 'production' ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
}))
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || config.webOrigins.includes(origin)) callback(null, true)
    else callback(new Error('Origine CORS refusée.'))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-File-Name', 'X-File-Type', 'X-Asset-Kind', 'X-Source-Document-Id', 'X-Source-Name', 'X-Page-Number', 'X-Page-Count', 'X-Pdf-Dpi'],
}))
app.use(apiLimiter)
app.use(express.json({ limit: '256kb', type: ['application/json', 'application/*+json'] }))
app.use(attachSecurityContext)
app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/api', requireCsrf)

const credentialsSchema = z.object({
  email: z.email().max(200),
  username: z.string().min(2).max(30),
  password: z.string().min(12).max(200),
})
const loginSchema = z.object({ login: z.string().min(1).max(200), password: z.string().min(1).max(200) })
const titleSchema = z.object({ title: z.string().min(1).max(120) })

app.get('/api/health', (_request, response) => response.json({ ok: true, version: '0.5.1' }))
app.get('/api/auth/csrf', (request, response) => response.json({ csrfToken: ensureCsrfCookie(request, response) }))

app.post('/api/auth/register', authLimiter, async (request: AuthenticatedRequest, response) => {
  const parsed = credentialsSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Informations de compte invalides. Le mot de passe doit contenir au moins 12 caractères.' })
  try {
    const user = await createUser(parsed.data.email, parsed.data.username, parsed.data.password)
    if (request.sessionToken) revokeSessionByToken(request.sessionToken)
    const session = createSession(user.id, { userAgent: request.get('user-agent'), ipPrefix: request.ipPrefix })
    setSessionCookie(response, session.token, session.expiresAt)
    audit('auth.register', { actorUserId: user.id, ipPrefix: request.ipPrefix })
    return response.status(201).json({ user })
  } catch (error) {
    const message = error instanceof Error && /UNIQUE/.test(error.message) ? 'Cet email ou ce nom d’utilisateur est déjà utilisé.' : 'Impossible de créer le compte.'
    return response.status(409).json({ error: message })
  }
})

app.post('/api/auth/login', authLimiter, async (request: AuthenticatedRequest, response) => {
  const parsed = loginSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Identifiants invalides.' })
  if (!credentialAttemptAllowed(parsed.data.login, request.ipPrefix)) {
    audit('auth.login_throttled', { ipPrefix: request.ipPrefix, metadata: { loginId: credentialIdentifier(parsed.data.login) } })
    return response.status(429).json({ error: 'Trop de tentatives pour ce compte. Réessayez plus tard.' })
  }
  const user = await authenticateUser(parsed.data.login, parsed.data.password)
  if (!user) {
    recordCredentialFailure(parsed.data.login, request.ipPrefix)
    audit('auth.login_failed', { ipPrefix: request.ipPrefix, metadata: { loginId: credentialIdentifier(parsed.data.login) } })
    return response.status(401).json({ error: 'Identifiants incorrects.' })
  }
  clearCredentialFailures(parsed.data.login, request.ipPrefix)
  if (request.sessionToken) revokeSessionByToken(request.sessionToken)
  const session = createSession(user.id, { userAgent: request.get('user-agent'), ipPrefix: request.ipPrefix })
  setSessionCookie(response, session.token, session.expiresAt)
  audit('auth.login', { actorUserId: user.id, ipPrefix: request.ipPrefix })
  return response.json({ user })
})

app.post('/api/auth/logout', requireAuth, (request: AuthenticatedRequest, response) => {
  if (request.sessionToken) revokeSessionByToken(request.sessionToken)
  clearSessionCookie(response)
  audit('auth.logout', { actorUserId: request.user!.id, ipPrefix: request.ipPrefix })
  response.status(204).end()
})
app.get('/api/me', requireAuth, (request: AuthenticatedRequest, response) => response.json({ user: request.user, sessionId: request.sessionId }))
app.get('/api/auth/sessions', requireAuth, (request: AuthenticatedRequest, response) => response.json({ sessions: listSessions(request.user!.id), currentSessionId: request.sessionId }))
app.delete('/api/auth/sessions/:sessionId', requireAuth, sensitiveLimiter, (request: AuthenticatedRequest, response) => {
  revokeSession(request.params.sessionId, request.user!.id)
  audit('auth.session_revoked', { actorUserId: request.user!.id, ipPrefix: request.ipPrefix, metadata: { sessionId: request.params.sessionId } })
  response.status(204).end()
})
app.post('/api/auth/revoke-others', requireAuth, sensitiveLimiter, (request: AuthenticatedRequest, response) => {
  revokeAllSessions(request.user!.id, request.sessionId)
  audit('auth.other_sessions_revoked', { actorUserId: request.user!.id, ipPrefix: request.ipPrefix })
  response.status(204).end()
})
app.delete('/api/account', requireAuth, sensitiveLimiter, (request: AuthenticatedRequest, response) => {
  const parsed = z.object({ confirmation: z.literal('SUPPRIMER') }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Confirmation invalide.' })
  audit('account.deleted', { actorUserId: request.user!.id, ipPrefix: request.ipPrefix })
  disableAndDeleteUser(request.user!.id)
  clearSessionCookie(response)
  response.status(204).end()
})

app.get('/api/boards', requireAuth, (request: AuthenticatedRequest, response) => response.json({ boards: listBoards(request.user!.id) }))
app.post('/api/boards', requireAuth, (request: AuthenticatedRequest, response) => {
  const parsed = z.object({ title: z.string().max(120).optional() }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Titre invalide.' })
  const board = createBoard(request.user!.id, parsed.data.title ?? 'Nouveau tableau')
  audit('board.created', { actorUserId: request.user!.id, boardId: board.id, ipPrefix: request.ipPrefix })
  response.status(201).json({ board })
})

app.get('/api/boards/:boardId/access', (request: AuthenticatedRequest, response) => {
  const boardId = request.params.boardId
  const rawShare = typeof request.query.share === 'string' ? request.query.share : undefined
  const cookies = parseCookies(request)
  let grantToken = cookies[shareCookieName(boardId)]
  if (rawShare) {
    const grant = exchangeShareLink(boardId, rawShare)
    if (!grant) return response.status(403).json({ error: 'Ce lien est invalide, révoqué ou expiré.' })
    grantToken = grant.token
    setShareGrantCookie(response, boardId, grant.token, grant.expiresAt)
    audit('share.link_exchanged', { boardId, ipPrefix: request.ipPrefix })
  }
  const resolved = accessFor(boardId, cookies[SESSION_COOKIE], grantToken)
  if (!resolved) return response.status(403).json({ error: 'Ce tableau est privé ou votre accès a expiré.' })
  response.json({
    board: resolved.board,
    role: resolved.role,
    user: resolved.user,
    mentionableUsers: listMentionableUsers(resolved.board.id, resolved.role, Boolean(resolved.user)),
    shareTokenConsumed: Boolean(rawShare),
  })
})

app.patch('/api/boards/:boardId', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => {
  const parsed = titleSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Titre invalide.' })
  const board = updateBoardTitle(request.params.boardId, parsed.data.title)
  audit('board.renamed', { actorUserId: request.user!.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix })
  response.json({ board })
})
app.delete('/api/boards/:boardId', requireAuth, resolveBoardAccess, requireBoardOwner, sensitiveLimiter, (request: BoardAccessRequest, response) => {
  softDeleteBoard(request.params.boardId)
  audit('board.deleted', { actorUserId: request.user!.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix })
  response.status(204).end()
})

app.get('/api/boards/:boardId/sharing', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => response.json(listSharing(request.params.boardId)))
app.post('/api/boards/:boardId/members', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => {
  const parsed = z.object({ username: z.string().min(2).max(30), role: z.enum(['editor', 'viewer']) }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Invitation invalide.' })
  const member = addMember(request.params.boardId, parsed.data.username, parsed.data.role, request.user!.id)
  if (!member) return response.status(404).json({ error: 'Utilisateur introuvable.' })
  audit('sharing.member_upserted', { actorUserId: request.user!.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix, metadata: { userId: member.id, role: member.role } })
  response.status(201).json({ member })
})
app.delete('/api/boards/:boardId/members/:userId', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => {
  removeMember(request.params.boardId, request.params.userId)
  audit('sharing.member_removed', { actorUserId: request.user!.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix, metadata: { userId: request.params.userId } })
  response.status(204).end()
})
app.post('/api/boards/:boardId/share-links', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => {
  const parsed = z.object({ permission: z.enum(['editor', 'viewer']), expiresAt: z.iso.datetime().nullable().optional() }).safeParse(request.body)
  if (!parsed.success || (parsed.data.expiresAt && Date.parse(parsed.data.expiresAt) <= Date.now())) return response.status(400).json({ error: 'Permission ou expiration invalide.' })
  const link = createShareLink(request.params.boardId, parsed.data.permission, request.user!.id, parsed.data.expiresAt)
  audit('sharing.link_created', { actorUserId: request.user!.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix, metadata: { linkId: link.id, permission: link.permission, expiresAt: link.expiresAt } })
  response.status(201).json({ link })
})
app.delete('/api/boards/:boardId/share-links/:linkId', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => {
  revokeShareLink(request.params.boardId, request.params.linkId)
  audit('sharing.link_revoked', { actorUserId: request.user!.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix, metadata: { linkId: request.params.linkId } })
  response.status(204).end()
})
app.get('/api/boards/:boardId/audit', requireAuth, resolveBoardAccess, requireBoardOwner, (request: BoardAccessRequest, response) => response.json({ events: listAuditEvents(request.params.boardId, Number(request.query.limit ?? 100)) }))

app.post('/api/boards/:boardId/realtime-ticket', resolveBoardAccess, (request: BoardAccessRequest, response) => {
  const access = request.boardAccess!
  let username: string
  let guest = false
  if (access.user) username = access.user.username
  else {
    guest = true
    const suppliedName = String(request.body?.guestName ?? '').trim()
    if (!suppliedName) username = 'Visiteur'
    else try { username = normalizeDisplayName(suppliedName) } catch (error) { return response.status(400).json({ error: error instanceof Error ? error.message : 'Pseudonyme invalide.' }) }
  }
  const ticket = issueRealtimeTicket({
    boardId: access.board.id,
    role: access.role,
    sessionId: access.sessionId,
    shareGrantId: access.shareGrantId,
    userId: access.user?.id,
    username,
    guest,
  })
  response.json({ ticket, expiresIn: config.realtimeTicketSeconds })
})

function decodedHeader(request: express.Request, name: string, fallback: string): string {
  const value = request.get(name)
  if (!value) return fallback
  try { return decodeURIComponent(value) } catch { return fallback }
}

let activeUploads = 0
function uploadConcurrency(request: express.Request, response: express.Response, next: express.NextFunction): void {
  if (activeUploads >= 4) { response.status(503).json({ error: 'Trop d’imports simultanés. Réessayez dans un instant.' }); return }
  activeUploads++
  let released = false
  const release = () => { if (!released) { released = true; activeUploads = Math.max(0, activeUploads - 1) } }
  response.once('finish', release); response.once('close', release)
  next()
}

app.get('/api/boards/:boardId/assets', resolveBoardAccess, (request: BoardAccessRequest, response) => response.json({ assets: listAssets(request.params.boardId) }))
app.post('/api/boards/:boardId/assets', uploadLimiter, uploadConcurrency, resolveBoardAccess, requireBoardEditor,
  express.raw({ type: 'application/octet-stream', limit: config.maxImageBytes }),
  async (request: BoardAccessRequest, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body) || !request.body.length) return response.status(400).json({ error: 'Fichier vide.' })
      const asset = await storeUploadedAsset({
        boardId: request.params.boardId,
        userId: request.boardAccess?.user?.id,
        filename: decodedHeader(request, 'x-file-name', 'fichier'),
        contentType: request.get('x-file-type') ?? 'application/octet-stream',
        buffer: request.body,
        metadata: {
          kind: request.get('x-asset-kind') === 'pdf-page' ? 'pdf-page' : 'image',
          sourceDocumentId: request.get('x-source-document-id') ?? undefined,
          sourceName: request.get('x-source-name') ? decodedHeader(request, 'x-source-name', 'document.pdf') : undefined,
          pageNumber: request.get('x-page-number') ? Number(request.get('x-page-number')) : undefined,
          pageCount: request.get('x-page-count') ? Number(request.get('x-page-count')) : undefined,
          dpi: request.get('x-pdf-dpi') ? Number(request.get('x-pdf-dpi')) : undefined,
        },
      })
      audit('asset.uploaded', { actorUserId: request.boardAccess?.user?.id, boardId: request.params.boardId, ipPrefix: request.ipPrefix, metadata: { assetId: asset.id, kind: asset.kind, size: asset.sizeBytes } })
      response.status(201).json({ asset })
    } catch (error) { next(error) }
  })
app.get('/api/boards/:boardId/assets/:assetId/file', resolveBoardAccess, (request: BoardAccessRequest, response) => {
  const asset = getAsset(request.params.assetId)
  if (!asset || asset.boardId !== request.params.boardId || asset.status !== 'ready' || asset.kind === 'pdf') return response.status(404).json({ error: 'Asset introuvable.' })
  const requestedVariant = request.query.variant
  const variant = requestedVariant === 'thumbnail' || requestedVariant === 'display' ? requestedVariant : 'full'
  response.setHeader('Content-Type', asset.mime)
  response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`)
  response.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  response.sendFile(assetAbsolutePath(asset, variant))
})

const webDist = path.resolve(projectRoot, 'apps/web/dist')
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { immutable: true, maxAge: '1y', index: false }))
  app.use((_request, response) => {
    response.setHeader('Cache-Control', 'no-cache')
    response.sendFile(path.join(webDist, 'index.html'))
  })
}

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const requestId = String(response.locals.requestId ?? 'unknown')
  console.error(JSON.stringify({ level: 'error', requestId, method: request.method, path: request.path, error: error instanceof Error ? error.message : String(error) }))
  const safeClientError = error instanceof Error && /trop|quota|volumineux|dimensions|type|format|fichier|pdf|image|page|résolution|stockage|pseudonyme/i.test(error.message)
  const status = safeClientError ? 400 : 500
  const message = safeClientError || config.env !== 'production' ? (error instanceof Error ? error.message : 'Erreur interne.') : 'Erreur interne.'
  response.status(status).json({ error: message, requestId })
})

const httpServer = app.listen(config.apiPort, () => console.log(`API disponible sur http://localhost:${config.apiPort}`))
realtimeServer.listen()
const cleanupTimer = setInterval(() => { cleanupExpired(); cleanupCredentialAttempts(); void purgeDeletedBoards(config.deletedBoardRetentionDays).catch(console.error) }, 60 * 60 * 1000)
cleanupTimer.unref()

async function shutdown() {
  clearInterval(cleanupTimer)
  httpServer.close()
  await realtimeServer.destroy()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
