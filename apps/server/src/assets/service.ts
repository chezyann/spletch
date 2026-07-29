import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { assetDir, config } from '../config.js'
import { db } from '../db.js'
import { safeFilename } from '../security/normalize.js'

export type AssetRecord = {
  id: string
  boardId: string
  uploadedBy: string | null
  kind: 'image' | 'pdf' | 'pdf-page'
  originalName: string
  mime: string
  storagePath: string
  sizeBytes: number
  width: number | null
  height: number | null
  pageNumber: number | null
  sourceAssetId: string | null
  sourceDocumentId: string | null
  sourceName: string | null
  pageCount: number | null
  dpi: number | null
  status: 'ready' | 'processing' | 'failed'
  errorMessage: string | null
  createdAt: string
}

type UploadMetadata = {
  kind?: 'image' | 'pdf-page'
  sourceDocumentId?: string
  sourceName?: string
  pageNumber?: number
  pageCount?: number
  dpi?: number
}

type ValidatedUploadMetadata =
  | { kind: 'image' }
  | {
      kind: 'pdf-page'
      sourceDocumentId: string
      sourceName: string
      pageNumber: number
      pageCount: number
      dpi: number
    }

const ASSET_COLUMNS = `
  id,
  board_id AS boardId,
  uploaded_by AS uploadedBy,
  kind,
  original_name AS originalName,
  mime,
  storage_path AS storagePath,
  size_bytes AS sizeBytes,
  width,
  height,
  page_number AS pageNumber,
  source_asset_id AS sourceAssetId,
  source_document_id AS sourceDocumentId,
  source_name AS sourceName,
  page_count AS pageCount,
  dpi,
  status,
  error_message AS errorMessage,
  created_at AS createdAt
`

function relativeStorage(boardId: string, id: string, variant: 'full' | 'display' | 'thumbnail' = 'full'): string {
  const suffix = variant === 'full' ? '' : `.${variant}`
  return path.join(boardId, `${id}${suffix}.webp`)
}
function absoluteStorage(relative: string): string {
  const safe = path.resolve(assetDir, relative)
  if (!safe.startsWith(path.resolve(assetDir) + path.sep)) throw new Error('Chemin d’asset invalide.')
  return safe
}
function finiteInteger(value: number | undefined, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.max(min, Math.min(max, Math.round(value!)))
}
function validateUploadMetadata(metadata: UploadMetadata): ValidatedUploadMetadata {
  const kind = metadata.kind ?? 'image'
  if (kind === 'image') return { kind }
  const sourceDocumentId = metadata.sourceDocumentId?.trim()
  if (!sourceDocumentId || !/^[a-zA-Z0-9_-]{8,100}$/.test(sourceDocumentId)) throw new Error('Identifiant de document PDF invalide.')
  const pageNumber = finiteInteger(metadata.pageNumber, 1, config.maxClientPdfPages)
  const pageCount = finiteInteger(metadata.pageCount, 1, 10_000)
  const dpi = finiteInteger(metadata.dpi, 72, config.maxClientPdfDpi)
  if (!pageNumber || !pageCount || pageNumber > pageCount || !dpi) throw new Error('Métadonnées de page PDF invalides.')
  return {
    kind,
    sourceDocumentId,
    sourceName: safeFilename(metadata.sourceName ?? 'document.pdf'),
    pageNumber,
    pageCount,
    dpi,
  }
}

export function getAsset(assetId: string): AssetRecord | undefined {
  return db.prepare(`SELECT ${ASSET_COLUMNS} FROM assets WHERE id = ?`).get(assetId) as AssetRecord | undefined
}
export function listAssets(boardId: string): AssetRecord[] {
  return db.prepare(`SELECT ${ASSET_COLUMNS} FROM assets WHERE board_id = ? ORDER BY created_at`).all(boardId) as AssetRecord[]
}

