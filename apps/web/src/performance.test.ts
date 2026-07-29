import test from 'node:test'
import assert from 'node:assert/strict'
import { SpatialIndex } from './performance/spatialIndex.js'
import { normalizeFlatPoints, simplifyFlatPoints } from './performance/simplify.js'
import type { BoardElement } from './model/board.js'

const element = (id: string, x: number, y: number): BoardElement => ({ schemaVersion: 3, id, type: 'rect', x, y, width: 100, height: 80, rotation: 0, zIndex: 0, opacity: 1 })

test('l’index spatial ne retourne que les objets proches du viewport', () => {
  const index = new SpatialIndex([element('a', 0, 0), element('b', 2000, 2000)])
  assert.deepEqual([...index.search({ minX: -20, minY: -20, maxX: 300, maxY: 300 })], ['a'])
})

test('la simplification réduit un tracé dense sans perdre ses extrémités', () => {
  const dense = Array.from({ length: 200 }, (_, index) => [index, index * 0.01]).flat()
  const simplified = simplifyFlatPoints(dense, 1)
  assert.ok(simplified.length < dense.length / 4)
  assert.deepEqual(simplified.slice(0, 2), dense.slice(0, 2))
  assert.deepEqual(simplified.slice(-2), dense.slice(-2))
})

test('la normalisation accepte des points négatifs', () => {
  const result = normalizeFlatPoints({ x: 100, y: 100 }, [0, 0, -20, 30, 10, -10])
  assert.equal(result.x, 80)
  assert.equal(result.y, 90)
  assert.equal(result.width, 30)
  assert.equal(result.height, 40)
})
