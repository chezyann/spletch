import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDisplayName, normalizeUsername, safeFilename } from './security/normalize.js'
import { issueRealtimeTicket, verifyRealtimeTicket } from './security/tickets.js'
import { clearCredentialFailures, credentialAttemptAllowed, recordCredentialFailure } from './security/credentialAttempts.js'

test('normalise les identités et retire les caractères bidirectionnels', () => {
  assert.equal(normalizeDisplayName('  Léa\u202E  Martin  '), 'Léa Martin')
  assert.equal(normalizeUsername('Équipe_42'), 'Équipe_42')
  assert.throws(() => normalizeDisplayName('admin'))
  assert.equal(safeFilename('../cahier:projet?.pdf'), '.._cahier_projet_.pdf')
})

test('signe, vérifie et refuse les tickets temps réel altérés', () => {
  const token = issueRealtimeTicket({ boardId: 'board-1', role: 'editor', sessionId: 'session-1', userId: 'user-1', username: 'lea', guest: false })
  assert.equal(verifyRealtimeTicket(token)?.boardId, 'board-1')
  const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
  assert.equal(verifyRealtimeTicket(altered), null)
})


test('bloque les tentatives répétées par compte et adresse', () => {
  const login = `test-${Date.now()}@example.test`
  const prefix = '192.0.2.0/24'
  assert.equal(credentialAttemptAllowed(login, prefix), true)
  for (let index = 0; index < 7; index++) recordCredentialFailure(login, prefix)
  assert.equal(credentialAttemptAllowed(login, prefix), false)
  clearCredentialFailures(login, prefix)
  assert.equal(credentialAttemptAllowed(login, prefix), true)
})