export async function storeUploadedAsset(input: {
  boardId: string
  userId?: string | null
  filename: string
  contentType: string
  buffer: Buffer
  metadata?: UploadMetadata
}): Promise<AssetRecord> {
  if (!input.buffer.length) throw new Error('Fichier vide.')
  if (input.buffer.length > config.maxImageBytes) throw new Error(`Fichier trop volumineux (${Math.round(config.maxImageBytes / 1024 / 1024)} Mo maximum).`)
  const metadata = validateUploadMetadata(input.metadata ?? {})

  if (metadata.kind === 'pdf-page') {
    const existing = db.prepare(`SELECT ${ASSET_COLUMNS} FROM assets WHERE board_id = ? AND kind = 'pdf-page' AND source_document_id = ? AND page_number = ? AND dpi = ? AND status = 'ready'`)
      .get(input.boardId, metadata.sourceDocumentId, metadata.pageNumber, metadata.dpi) as AssetRecord | undefined
    if (existing) return existing
  }

  const usage = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM assets WHERE board_id = ?').get(input.boardId) as { total: number }
  if (usage.total + input.buffer.length > config.maxAssetBytesPerBoard) throw new Error('Quota de stockage du tableau dépassé.')

  let image: sharp.Sharp
  let sourceMetadata: sharp.Metadata
  try {
    image = sharp(input.buffer, { limitInputPixels: config.maxImagePixels, failOn: 'warning', animated: false }).rotate()
    sourceMetadata = await image.metadata()
  } catch {
    throw new Error('Le fichier reçu n’est pas une image valide.')
  }
  const supportedFormats = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff'])
  if (!sourceMetadata.format || !supportedFormats.has(sourceMetadata.format)) throw new Error('Format d’image non pris en charge.')
  if (!sourceMetadata.width || !sourceMetadata.height || sourceMetadata.width * sourceMetadata.height > config.maxImagePixels) throw new Error('Dimensions de l’image non autorisées.')

  const quality = metadata.kind === 'pdf-page' ? 88 : 90
  const [encoded, displayBuffer, thumbnailBuffer] = await Promise.all([
    image.clone().webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true }),
    image.clone().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, effort: 3 }).toBuffer(),
    image.clone().resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76, effort: 3 }).toBuffer(),
  ])
  const output = encoded.data
  const storedBytes = output.length + displayBuffer.length + thumbnailBuffer.length
  if (usage.total + storedBytes > config.maxAssetBytesPerBoard) throw new Error('Quota de stockage du tableau dépassé.')

  const id = randomUUID()
  const relative = relativeStorage(input.boardId, id)
  const target = absoluteStorage(relative)
  const displayTarget = absoluteStorage(relativeStorage(input.boardId, id, 'display'))
  const thumbnailTarget = absoluteStorage(relativeStorage(input.boardId, id, 'thumbnail'))
  await fs.mkdir(path.dirname(target), { recursive: true })
  await Promise.all([
    fs.writeFile(target, output, { mode: 0o600 }),
    fs.writeFile(displayTarget, displayBuffer, { mode: 0o600 }),
    fs.writeFile(thumbnailTarget, thumbnailBuffer, { mode: 0o600 }),
  ])

  try {
    db.prepare(`
      INSERT INTO assets (
        id, board_id, uploaded_by, kind, original_name, mime, storage_path, size_bytes, width, height,
        page_number, source_document_id, source_name, page_count, dpi, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)
    `).run(
      id,
      input.boardId,
      input.userId ?? null,
      metadata.kind,
      safeFilename(input.filename),
      relative,
      storedBytes,
      encoded.info.width,
      encoded.info.height,
      metadata.kind === 'pdf-page' ? metadata.pageNumber : null,
      metadata.kind === 'pdf-page' ? metadata.sourceDocumentId : null,
      metadata.kind === 'pdf-page' ? metadata.sourceName : null,
      metadata.kind === 'pdf-page' ? metadata.pageCount : null,
      metadata.kind === 'pdf-page' ? metadata.dpi : null,
      new Date().toISOString(),
    )
  } catch (error) {
    await Promise.all([target, displayTarget, thumbnailTarget].map(file => fs.rm(file, { force: true }).catch(() => undefined)))
    if (metadata.kind === 'pdf-page' && error instanceof Error && /UNIQUE/.test(error.message)) {
      const existing = db.prepare(`SELECT ${ASSET_COLUMNS} FROM assets WHERE board_id = ? AND kind = 'pdf-page' AND source_document_id = ? AND page_number = ? AND dpi = ? AND status = 'ready'`)
        .get(input.boardId, metadata.sourceDocumentId, metadata.pageNumber, metadata.dpi) as AssetRecord | undefined
      if (existing) return existing
    }
    throw error
  }
  return getAsset(id)!
}

export function assetAbsolutePath(asset: AssetRecord, variant: 'full' | 'display' | 'thumbnail' = 'full'): string {
  const full = absoluteStorage(asset.storagePath)
  if (variant === 'full') return full
  const extension = path.extname(asset.storagePath)
  const base = asset.storagePath.slice(0, -extension.length)
  const candidate = absoluteStorage(`${base}.${variant}${extension}`)
  return fsSync.existsSync(candidate) ? candidate : full
}

export async function purgeDeletedBoards(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const boards = db.prepare('SELECT id FROM boards WHERE deleted_at IS NOT NULL AND deleted_at <= ?').all(cutoff) as { id: string }[]
  for (const board of boards) {
    await fs.rm(path.join(assetDir, board.id), { recursive: true, force: true })
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM documents WHERE board_id = ? OR name = ?').run(board.id, `board.${board.id}`)
      db.prepare('DELETE FROM boards WHERE id = ?').run(board.id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  return boards.length
}
