export const API_URL = import.meta.env.VITE_API_URL ?? ''
export const WS_URL = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export type User = { id: string; email: string; username: string }
export type Role = 'owner' | 'editor' | 'viewer'
export type BoardSummary = { id: string; title: string; ownerId: string; ownerUsername: string; schemaVersion: number; createdAt: string; updatedAt: string; role: Role }
export type AssetSummary = {
  id: string; boardId: string; kind: 'image' | 'pdf' | 'pdf-page'; originalName: string; mime: string; sizeBytes: number
  width: number | null; height: number | null; pageNumber: number | null; sourceAssetId: string | null
  sourceDocumentId: string | null; sourceName: string | null; pageCount: number | null; dpi: number | null
  status: 'ready' | 'processing' | 'failed'; errorMessage: string | null; createdAt: string
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

let csrfToken: string | null = null
function cookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length))
  }
  return null
}
export async function ensureCsrf(): Promise<string> {
  csrfToken = csrfToken ?? cookie('spletch_csrf')
  if (csrfToken) return csrfToken
  const response = await fetch(`${API_URL}/api/auth/csrf`, { credentials: 'include' })
  if (!response.ok) throw new ApiError('Initialisation de sécurité impossible.', response.status)
  const body = await response.json() as { csrfToken: string }
  csrfToken = body.csrfToken
  return csrfToken
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', await ensureCsrf())
  const response = await fetch(`${API_URL}${path}`, { ...options, method, headers, credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new ApiError(body.error ?? 'Une erreur est survenue.', response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type UploadAssetOptions = {
  kind?: 'image' | 'pdf-page'
  sourceDocumentId?: string
  sourceName?: string
  pageNumber?: number
  pageCount?: number
  dpi?: number
  signal?: AbortSignal
}

export async function uploadAsset(boardId: string, file: Blob & { name?: string }, options: UploadAssetOptions = {}): Promise<AssetSummary> {
  const csrf = await ensureCsrf()
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-CSRF-Token': csrf,
    'X-File-Name': encodeURIComponent(file.name ?? 'image.webp'),
    'X-File-Type': file.type || 'application/octet-stream',
    'X-Asset-Kind': options.kind ?? 'image',
  }
  if (options.sourceDocumentId) headers['X-Source-Document-Id'] = options.sourceDocumentId
  if (options.sourceName) headers['X-Source-Name'] = encodeURIComponent(options.sourceName)
  if (options.pageNumber) headers['X-Page-Number'] = String(options.pageNumber)
  if (options.pageCount) headers['X-Page-Count'] = String(options.pageCount)
  if (options.dpi) headers['X-Pdf-Dpi'] = String(options.dpi)
  const response = await fetch(`${API_URL}/api/boards/${boardId}/assets`, {
    method: 'POST', credentials: 'include', body: file, headers, signal: options.signal,
  })
  const body = await response.json().catch(() => ({})) as { asset?: AssetSummary; error?: string }
  if (!response.ok || !body.asset) throw new ApiError(body.error ?? 'Import impossible.', response.status)
  return body.asset
}

export function assetUrl(boardId: string, assetId: string, variant: 'full' | 'display' | 'thumbnail' = 'full'): string {
  return `${API_URL}/api/boards/${boardId}/assets/${assetId}/file?variant=${variant}`
}

