import type { BoardElement } from '../model/board'

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

type IndexedItem = Bounds & { id: string }

export function elementBounds(element: BoardElement): Bounds {
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const angle = ((element.rotation || 0) * Math.PI) / 180
  if (!angle) return { minX: element.x, minY: element.y, maxX: element.x + width, maxY: element.y + height }
  const cx = element.x + width / 2
  const cy = element.y + height / 2
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const rotatedWidth = width * cos + height * sin
  const rotatedHeight = width * sin + height * cos
  return {
    minX: cx - rotatedWidth / 2,
    minY: cy - rotatedHeight / 2,
    maxX: cx + rotatedWidth / 2,
    maxY: cy + rotatedHeight / 2,
  }
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY
}

/**
 * Uniform-grid spatial index. It is deliberately dependency-free and optimized
 * for viewport, marquee-selection and hit-neighbour queries on whiteboards.
 */
export class SpatialIndex {
  private readonly cells = new Map<string, Set<string>>()
  private readonly items = new Map<string, IndexedItem>()

  constructor(elements: readonly BoardElement[], private readonly cellSize = 512) {
    for (const element of elements) this.insert(element.id, elementBounds(element))
  }

  search(bounds: Bounds): Set<string> {
    const ids = new Set<string>()
    for (const key of this.cellKeys(bounds)) {
      const cell = this.cells.get(key)
      if (!cell) continue
      for (const id of cell) {
        const item = this.items.get(id)
        if (item && intersects(item, bounds)) ids.add(id)
      }
    }
    return ids
  }

  getBounds(id: string): Bounds | undefined { return this.items.get(id) }

  private insert(id: string, bounds: Bounds): void {
    this.items.set(id, { id, ...bounds })
    for (const key of this.cellKeys(bounds)) {
      let cell = this.cells.get(key)
      if (!cell) { cell = new Set(); this.cells.set(key, cell) }
      cell.add(id)
    }
  }

  private cellKeys(bounds: Bounds): string[] {
    const minX = Math.floor(bounds.minX / this.cellSize)
    const maxX = Math.floor(bounds.maxX / this.cellSize)
    const minY = Math.floor(bounds.minY / this.cellSize)
    const maxY = Math.floor(bounds.maxY / this.cellSize)
    const keys: string[] = []
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) keys.push(`${x}:${y}`)
    return keys
  }
}
