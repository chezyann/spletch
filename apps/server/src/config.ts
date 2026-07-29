import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const dataDir = path.resolve(projectRoot, process.env.DATA_DIR ?? 'data')
export const assetDir = path.join(dataDir, 'assets')
fs.mkdirSync(assetDir, { recursive: true })

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  apiPort: Number(process.env.API_PORT ?? 4000),
  wsPort: Number(process.env.WS_PORT ?? 4001),
  webOrigins: (process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',').map(value => value.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  secret: process.env.APP_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'development-only-change-me-please-32-bytes'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
  shareGrantHours: Number(process.env.SHARE_GRANT_HOURS ?? 12),
  realtimeTicketSeconds: Number(process.env.REALTIME_TICKET_SECONDS ?? 90),
  maxDocumentBytes: Number(process.env.MAX_DOCUMENT_BYTES ?? 10 * 1024 * 1024),
  maxElementsPerBoard: Number(process.env.MAX_ELEMENTS_PER_BOARD ?? 10000),
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES ?? 12 * 1024 * 1024),
  maxImagePixels: Number(process.env.MAX_IMAGE_PIXELS ?? 50_000_000),
  maxClientPdfPages: Number(process.env.MAX_CLIENT_PDF_PAGES ?? 30),
  maxClientPdfDpi: Number(process.env.MAX_CLIENT_PDF_DPI ?? 300),
  maxAssetBytesPerBoard: Number(process.env.MAX_ASSET_BYTES_PER_BOARD ?? 500 * 1024 * 1024),
  maxBoardsPerUser: Number(process.env.MAX_BOARDS_PER_USER ?? 100),
  maxMembersPerBoard: Number(process.env.MAX_MEMBERS_PER_BOARD ?? 250),
  maxActiveShareLinksPerBoard: Number(process.env.MAX_ACTIVE_SHARE_LINKS_PER_BOARD ?? 20),
  maxActiveSessionsPerUser: Number(process.env.MAX_ACTIVE_SESSIONS_PER_USER ?? 20),
  maxRealtimeConnectionsPerSource: Number(process.env.MAX_REALTIME_CONNECTIONS_PER_SOURCE ?? 12),
  maxRealtimeConnectionsPerBoard: Number(process.env.MAX_REALTIME_CONNECTIONS_PER_BOARD ?? 250),
  maxRealtimeConnectionsTotal: Number(process.env.MAX_REALTIME_CONNECTIONS_TOTAL ?? 2000),
  auditRetentionDays: Number(process.env.AUDIT_RETENTION_DAYS ?? 365),
  deletedBoardRetentionDays: Number(process.env.DELETED_BOARD_RETENTION_DAYS ?? 30),
  instanceName: process.env.INSTANCE_NAME ?? `spletch-${process.pid}`,
  redisHost: process.env.REDIS_HOST?.trim() || '',
  redisPort: Number(process.env.REDIS_PORT ?? 6379),
}

if (!config.secret || config.secret.length < 32) {
  throw new Error('APP_SECRET doit contenir au moins 32 caractères.')
}
