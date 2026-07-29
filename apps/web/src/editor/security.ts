import DOMPurify from 'dompurify'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isAllowedEditorUri(value: string): boolean {
  try {
    const url = new URL(value, location.origin)
    return SAFE_PROTOCOLS.has(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

export function normalizedEditorHref(value: string | null): string | null {
  if (!value || !isAllowedEditorUri(value)) return null
  return new URL(value, location.origin).href
}

export function sanitizeEditorPaste(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'input'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-spoiler', 'data-type', 'data-checked', 'type', 'checked', 'disabled', 'colspan', 'rowspan'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'svg', 'math', 'img', 'video', 'audio', 'form', 'button'],
    FORBID_ATTR: ['style', 'src', 'srcset', 'onerror', 'onclick', 'onload', 'formaction'],
    ALLOW_DATA_ATTR: true,
  })
}
