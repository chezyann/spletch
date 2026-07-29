const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu
const MULTISPACE = /\s+/gu
const RESERVED = new Set(['admin', 'administrator', 'spletch', 'owner', 'propriétaire', 'system', 'système', 'support'])

export function normalizeDisplayName(value: string, max = 30): string {
  const normalized = value.normalize('NFKC').replace(CONTROL_OR_BIDI, '').replace(MULTISPACE, ' ').trim().slice(0, max)
  if (normalized.length < 2) throw new Error('Le pseudonyme doit contenir au moins 2 caractères.')
  if (RESERVED.has(normalized.toLocaleLowerCase('fr-FR'))) throw new Error('Ce pseudonyme est réservé.')
  return normalized
}

export function normalizeUsername(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (!/^[\p{L}\p{N}_-]{2,30}$/u.test(normalized)) throw new Error('Nom d’utilisateur invalide.')
  if (RESERVED.has(normalized.toLocaleLowerCase('fr-FR'))) throw new Error('Ce nom d’utilisateur est réservé.')
  return normalized
}

export function safeFilename(value: string): string {
  return value.normalize('NFKC').replace(CONTROL_OR_BIDI, '').replace(/[\\/<>:"|?*]/g, '_').replace(MULTISPACE, ' ').trim().slice(0, 120) || 'fichier'
}
