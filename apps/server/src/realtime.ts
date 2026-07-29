import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { Redis } from '@hocuspocus/extension-redis'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { config } from './config.js'
import { db, listMentionableUsers, mentionableUsernames, validateRealtimeSource, type Role } from './db.js'
import { normalizeDisplayName } from './security/normalize.js'
import { verifyRealtimeTicket, type RealtimeTicket } from './security/tickets.js'

export type RealtimeIdentity = { id: string; type: 'user' | 'guest'; username: string; color: string }
type RealtimeContext = {
  boardId: string
  role: Role
  identity: RealtimeIdentity
  ticket: RealtimeTicket
  rateKey: string
  authenticated: boolean
}
type Reaction = { emoji: string; participantIds: string[]; participantNames: string[] }
type ChatMessage = { id: string; markdown: string; author: RealtimeIdentity; createdAt: number; mentions: string[]; reactions: Reaction[] }
type ChatRoom = { messages: ChatMessage[]; lastActivity: number }

const chatRooms = new Map<string, ChatRoom>()
const rateLimits = new Map<string, number[]>()
const connectionsBySource = new Map<string, number>()
const connectionsByBoard = new Map<string, number>()
let totalConnections = 0
const lastDocumentValidation = new WeakMap<Y.Doc, number>()
const palette = ['#7c3aed', '#0f766e', '#c2410c', '#0369a1', '#be123c', '#4d7c0f', '#6d28d9']
const colorFor = (value: string) => palette[Math.abs([...value].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % palette.length]
const documentBoardId = (documentName: string) => documentName.startsWith('board.') ? documentName.slice(6) : ''

function rateAllowed(key: string, limit: number, windowMs: number): boolean {
  const cutoff = Date.now() - windowMs
  const recent = (rateLimits.get(key) ?? []).filter(stamp => stamp > cutoff)
  if (recent.length >= limit) return false
  recent.push(Date.now())
  rateLimits.set(key, recent)
  return true
}
function roomFor(documentName: string) {
  const room = chatRooms.get(documentName) ?? { messages: [], lastActivity: Date.now() }
  room.lastActivity = Date.now()
  chatRooms.set(documentName, room)
  return room
}
function safeEmoji(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const emoji = value.normalize('NFKC').trim().slice(0, 16)
  return emoji && !/[<>\u0000-\u001f]/u.test(emoji) ? emoji : null
}
function verifiedRole(context: RealtimeContext): Role | null {
  return validateRealtimeSource({
    boardId: context.boardId,
    userId: context.ticket.userId,
    sessionId: context.ticket.sessionId,
    shareGrantId: context.ticket.shareGrantId,
  })
}
function assertAllowedOrigin(origin: string | null): void {
  if (!origin || !config.webOrigins.includes(origin)) throw new Error('Origine WebSocket refusée.')
}
function contextFromToken(documentName: string, token: string): RealtimeContext {
  const boardId = documentBoardId(documentName)
  const ticket = verifyRealtimeTicket(token)
  if (!boardId || !ticket || ticket.boardId !== boardId) throw new Error('Jeton temps réel invalide ou expiré.')
  const role = validateRealtimeSource({ boardId, userId: ticket.userId, sessionId: ticket.sessionId, shareGrantId: ticket.shareGrantId })
  if (!role) throw new Error('Accès révoqué.')
  const username = ticket.guest ? normalizeDisplayName(ticket.username) : ticket.username
  const sourceId = ticket.sessionId ?? ticket.shareGrantId ?? ticket.jti
  const identity: RealtimeIdentity = {
    id: ticket.userId ?? `guest:${ticket.shareGrantId ?? ticket.jti}`, 
    type: ticket.guest ? 'guest' : 'user',
    username,
    color: colorFor(ticket.userId ?? ticket.shareGrantId ?? ticket.jti),
  }
  return { boardId, role, identity, ticket, rateKey: sourceId, authenticated: !ticket.guest }
}


function validateBoardState(doc: Y.Doc): void {
  const elements = doc.getMap<unknown>('elements')
  if (elements.size > config.maxElementsPerBoard) throw new Error('Nombre maximal d’objets dépassé.')
  for (const value of elements.values()) {
    if (!value || typeof value !== 'object') throw new Error('Objet de tableau invalide.')
    const element = value as Record<string, unknown>
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'opacity']) {
      const current = element[key]
      if (current !== undefined && (typeof current !== 'number' || !Number.isFinite(current))) throw new Error(`Propriété ${key} invalide.`)
    }
    if (Math.abs(Number(element.x ?? 0)) > 10_000_000 || Math.abs(Number(element.y ?? 0)) > 10_000_000) throw new Error('Coordonnées hors limites.')
    if (Number(element.width ?? 0) > 50_000 || Number(element.height ?? 0) > 50_000) throw new Error('Dimensions hors limites.')
    if (Array.isArray(element.points) && element.points.length > 20_000) throw new Error('Tracé trop complexe.')
    if (typeof element.richTextField === 'string' && !/^text\.[a-zA-Z0-9_-]{1,80}$/.test(element.richTextField)) throw new Error('Référence de texte invalide.')
  }
}

