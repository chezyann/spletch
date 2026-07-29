import * as Y from 'yjs'
import { db } from '../db.js'
import { config } from '../config.js'

const rows = db.prepare('SELECT name, data FROM documents').all() as { name: string; data: Uint8Array }[]
let compacted = 0
for (const row of rows) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(row.data))
  const state = Y.encodeStateAsUpdate(doc)
  if (state.byteLength > config.maxDocumentBytes) console.warn(`${row.name}: dépasse le quota (${state.byteLength} octets)`)
  db.prepare('UPDATE documents SET data = ?, size_bytes = ?, updated_at = ? WHERE name = ?').run(state, state.byteLength, new Date().toISOString(), row.name)
  doc.destroy()
  compacted++
}
console.log(`${compacted} document(s) compacté(s).`)
