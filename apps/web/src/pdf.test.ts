import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveDpiFor, pdfPageFilename } from './pdf/clientPdfMath.js'

test('conserve la résolution lorsque la page reste sous la limite', () => {
  assert.equal(effectiveDpiFor(595, 842, 144, 20_000_000), 144)
})

test('réduit automatiquement la résolution des pages trop grandes', () => {
  const dpi = effectiveDpiFor(2000, 3000, 300, 20_000_000)
  assert.ok(dpi >= 72 && dpi < 300)
})

test('génère un nom de page sûr et stable', () => {
  assert.equal(pdfPageFilename('Cahier projet été.pdf', 7), 'Cahier-projet-été-page-007.webp')
})
