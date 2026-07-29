type Entry = { image: HTMLImageElement; objectUrl: string; touchedAt: number; estimatedBytes: number }
const entries = new Map<string, Entry>()
const pending = new Map<string, Promise<HTMLImageElement>>()
const MAX_ENTRIES = 72
const MAX_ESTIMATED_BYTES = 320 * 1024 * 1024

function evict(): void {
  let bytes = [...entries.values()].reduce((sum, entry) => sum + entry.estimatedBytes, 0)
  const sorted = [...entries.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)
  while (entries.size > MAX_ENTRIES || bytes > MAX_ESTIMATED_BYTES) {
    const oldest = sorted.shift()
    if (!oldest) break
    entries.delete(oldest[0])
    URL.revokeObjectURL(oldest[1].objectUrl)
    bytes -= oldest[1].estimatedBytes
  }
}

export function loadCachedImage(url: string): Promise<HTMLImageElement> {
  const cached = entries.get(url)
  if (cached) { cached.touchedAt = performance.now(); return Promise.resolve(cached.image) }
  const existing = pending.get(url)
  if (existing) return existing
  const request = fetch(url, { credentials: 'include' })
    .then(response => response.ok ? response.blob() : Promise.reject(new Error('Image inaccessible')))
    .then(blob => new Promise<HTMLImageElement>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob)
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => {
        entries.set(url, { image, objectUrl, touchedAt: performance.now(), estimatedBytes: Math.max(blob.size, image.naturalWidth * image.naturalHeight * 4) })
        pending.delete(url); evict(); resolve(image)
      }
      image.onerror = () => { URL.revokeObjectURL(objectUrl); pending.delete(url); reject(new Error('Décodage de l’image impossible')) }
      image.src = objectUrl
    }))
  pending.set(url, request)
  return request
}
