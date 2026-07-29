import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateElement } from './model/board.js'

test('migre un ancien objet vers le schéma v3', () => {
  const element = migrateElement({ id: 'a', type: 'text', x: 10, y: 20, text: '**Bonjour**' }, 4)
  assert.equal(element?.schemaVersion, 3)
  assert.equal(element?.richTextField, 'text.a')
  assert.equal(element?.legacyText, '**Bonjour**')
  assert.equal(element?.zIndex, 4)
})

test('rejette les types d’objets inconnus', () => {
  assert.equal(migrateElement({ type: 'script', x: 0, y: 0 }), null)
})