export const realtimeServer = new Server<RealtimeContext>({
  name: config.instanceName,
  port: config.wsPort,
  debounce: 1200,
  maxDebounce: 6000,
  quiet: true,
  websocketOptions: { maxPayload: 256 * 1024 },
  extensions: [
    ...(config.redisHost ? [new Redis({ host: config.redisHost, port: config.redisPort, awaitInitialSyncTimeout: 1500 })] : []),
    new Database({
    fetch: async ({ documentName }) => {
      const row = db.prepare('SELECT data FROM documents WHERE name = ?').get(documentName) as { data: Uint8Array } | undefined
      return row?.data ? new Uint8Array(row.data) : null
    },
    store: async ({ documentName, state }) => {
      if (state.byteLength > config.maxDocumentBytes) throw new Error('Quota du document dépassé.')
      const boardId = documentBoardId(documentName)
      const doc = new Y.Doc()
      Y.applyUpdate(doc, state)
      validateBoardState(doc)
      const compacted = Y.encodeStateAsUpdate(doc)
      if (compacted.byteLength > config.maxDocumentBytes) throw new Error('Quota du document dépassé après compaction.')
      db.prepare(`INSERT INTO documents (name, board_id, data, size_bytes, schema_version, updated_at) VALUES (?, ?, ?, ?, 3, ?) ON CONFLICT(name) DO UPDATE SET board_id = excluded.board_id, data = excluded.data, size_bytes = excluded.size_bytes, schema_version = 3, updated_at = excluded.updated_at`)
        .run(documentName, boardId, compacted, compacted.byteLength, new Date().toISOString())
      db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), boardId)
      doc.destroy()
    },
    }),
  ],

  async onUpgrade({ request }) {
    assertAllowedOrigin(typeof request.headers.origin === 'string' ? request.headers.origin : null)
  },

  async onAuthenticate({ documentName, token, connectionConfig, requestHeaders }) {
    assertAllowedOrigin(requestHeaders.get('origin'))
    const context = contextFromToken(documentName, token)
    const sourceConnections = connectionsBySource.get(context.rateKey) ?? 0
    const boardConnections = connectionsByBoard.get(context.boardId) ?? 0
    if (sourceConnections >= config.maxRealtimeConnectionsPerSource || boardConnections >= config.maxRealtimeConnectionsPerBoard || totalConnections >= config.maxRealtimeConnectionsTotal) {
      throw new Error('Trop de connexions simultanées.')
    }
    connectionsBySource.set(context.rateKey, sourceConnections + 1)
    connectionsByBoard.set(context.boardId, boardConnections + 1)
    totalConnections++
    connectionConfig.readOnly = context.role === 'viewer'
    return context
  },

  async onTokenSync({ documentName, token, context, connection }) {
    const renewed = contextFromToken(documentName, token)
    if (renewed.rateKey !== context.rateKey) throw new Error('La source du jeton a changé.')
    connection.readOnly = renewed.role === 'viewer'
    return renewed
  },

  async beforeHandleMessage({ context, connection, update }) {
    const role = verifiedRole(context)
    if (!role) throw new Error('Accès révoqué ou session expirée.')
    context.role = role
    connection.readOnly = role === 'viewer'
    if (update.byteLength > 256 * 1024) throw new Error('Mise à jour temps réel trop volumineuse.')
    if (!rateAllowed(`sync:${context.rateKey}`, 240, 10_000)) throw new Error('Trop de mises à jour temps réel.')
  },

  async afterHandleMessage({ document }) {
    const now = Date.now()
    if ((lastDocumentValidation.get(document) ?? 0) > now - 1000) return
    lastDocumentValidation.set(document, now)
    validateBoardState(document)
    if (Y.encodeStateAsUpdate(document).byteLength > config.maxDocumentBytes) throw new Error('Quota du document dépassé.')
  },

  async beforeHandleAwareness({ states, context }) {
    for (const state of states.values()) {
      state.user = context?.identity ?? null
      state.role = context?.role ?? 'viewer'
      if (state.cursor && (typeof state.cursor.x !== 'number' || typeof state.cursor.y !== 'number')) state.cursor = null
      if (Array.isArray(state.selectedIds)) state.selectedIds = state.selectedIds.filter((value: unknown) => typeof value === 'string').slice(0, 100)
    }
  },

  async onStateless({ payload, document, documentName, connection }) {
    const context = connection.context as RealtimeContext
    const role = verifiedRole(context)
    if (!role) throw new Error('Accès révoqué.')
    context.role = role
    let event: Record<string, unknown>
    try { event = JSON.parse(payload) as Record<string, unknown> } catch { return }
    const room = roomFor(documentName)

    if (event.type === 'chat:history') {
      if (!rateAllowed(`history:${context.rateKey}`, 10, 60_000)) return
      connection.sendStateless(JSON.stringify({
        type: 'chat:history',
        messages: room.messages,
        mentionableUsers: listMentionableUsers(context.boardId, context.role, context.authenticated),
      }))
      return
    }
    if (event.type === 'chat:message') {
      if (!rateAllowed(`chat:${context.rateKey}`, 12, 10_000)) {
        connection.sendStateless(JSON.stringify({ type: 'chat:error', message: 'Trop de messages envoyés.' }))
        return
      }
      if (context.identity.type === 'guest' && context.identity.username === 'Visiteur') {
        connection.sendStateless(JSON.stringify({ type: 'chat:error', message: 'Choisissez un pseudonyme pour participer au chat.' }))
        return
      }
      const markdown = typeof event.markdown === 'string' ? event.markdown.normalize('NFKC').trim().slice(0, 4000) : ''
      if (!markdown) return
      const candidates = [...markdown.matchAll(/(^|\s)@([\p{L}\p{N}_-]{2,30})/gu)].map(match => match[2])
      const message: ChatMessage = {
        id: randomUUID(), markdown, author: context.identity, createdAt: Date.now(),
        mentions: mentionableUsernames(context.boardId, candidates), reactions: [],
      }
      room.messages.push(message)
      if (room.messages.length > 150) room.messages.splice(0, room.messages.length - 150)
      document.broadcastStateless(JSON.stringify({ type: 'chat:message', message }))
      return
    }
    if (event.type === 'chat:reaction') {
      if (!rateAllowed(`reaction:${context.rateKey}`, 30, 10_000)) return
      const messageId = typeof event.messageId === 'string' ? event.messageId : ''
      const emoji = safeEmoji(event.emoji)
      const message = room.messages.find(item => item.id === messageId)
      if (!message || !emoji) return
      let reaction = message.reactions.find(item => item.emoji === emoji)
      if (!reaction) { reaction = { emoji, participantIds: [], participantNames: [] }; message.reactions.push(reaction) }
      const index = reaction.participantIds.indexOf(context.identity.id)
      if (index >= 0) { reaction.participantIds.splice(index, 1); reaction.participantNames.splice(index, 1) }
      else { reaction.participantIds.push(context.identity.id); reaction.participantNames.push(context.identity.username) }
      message.reactions = message.reactions.filter(item => item.participantIds.length > 0)
      document.broadcastStateless(JSON.stringify({ type: 'chat:reaction', messageId, reactions: message.reactions }))
    }
  },

  async onDisconnect({ context }) {
    if (!context?.rateKey) return
    const nextSource = Math.max(0, (connectionsBySource.get(context.rateKey) ?? 1) - 1)
    if (nextSource) connectionsBySource.set(context.rateKey, nextSource)
    else connectionsBySource.delete(context.rateKey)
    const nextBoard = Math.max(0, (connectionsByBoard.get(context.boardId) ?? 1) - 1)
    if (nextBoard) connectionsByBoard.set(context.boardId, nextBoard)
    else connectionsByBoard.delete(context.boardId)
    totalConnections = Math.max(0, totalConnections - 1)
  },
})

setInterval(() => {
  const chatCutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [name, room] of chatRooms) if (room.lastActivity < chatCutoff) chatRooms.delete(name)
  const rateCutoff = Date.now() - 60_000
  for (const [key, stamps] of rateLimits) {
    const current = stamps.filter(stamp => stamp > rateCutoff)
    if (current.length) rateLimits.set(key, current); else rateLimits.delete(key)
  }
}, 60_000).unref()
