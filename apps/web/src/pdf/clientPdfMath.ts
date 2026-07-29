export function effectiveDpiFor(pageWidth: number, pageHeight: number, requestedDpi: number, maxPixels: number): number {
  const safeRequested = Math.max(72, Math.min(300, Math.round(requestedDpi)))
  const scale = safeRequested / 72
  const pixels = pageWidth * scale * pageHeight * scale
  if (pixels <= maxPixels) return safeRequested
  return Math.max(72, Math.floor(safeRequested * Math.sqrt(maxPixels / pixels)))
}

export function pdfPageFilename(sourceName: string, pageNumber: number): string {
  const base = sourceName.replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'document'
  return `${base}-page-${String(pageNumber).padStart(3, '0')}.webp`
}
