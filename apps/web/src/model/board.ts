export const BOARD_SCHEMA_VERSION = 3
export type ElementType = 'sticky' | 'rect' | 'ellipse' | 'text' | 'draw' | 'highlighter' | 'arrow' | 'image' | 'pdf-page'
export type BoardElement = {
  schemaVersion: 3
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  groupId?: string
  locked?: boolean
  opacity: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  points?: number[]
  richTextField?: string
  legacyText?: string
  fontFamily?: string
  fontSize?: number
  textColor?: string
  backgroundEnabled?: boolean
  assetId?: string
  sourceAssetId?: string
  pageNumber?: number
  sourceDocumentId?: string
  sourceName?: string
  pageCount?: number
  dpi?: number
}

export function migrateElement(value: unknown, fallbackZ = 0): BoardElement | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const type = typeof source.type === 'string' ? source.type as ElementType : null
  if (!type || !['sticky', 'rect', 'ellipse', 'text', 'draw', 'highlighter', 'arrow', 'image', 'pdf-page'].includes(type)) return null
  const id = typeof source.id === 'string' ? source.id : crypto.randomUUID()
  return {
    schemaVersion: 3,
    id,
    type,
    x: clamp(finite(source.x, 0), -10_000_000, 10_000_000), y: clamp(finite(source.y, 0), -10_000_000, 10_000_000),
    width: clamp(finite(source.width, type === 'text' ? 260 : 180), 10, 50_000),
    height: clamp(finite(source.height, type === 'text' ? 90 : 120), 10, 50_000),
    rotation: finite(source.rotation, 0),
    zIndex: Math.round(clamp(finite(source.zIndex, fallbackZ), -100_000, 100_000)),
    groupId: typeof source.groupId === 'string' ? source.groupId : undefined,
    locked: source.locked === true,
    opacity: clamp(finite(source.opacity, 1), 0.05, 1),
    fill: typeof source.fill === 'string' ? source.fill : undefined,
    stroke: typeof source.stroke === 'string' ? source.stroke : undefined,
    strokeWidth: Math.max(0.5, finite(source.strokeWidth, type === 'highlighter' ? 22 : 3)),
    points: Array.isArray(source.points) ? (source.points.filter(value => typeof value === 'number' && Number.isFinite(value)) as number[]).slice(0, 20_000) : undefined,
    richTextField: typeof source.richTextField === 'string' ? source.richTextField : (type === 'text' || type === 'sticky' ? `text.${id}` : undefined),
    legacyText: typeof source.text === 'string' ? source.text : undefined,
    fontFamily: typeof source.fontFamily === 'string' ? source.fontFamily : 'Inter, system-ui, sans-serif',
    fontSize: Math.max(10, Math.min(96, finite(source.fontSize, type === 'sticky' ? 18 : 24))),
    textColor: typeof source.textColor === 'string' ? source.textColor : '#172033',
    backgroundEnabled: source.backgroundEnabled === true || type === 'sticky',
    assetId: typeof source.assetId === 'string' ? source.assetId : undefined,
    sourceAssetId: typeof source.sourceAssetId === 'string' ? source.sourceAssetId : undefined,
    pageNumber: typeof source.pageNumber === 'number' ? source.pageNumber : undefined,
    sourceDocumentId: typeof source.sourceDocumentId === 'string' ? source.sourceDocumentId : undefined,
    sourceName: typeof source.sourceName === 'string' ? source.sourceName : undefined,
    pageCount: typeof source.pageCount === 'number' ? source.pageCount : undefined,
    dpi: typeof source.dpi === 'number' ? source.dpi : undefined,
  }
}
function finite(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
