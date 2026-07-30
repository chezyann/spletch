import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { effectiveDpiFor } from './clientPdfMath'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type PdfLayout = 'vertical' | 'horizontal' | 'grid'
export type PdfImportOptions = {
  dpi: number
  maxPages: number
  layout: PdfLayout
  quality: number
  maxRenderPixels: number
}
export type PdfPageResult = {
  blob: Blob
  pageNumber: number
  pageCount: number
  requestedDpi: number
  effectiveDpi: number
  width: number
  height: number
  sourceDocumentId: string
}
export type PdfProgress = {
  phase: 'loading' | 'rendering' | 'encoding'
  pageNumber: number
  pageCount: number
  effectiveDpi?: number
}

const PDF_MAX_FILE_BYTES = 50 * 1024 * 1024

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Import annulé.', 'AbortError')
}
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encodage de la page impossible.')), 'image/webp', quality)
  })
}

function fallbackDocumentFingerprint(data: Uint8Array): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f]
  const hashes = seeds.map(seed => seed >>> 0)
  for (let index = 0; index < data.length; index++) {
    const byte = data[index]
    for (let slot = 0; slot < hashes.length; slot++) {
      hashes[slot] ^= byte + slot
      hashes[slot] = Math.imul(hashes[slot], 0x01000193) >>> 0
    }
  }
  return hashes.map(value => value.toString(16).padStart(8, '0')).join('').slice(0, 40)
}

async function stableSourceDocumentId(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return `pdf_${fallbackDocumentFingerprint(data)}`
  const digestInput = new Uint8Array(data.byteLength)
  digestInput.set(data)
  const digest = await subtle.digest('SHA-256', digestInput)
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return `pdf_${hex.slice(0, 40)}`
}


export async function inspectPdf(file: File, signal?: AbortSignal): Promise<{ pageCount: number }> {
  if (file.size > PDF_MAX_FILE_BYTES) throw new Error('Le PDF dépasse la limite locale de 50 Mo.')
  throwIfAborted(signal)
  const data = new Uint8Array(await file.arrayBuffer())
  throwIfAborted(signal)
  const task = getDocument({ data, useWorkerFetch: false })
  const abort = () => task.destroy()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const document = await task.promise
    return { pageCount: document.numPages }
  } finally {
    signal?.removeEventListener('abort', abort)
    await task.destroy().catch(() => undefined)
  }
}

export async function convertPdfPages(
  file: File,
  options: PdfImportOptions,
  onPage: (page: PdfPageResult) => Promise<void>,
  onProgress?: (progress: PdfProgress) => void,
  signal?: AbortSignal,
): Promise<{ importedPages: number; pageCount: number }> {
  if (file.size > PDF_MAX_FILE_BYTES) throw new Error('Le PDF dépasse la limite locale de 50 Mo.')
  throwIfAborted(signal)
  onProgress?.({ phase: 'loading', pageNumber: 0, pageCount: 0 })
  const data = new Uint8Array(await file.arrayBuffer())
  throwIfAborted(signal)
  const sourceDocumentId = await stableSourceDocumentId(data)
  throwIfAborted(signal)
  const loadingTask = getDocument({ data, useWorkerFetch: false })
  let document: PDFDocumentProxy | null = null
  const abort = () => { void loadingTask.destroy() }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    document = await loadingTask.promise
    const pageCount = document.numPages
    const pagesToImport = Math.min(pageCount, Math.max(1, Math.round(options.maxPages)))
    for (let pageNumber = 1; pageNumber <= pagesToImport; pageNumber++) {
      throwIfAborted(signal)
      const page = await document.getPage(pageNumber)
      const canvas = window.document.createElement('canvas')
      try {
        const baseViewport = page.getViewport({ scale: 1 })
        const effectiveDpi = effectiveDpiFor(baseViewport.width, baseViewport.height, options.dpi, options.maxRenderPixels)
        const viewport = page.getViewport({ scale: effectiveDpi / 72 })
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas 2D indisponible.')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        onProgress?.({ phase: 'rendering', pageNumber, pageCount: pagesToImport, effectiveDpi })
        const renderTask = page.render({ canvas, canvasContext: context, viewport, intent: 'display' })
        const cancel = () => renderTask.cancel()
        signal?.addEventListener('abort', cancel, { once: true })
        try {
          await renderTask.promise
        } finally {
          signal?.removeEventListener('abort', cancel)
        }
        throwIfAborted(signal)
        onProgress?.({ phase: 'encoding', pageNumber, pageCount: pagesToImport, effectiveDpi })
        const blob = await canvasToBlob(canvas, options.quality)
        throwIfAborted(signal)
        await onPage({ blob, pageNumber, pageCount, sourceDocumentId, requestedDpi: options.dpi, effectiveDpi, width: canvas.width, height: canvas.height })
      } finally {
        canvas.width = 1
        canvas.height = 1
        page.cleanup()
      }
    }
    return { importedPages: pagesToImport, pageCount }
  } finally {
    signal?.removeEventListener('abort', abort)
    await loadingTask.destroy().catch(() => undefined)
  }
}
