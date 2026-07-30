/**
 * Creates a UUID for client-side board objects.
 *
 * crypto.randomUUID() is unavailable on plain HTTP origins in some browsers.
 * getRandomValues() remains usable there, so keep a UUID v4 fallback for the
 * local Synology test URL. These identifiers are object keys, not secrets.
 */
export function createUuid(): string {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256)
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
