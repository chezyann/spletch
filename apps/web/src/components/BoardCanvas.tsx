import { memo, useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import Konva from 'konva'
import { Arrow, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from 'react-konva'
import {
  ArrowDownToLine, ArrowUpFromLine, BringToFront, Circle as CircleIcon, Group as GroupIcon, Hand, Highlighter,
  ImagePlus, Magnet, MousePointer2, Pencil, Redo2, SendToBack, Square, StickyNote, Type, Ungroup, Undo2, MoveRight,
} from 'lucide-react'
import * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { Role, AssetSummary, UploadAssetOptions } from '../lib/api'
import { ApiError, assetUrl, uploadAsset } from '../lib/api'
import { migrateElement, type BoardElement } from '../model/board'
import { RichTextContent } from '../editor/RichTextContent'
import { CanvasTextEditor } from '../editor/CanvasTextEditor'
import { PdfImportDialog } from '../pdf/PdfImportDialog'
import { convertPdfPages, type PdfImportOptions } from '../pdf/clientPdf'
import { pdfPageFilename } from '../pdf/clientPdfMath'
import { SpatialIndex, type Bounds } from '../performance/spatialIndex'
import { normalizeFlatPoints, simplifyFlatPoints } from '../performance/simplify'
import { useAdaptivePerformance } from '../performance/adaptivePerformance'
import { loadCachedImage } from '../performance/imageCache'

type Tool = 'select' | 'hand' | 'sticky' | 'rect' | 'ellipse' | 'text' | 'draw' | 'highlighter' | 'arrow'
type Presence = { user?: { id: string; username: string; color: string }; canvasCursor?: { x: number; y: number } | null; selectedIds?: string[] }
type Point = { x: number; y: number }
type SelectionBox = { start: Point; end: Point } | null
type PdfDialogState = { file: File; resolve: (options: PdfImportOptions | null) => void }
type DraftStroke = { id: string; type: 'draw' | 'highlighter' | 'arrow'; x: number; y: number; points: number[]; stroke: string; strokeWidth: number; opacity: number }
type ElementActions = {
  select: (element: BoardElement, event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  beginEdit: (element: BoardElement) => void
  dragStart: (element: BoardElement, event: Konva.KonvaEventObject<DragEvent>) => void
  dragMove: (element: BoardElement, event: Konva.KonvaEventObject<DragEvent>) => void
  dragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void
  register: (id: string, node: Konva.Node | null) => void
  cursor: (value: string) => void
}
const GRID = 22

function useYElements(doc: Y.Doc) {
  const map = useMemo(() => doc.getMap<unknown>('elements'), [doc])
  const cacheRef = useRef(new Map<string, { source: unknown; element: BoardElement }>())
  const [elements, setElements] = useState<BoardElement[]>([])
  useEffect(() => {
    const update = () => {
      const next: BoardElement[] = []
      const activeIds = new Set<string>()
      let index = 0
      for (const [id, value] of map.entries()) {
        activeIds.add(id)
        const cached = cacheRef.current.get(id)
        let migrated = cached && cached.source === value ? cached.element : migrateElement(value, index)
        index++
        if (!migrated) continue
        if (!cached || cached.source !== value) cacheRef.current.set(id, { source: value, element: migrated })
        next.push(migrated)
        const source = value as Record<string, unknown>
        if (source.schemaVersion !== 3 || source.id !== id) {
          migrated = { ...migrated, id }
          map.set(id, migrated)
          cacheRef.current.set(id, { source: migrated, element: migrated })
        }
      }
      for (const id of cacheRef.current.keys()) if (!activeIds.has(id)) cacheRef.current.delete(id)
      setElements(next.sort((a, b) => a.zIndex - b.zIndex))
    }
    map.observeDeep(update); update()
    return () => map.unobserveDeep(update)
  }, [map])
  return { map, elements }
}
function usePresence(provider: HocuspocusProvider) {
  const [states, setStates] = useState<Map<number, Presence>>(new Map())
  useEffect(() => {
    const awareness = provider.awareness
    if (!awareness) { setStates(new Map()); return }
    const update = () => setStates(new Map(awareness.getStates() as Map<number, Presence>))
    awareness.on('change', update); update()
    return () => { awareness.off('change', update) }
  }, [provider])
  return states
}
function snap(value: number, enabled: boolean) { return enabled ? Math.round(value / GRID) * GRID : value }

export function BoardCanvas({ boardId, doc, provider, role }: { boardId: string; doc: Y.Doc; provider: HocuspocusProvider; role: Role }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const draftNodeRef = useRef<Konva.Line | Konva.Arrow>(null)
  const elementActionsRef = useRef<ElementActions | null>(null)
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({})
  const dragOrigin = useRef<{ pointerId: string; positions: Map<string, Point> } | null>(null)
  const draftRef = useRef<DraftStroke | null>(null)
  const cursorThrottleRef = useRef({ lastSent: 0, pending: null as Point | null })
  const importAbortRef = useRef<AbortController | null>(null)
  const lastTouchDistance = useRef(0)
  const lastTouchCenter = useRef<Point | null>(null)
  const [size, setSize] = useState({ width: 900, height: 700 })
  const [tool, setTool] = useState<Tool>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 })
  const [draft, setDraft] = useState<DraftStroke | null>(null)
  const [selectionBox, setSelectionBox] = useState<SelectionBox>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [busy, setBusy] = useState('')
  const [importCancelable, setImportCancelable] = useState(false)
  const [pdfDialog, setPdfDialog] = useState<PdfDialogState | null>(null)
  const [pen, setPen] = useState({ size: 5, color: '#ec4899', opacity: 1 })
  const [highlighter, setHighlighter] = useState({ size: 22, color: '#fde047', opacity: 0.25 })
  const [textStyle, setTextStyle] = useState({ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 24, color: '#172033', backgroundEnabled: false, background: '#ffffff' })
  const { map, elements } = useYElements(doc)
  const presence = usePresence(provider)
  const undoManager = useMemo(() => new Y.UndoManager(map, { captureTimeout: 350 }), [map])
  const canEdit = role !== 'viewer'
  const selected = elements.filter(element => selectedIds.includes(element.id))
  const spatialIndex = useMemo(() => new SpatialIndex(elements), [elements])
  const viewportBounds = useMemo<Bounds>(() => {
    const overscanX = size.width / viewport.scale * 0.3 + 220
    const overscanY = size.height / viewport.scale * 0.3 + 220
    const minX = -viewport.x / viewport.scale - overscanX
    const minY = -viewport.y / viewport.scale - overscanY
    return { minX, minY, maxX: minX + size.width / viewport.scale + overscanX * 2, maxY: minY + size.height / viewport.scale + overscanY * 2 }
  }, [size.height, size.width, viewport.scale, viewport.x, viewport.y])
  const visibleIds = useMemo(() => {
    const ids = spatialIndex.search(viewportBounds)
    selectedIds.forEach(id => ids.add(id))
    if (editingId) ids.add(editingId)
    return ids
  }, [editingId, selectedIds, spatialIndex, viewportBounds])
  const visibleElements = useMemo(() => elements.filter(element => visibleIds.has(element.id)), [elements, visibleIds])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const staticElements = useMemo(() => visibleElements.filter(element => !selectedSet.has(element.id)), [selectedSet, visibleElements])
  const interactionElements = useMemo(() => visibleElements.filter(element => selectedSet.has(element.id)), [selectedSet, visibleElements])
  const performanceProfile = useAdaptivePerformance(elements.length, visibleElements.length)

  useEffect(() => {
    if (!wrapperRef.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (Konva.pixelRatio === performanceProfile.pixelRatio) return
    Konva.pixelRatio = performanceProfile.pixelRatio
    stageRef.current?.draw()
  }, [performanceProfile.pixelRatio])

  useEffect(() => {
    const nodes = selectedIds.map(id => nodeRefs.current[id]).filter(Boolean) as Konva.Node[]
    transformerRef.current?.nodes(nodes)
    transformerRef.current?.getLayer()?.batchDraw()
    provider.awareness?.setLocalStateField('selectedIds', selectedIds.slice(0, 100))
  }, [provider, selectedIds, elements])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedIds.length && canEdit) {
        doc.transact(() => selectedIds.forEach(id => map.delete(id))); setSelectedIds([])
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelectedIds(elements.map(element => element.id)) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? undoManager.redo() : undoManager.undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection() }
      if (event.key === 'Escape') { setEditingId(null); setSelectedIds([]); setSelectionBox(null); setTool('select') }
      if (selectedIds.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && canEdit) {
        event.preventDefault(); const step = event.shiftKey ? GRID : 1
        const delta = { x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 }
        doc.transact(() => selectedIds.forEach(id => { const current = migrateElement(map.get(id)); if (current) map.set(id, { ...current, x: current.x + delta.x, y: current.y + delta.y }) }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function pointerWorld(): Point | null {
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return null
    return { x: (pointer.x - viewport.x) / viewport.scale, y: (pointer.y - viewport.y) / viewport.scale }
  }
  function createElement(type: Tool, point: Point): string | null {
    if (!canEdit || type === 'select' || type === 'hand' || type === 'draw' || type === 'highlighter' || type === 'arrow') return null
    const id = crypto.randomUUID()
    const maxZ = Math.max(0, ...elements.map(element => element.zIndex)) + 1
    const base = { schemaVersion: 3 as const, id, x: snap(point.x, snapEnabled), y: snap(point.y, snapEnabled), rotation: 0, zIndex: maxZ, opacity: 1, width: 180, height: 120 }
    let element: BoardElement
    if (type === 'sticky') element = { ...base, type: 'sticky', width: 220, height: 160, fill: '#fff2a8', stroke: '#e8cf64', strokeWidth: 1.5, richTextField: `text.${id}`, fontFamily: textStyle.fontFamily, fontSize: 18, textColor: '#3b3415', backgroundEnabled: true, legacyText: 'Double-cliquez pour écrire' }
    else if (type === 'rect') element = { ...base, type: 'rect', fill: '#dbeafe', stroke: '#2563eb', strokeWidth: 2 }
    else if (type === 'ellipse') element = { ...base, type: 'ellipse', fill: '#dcfce7', stroke: '#16a34a', strokeWidth: 2 }
    else if (type === 'text') element = { ...base, type: 'text', width: 260, height: 90, fill: textStyle.background, strokeWidth: 0, richTextField: `text.${id}`, fontFamily: textStyle.fontFamily, fontSize: textStyle.fontSize, textColor: textStyle.color, backgroundEnabled: textStyle.backgroundEnabled, legacyText: 'Votre texte' }
    else return null
    map.set(id, element); setSelectedIds([id])
    if (type === 'text' || type === 'sticky') setEditingId(id)
    return id
  }

  function groupSelection() {
    if (!canEdit || selectedIds.length < 2) return
    const groupId = crypto.randomUUID()
    doc.transact(() => selectedIds.forEach(id => { const current = migrateElement(map.get(id)); if (current) map.set(id, { ...current, groupId }) }))
  }
  function ungroupSelection() {
    if (!canEdit || !selectedIds.length) return
    doc.transact(() => selectedIds.forEach(id => { const current = migrateElement(map.get(id)); if (current) { const { groupId: _ignored, ...rest } = current; map.set(id, rest) } }))
  }
  function layerMove(mode: 'front' | 'forward' | 'backward' | 'back') {
    if (!canEdit || !selectedIds.length) return
    const all = elements.map(element => element.zIndex)
    const max = Math.max(0, ...all), min = Math.min(0, ...all)
    doc.transact(() => selectedIds.forEach(id => { const current = migrateElement(map.get(id)); if (!current) return; const zIndex = mode === 'front' ? max + 1 : mode === 'back' ? min - 1 : current.zIndex + (mode === 'forward' ? 1 : -1); map.set(id, { ...current, zIndex }) }))
  }
  function selectElement(element: BoardElement, event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool !== 'select') return
    const groupIds = element.groupId ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id]
    const original = 'evt' in event ? event.evt as MouseEvent : null
    const toggle = Boolean(original && (original.ctrlKey || original.metaKey))
    const additive = Boolean(original && original.shiftKey)
    if (toggle) setSelectedIds(current => { const set = new Set(current); groupIds.forEach(id => set.has(id) ? set.delete(id) : set.add(id)); return [...set] })
    else if (additive) setSelectedIds(current => [...new Set([...current, ...groupIds])])
    else setSelectedIds(groupIds)
  }

  function scheduleCursor(point: Point | null) {
    if (!point) { provider.awareness?.setLocalStateField('canvasCursor', null); return }
    const now = performance.now()
    const minimumDelay = 1000 / performanceProfile.remoteCursorHz
    const throttle = cursorThrottleRef.current
    throttle.pending = point
    if (now - throttle.lastSent < minimumDelay) return
    throttle.lastSent = now
    provider.awareness?.setLocalStateField('canvasCursor', point)
  }

  function beginDraft(type: 'draw' | 'highlighter' | 'arrow', point: Point) {
    const settings = type === 'draw' ? pen : type === 'highlighter' ? highlighter : { size: 3, color: '#6d28d9', opacity: 1 }
    const next: DraftStroke = { id: crypto.randomUUID(), type, x: point.x, y: point.y, points: [0, 0], stroke: settings.color, strokeWidth: settings.size, opacity: settings.opacity }
    draftRef.current = next
    setDraft(next)
  }

  function commitDraft() {
    const current = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!current || current.points.length < 4) return
    const simplified = current.type === 'arrow' ? current.points : simplifyFlatPoints(current.points, Math.max(0.8, current.strokeWidth * 0.12))
    const normalized = normalizeFlatPoints({ x: current.x, y: current.y }, simplified)
    const maxZ = Math.max(0, ...elements.map(element => element.zIndex)) + 1
    map.set(current.id, {
      schemaVersion: 3, id: current.id, type: current.type,
      x: snap(normalized.x, snapEnabled), y: snap(normalized.y, snapEnabled), width: normalized.width, height: normalized.height,
      rotation: 0, zIndex: maxZ, opacity: current.opacity, points: normalized.points,
      stroke: current.stroke, strokeWidth: current.strokeWidth,
    })
    setSelectedIds([current.id])
  }

  function handleStageDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = event.target.getStage()
    const isBackground = event.target === stage || event.target.name() === 'canvas-background'
    if (!isBackground) return
    const point = pointerWorld(); if (!point) return
    if (tool === 'select') { setEditingId(null); setSelectionBox({ start: point, end: point }); return }
    if (tool === 'hand') return
    if (tool === 'draw' || tool === 'highlighter' || tool === 'arrow') { beginDraft(tool, point); return }
    createElement(tool, point)
    if (tool !== 'text' && tool !== 'sticky') setTool('select')
  }
  function handleStageMove() {
    const point = pointerWorld(); scheduleCursor(point)
    if (selectionBox && point) { setSelectionBox({ ...selectionBox, end: point }); return }
    const current = draftRef.current
    if (!current || !point) return
    const nextPoints = current.type === 'arrow'
      ? [0, 0, point.x - current.x, point.y - current.y]
      : [...current.points, point.x - current.x, point.y - current.y]
    current.points = nextPoints
    draftNodeRef.current?.points(nextPoints)
    draftNodeRef.current?.getLayer()?.batchDraw()
  }
  function finalizeSelection(event?: MouseEvent | TouchEvent) {
    if (selectionBox) {
      const bounds = {
        minX: Math.min(selectionBox.start.x, selectionBox.end.x), maxX: Math.max(selectionBox.start.x, selectionBox.end.x),
        minY: Math.min(selectionBox.start.y, selectionBox.end.y), maxY: Math.max(selectionBox.start.y, selectionBox.end.y),
      }
      const candidates = spatialIndex.search(bounds)
      const hits = elements.filter(element => candidates.has(element.id)).flatMap(element => element.groupId ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id])
      const additive = event instanceof MouseEvent && event.shiftKey
      const toggle = event instanceof MouseEvent && (event.ctrlKey || event.metaKey)
      if (toggle) setSelectedIds(currentIds => { const set = new Set(currentIds); [...new Set(hits)].forEach(id => set.has(id) ? set.delete(id) : set.add(id)); return [...set] })
      else if (additive) setSelectedIds(currentIds => [...new Set([...currentIds, ...hits])])
      else setSelectedIds([...new Set(hits)])
      setSelectionBox(null)
    }
    if (draftRef.current) { commitDraft(); setTool('select') }
  }

  function handleTouchMove(event: Konva.KonvaEventObject<TouchEvent>) {
    const touches = event.evt.touches
    if (touches.length !== 2) { handleStageMove(); return }
    event.evt.preventDefault()
    const rect = stageRef.current?.container().getBoundingClientRect(); if (!rect) return
    const first = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top }, second = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top }
    const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }, distance = Math.hypot(second.x - first.x, second.y - first.y)
    if (!lastTouchDistance.current || !lastTouchCenter.current) { lastTouchDistance.current = distance; lastTouchCenter.current = center; return }
    const oldScale = viewport.scale
    const point = { x: (lastTouchCenter.current.x - viewport.x) / oldScale, y: (lastTouchCenter.current.y - viewport.y) / oldScale }
    const scale = Math.max(0.2, Math.min(4, oldScale * (distance / lastTouchDistance.current)))
    setViewport({ x: center.x - point.x * scale, y: center.y - point.y * scale, scale })
    lastTouchDistance.current = distance; lastTouchCenter.current = center
  }
  function handleStageUp(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    lastTouchDistance.current = 0; lastTouchCenter.current = null; finalizeSelection(event.evt)
  }
  function updateElement(id: string, patch: Partial<BoardElement>) { const current = migrateElement(map.get(id)); if (current) map.set(id, { ...current, ...patch }) }

  function zoomAt(screenPoint: Point, factor: number) {
    const oldScale = viewport.scale
    const world = { x: (screenPoint.x - viewport.x) / oldScale, y: (screenPoint.y - viewport.y) / oldScale }
    const scale = Math.max(0.2, Math.min(4, oldScale * factor))
    setViewport({ x: screenPoint.x - world.x * scale, y: screenPoint.y - world.y * scale, scale })
  }
  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault(); const pointer = stageRef.current?.getPointerPosition(); if (!pointer) return
    zoomAt(pointer, event.evt.deltaY > 0 ? 0.92 : 1.08)
  }
  function zoomCenter(factor: number) { zoomAt({ x: size.width / 2, y: size.height / 2 }, factor) }

  function startDrag(element: BoardElement, event: Konva.KonvaEventObject<DragEvent>) {
    if (!selectedIds.includes(element.id)) setSelectedIds(element.groupId ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id])
    const active = selectedIds.includes(element.id) ? selectedIds : (element.groupId ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id])
    dragOrigin.current = { pointerId: element.id, positions: new Map(active.map(id => [id, { x: nodeRefs.current[id]?.x() ?? 0, y: nodeRefs.current[id]?.y() ?? 0 }])) }
    event.target.getStage()!.container().style.cursor = 'grabbing'
  }
  function moveDrag(element: BoardElement, event: Konva.KonvaEventObject<DragEvent>) {
    const origin = dragOrigin.current; if (!origin || origin.pointerId !== element.id) return
    const start = origin.positions.get(element.id); if (!start) return
    const dx = event.target.x() - start.x, dy = event.target.y() - start.y
    for (const [id, point] of origin.positions) if (id !== element.id) nodeRefs.current[id]?.position({ x: point.x + dx, y: point.y + dy })
    event.target.getLayer()?.batchDraw()
  }
  function endDrag(event: Konva.KonvaEventObject<DragEvent>) {
    const origin = dragOrigin.current; dragOrigin.current = null
    if (!origin) return
    doc.transact(() => { for (const id of origin.positions.keys()) { const node = nodeRefs.current[id], current = migrateElement(map.get(id)); if (node && current) map.set(id, { ...current, x: snap(node.x(), snapEnabled), y: snap(node.y(), snapEnabled) }) } })
    event.target.getStage()!.container().style.cursor = 'move'
  }

  function requestPdfOptions(file: File): Promise<PdfImportOptions | null> {
    return new Promise(resolve => setPdfDialog({ file, resolve }))
  }
  function closePdfDialog(options: PdfImportOptions | null) {
    const current = pdfDialog
    setPdfDialog(null)
    current?.resolve(options)
  }
  function cancelActiveImport() { importAbortRef.current?.abort() }

  async function importFiles(files: FileList | File[], point = { x: (size.width / 2 - viewport.x) / viewport.scale, y: (size.height / 2 - viewport.y) / viewport.scale }) {
    if (!canEdit) return
    let imageOffset = 0
    for (const file of Array.from(files)) {
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const options = await requestPdfOptions(file)
          if (!options) continue
          await importPdfClientSide(file, point, options)
        } else {
          setBusy(`Téléversement de ${file.name}…`)
          const asset = await uploadAsset(boardId, file)
          addImageAsset(asset, point.x + imageOffset, point.y + imageOffset)
          imageOffset += 40
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') setBusy('Import annulé.')
        else setBusy(error instanceof Error ? error.message : 'Import impossible.')
      }
    }
    setImportCancelable(false)
    importAbortRef.current = null
    window.setTimeout(() => setBusy(''), 3000)
  }

  async function importPdfClientSide(file: File, point: Point, options: PdfImportOptions) {
    const controller = new AbortController()
    importAbortRef.current = controller
    setImportCancelable(true)
    let index = 0
    let cursorX = point.x
    let cursorY = point.y
    let rowHeight = 0
    const gridColumns = size.width < 720 ? 2 : 3
    const baseZ = Math.max(0, ...elements.map(element => element.zIndex)) + 1

    const result = await convertPdfPages(file, options, async page => {
      setBusy(`PDF ${page.pageNumber}/${page.pageCount} — téléversement…`)
      const pageFile = new File([page.blob], pdfPageFilename(file.name, page.pageNumber), { type: page.blob.type || 'image/webp' })
      const asset = await uploadPdfPageWithRetry(pageFile, {
        kind: 'pdf-page', sourceDocumentId: page.sourceDocumentId, sourceName: file.name, pageNumber: page.pageNumber,
        pageCount: page.pageCount, dpi: page.effectiveDpi, signal: controller.signal,
      }, page.pageNumber, page.pageCount)
      const added = addImageAsset(asset, cursorX, cursorY, baseZ + index)
      index++
      if (options.layout === 'vertical') cursorY += added.height + 28
      else if (options.layout === 'horizontal') cursorX += added.width + 28
      else {
        rowHeight = Math.max(rowHeight, added.height)
        if (index % gridColumns === 0) { cursorX = point.x; cursorY += rowHeight + 28; rowHeight = 0 }
        else cursorX += added.width + 28
      }
    }, progress => {
      if (progress.phase === 'loading') setBusy('Analyse du PDF sur cet appareil…')
      else if (progress.phase === 'rendering') setBusy(`PDF ${progress.pageNumber}/${progress.pageCount} — rendu à ${progress.effectiveDpi} ppp…`)
      else setBusy(`PDF ${progress.pageNumber}/${progress.pageCount} — compression WebP…`)
    }, controller.signal)
    setBusy(`${result.importedPages} page(s) importée(s). Le PDF original n’a pas quitté cet appareil.`)
  }

  async function uploadPdfPageWithRetry(file: File, options: UploadAssetOptions, pageNumber: number, pageCount: number): Promise<AssetSummary> {
    let lastError: unknown
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return await uploadAsset(boardId, file, options) }
      catch (error) {
        lastError = error
        if (options.signal?.aborted || (error instanceof ApiError && error.status < 500)) throw error
        if (attempt < 3) {
          setBusy(`PDF ${pageNumber}/${pageCount} — nouvelle tentative ${attempt + 1}/3…`)
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => { window.clearTimeout(timer); reject(new DOMException('Import annulé.', 'AbortError')) }
            const timer = window.setTimeout(() => { options.signal?.removeEventListener('abort', onAbort); resolve() }, 500 * 2 ** (attempt - 1))
            options.signal?.addEventListener('abort', onAbort, { once: true })
          })
        }
      }
    }
    throw lastError
  }

  function addImageAsset(asset: AssetSummary, x: number, y: number, zIndex?: number) {
    if (asset.kind === 'pdf-page' && asset.sourceDocumentId && asset.pageNumber && asset.dpi) {
      for (const value of map.values()) {
        const existing = migrateElement(value)
        if (existing?.type === 'pdf-page' && existing.sourceDocumentId === asset.sourceDocumentId && existing.pageNumber === asset.pageNumber && existing.dpi === asset.dpi) {
          setSelectedIds([existing.id])
          return { id: existing.id, width: existing.width, height: existing.height }
        }
      }
    }
    const id = crypto.randomUUID()
    const ratio = asset.width && asset.height ? asset.width / asset.height : 1.4
    const width = Math.min(520, asset.width ?? 420), height = width / ratio
    map.set(id, {
      schemaVersion: 3, id, type: asset.kind === 'pdf-page' ? 'pdf-page' : 'image',
      x: snap(x, snapEnabled), y: snap(y, snapEnabled), width, height, rotation: 0,
      zIndex: zIndex ?? Math.max(0, ...elements.map(element => element.zIndex)) + 1, opacity: 1,
      assetId: asset.id, sourceAssetId: asset.sourceAssetId ?? undefined,
      sourceDocumentId: asset.sourceDocumentId ?? undefined, sourceName: asset.sourceName ?? undefined,
      pageNumber: asset.pageNumber ?? undefined, pageCount: asset.pageCount ?? undefined, dpi: asset.dpi ?? undefined,
    })
    setSelectedIds([id])
    return { id, width, height }
  }

  const worldLeft = -viewport.x / viewport.scale, worldTop = -viewport.y / viewport.scale
  const worldRight = worldLeft + size.width / viewport.scale, worldBottom = worldTop + size.height / viewport.scale
  const gridLines = useMemo(() => {
    const lines: { points: number[]; key: string }[] = []
    const startX = Math.floor(worldLeft / GRID) * GRID, startY = Math.floor(worldTop / GRID) * GRID
    for (let x = startX; x <= worldRight + GRID; x += GRID) lines.push({ key: `x${x}`, points: [x, worldTop - GRID, x, worldBottom + GRID] })
    for (let y = startY; y <= worldBottom + GRID; y += GRID) lines.push({ key: `y${y}`, points: [worldLeft - GRID, y, worldRight + GRID, y] })
    return lines
  }, [worldBottom, worldLeft, worldRight, worldTop])
  const remotePresences = [...presence.entries()].filter(([clientId, state]) => clientId !== doc.clientID && state.user && state.canvasCursor)
  const selectionRect = selectionBox ? { x: Math.min(selectionBox.start.x, selectionBox.end.x), y: Math.min(selectionBox.start.y, selectionBox.end.y), width: Math.abs(selectionBox.end.x - selectionBox.start.x), height: Math.abs(selectionBox.end.y - selectionBox.start.y) } : null
  const editing = editingId ? elements.find(element => element.id === editingId) : null

  elementActionsRef.current = {
    select: selectElement,
    beginEdit: element => { if (canEdit && (element.type === 'text' || element.type === 'sticky')) { setSelectedIds([element.id]); setEditingId(element.id) } },
    dragStart: startDrag,
    dragMove: moveDrag,
    dragEnd: endDrag,
    register: (id, node) => { nodeRefs.current[id] = node },
    cursor: value => { const stage = stageRef.current; if (stage && !dragOrigin.current) stage.container().style.cursor = value },
  }


  return <div className="canvas-wrap" ref={wrapperRef}
    onDragOver={event => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }}
    onDrop={event => { event.preventDefault(); const rect = wrapperRef.current!.getBoundingClientRect(); const point = { x: (event.clientX - rect.left - viewport.x) / viewport.scale, y: (event.clientY - rect.top - viewport.y) / viewport.scale }; void importFiles(event.dataTransfer.files, point) }}>
    <div className="canvas-toolbar" role="toolbar" aria-label="Outils du tableau">
      <ToolButton active={tool === 'select'} label="Sélection" onClick={() => setTool('select')}><MousePointer2 /></ToolButton>
      <ToolButton active={tool === 'hand'} label="Déplacer" onClick={() => setTool('hand')}><Hand /></ToolButton><span className="toolbar-separator" />
      <ToolButton disabled={!canEdit} active={tool === 'sticky'} label="Note" onClick={() => setTool('sticky')}><StickyNote /></ToolButton>
      <ToolButton disabled={!canEdit} active={tool === 'text'} label="Texte" onClick={() => setTool('text')}><Type /></ToolButton>
      <ToolButton disabled={!canEdit} active={tool === 'rect'} label="Rectangle" onClick={() => setTool('rect')}><Square /></ToolButton>
      <ToolButton disabled={!canEdit} active={tool === 'ellipse'} label="Ellipse" onClick={() => setTool('ellipse')}><CircleIcon /></ToolButton>
      <ToolButton disabled={!canEdit} active={tool === 'draw'} label="Stylo" onClick={() => setTool('draw')}><Pencil /></ToolButton>
      <ToolButton disabled={!canEdit} active={tool === 'highlighter'} label="Surligneur" onClick={() => setTool('highlighter')}><Highlighter /></ToolButton>
      <ToolButton disabled={!canEdit} active={tool === 'arrow'} label="Flèche" onClick={() => setTool('arrow')}><MoveRight /></ToolButton>
      <ToolButton disabled={!canEdit} label="Images ou PDF" onClick={() => fileInputRef.current?.click()}><ImagePlus /></ToolButton>
      <input ref={fileInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,application/pdf" multiple onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = '' }} />
      <span className="toolbar-separator" />
      <ToolButton disabled={!canEdit || selectedIds.length < 2} label="Grouper" onClick={groupSelection}><GroupIcon /></ToolButton>
      <ToolButton disabled={!canEdit || !selected.some(element => element.groupId)} label="Dégrouper" onClick={ungroupSelection}><Ungroup /></ToolButton>
      <ToolButton disabled={!canEdit || !selectedIds.length} label="Arrière-plan" onClick={() => layerMove('back')}><SendToBack /></ToolButton>
      <ToolButton disabled={!canEdit || !selectedIds.length} label="Reculer" onClick={() => layerMove('backward')}><ArrowDownToLine /></ToolButton>
      <ToolButton disabled={!canEdit || !selectedIds.length} label="Avancer" onClick={() => layerMove('forward')}><ArrowUpFromLine /></ToolButton>
      <ToolButton disabled={!canEdit || !selectedIds.length} label="Premier plan" onClick={() => layerMove('front')}><BringToFront /></ToolButton>
      <ToolButton active={snapEnabled} label="Magnétisme" onClick={() => setSnapEnabled(value => !value)}><Magnet /></ToolButton>
      <ToolButton disabled={!canEdit} label="Annuler" onClick={() => undoManager.undo()}><Undo2 /></ToolButton>
      <ToolButton disabled={!canEdit} label="Rétablir" onClick={() => undoManager.redo()}><Redo2 /></ToolButton>
    </div>

    {(tool === 'draw' || tool === 'highlighter') && <div className="canvas-subtoolbar">
      <label>Taille <input type="range" min={tool === 'draw' ? 1 : 8} max={tool === 'draw' ? 32 : 64} value={tool === 'draw' ? pen.size : highlighter.size} onChange={event => tool === 'draw' ? setPen(value => ({ ...value, size: Number(event.target.value) })) : setHighlighter(value => ({ ...value, size: Number(event.target.value) }))} /></label>
      <input aria-label="Couleur" type="color" value={tool === 'draw' ? pen.color : highlighter.color} onChange={event => tool === 'draw' ? setPen(value => ({ ...value, color: event.target.value })) : setHighlighter(value => ({ ...value, color: event.target.value }))} />
      <label>Opacité <input type="range" min="5" max="100" value={(tool === 'draw' ? pen.opacity : highlighter.opacity) * 100} onChange={event => tool === 'draw' ? setPen(value => ({ ...value, opacity: Number(event.target.value) / 100 })) : setHighlighter(value => ({ ...value, opacity: Number(event.target.value) / 100 }))} /></label>
    </div>}
    {tool === 'text' && <div className="canvas-subtoolbar text-subtoolbar">
      <select aria-label="Police" value={textStyle.fontFamily} onChange={event => setTextStyle(value => ({ ...value, fontFamily: event.target.value }))}><option>Inter, system-ui, sans-serif</option><option>Arial, sans-serif</option><option>Georgia, serif</option><option>Courier New, monospace</option><option>Verdana, sans-serif</option></select>
      <label>Taille <input type="number" min="10" max="96" value={textStyle.fontSize} onChange={event => setTextStyle(value => ({ ...value, fontSize: Number(event.target.value) }))} /></label>
      <input aria-label="Couleur du texte" type="color" value={textStyle.color} onChange={event => setTextStyle(value => ({ ...value, color: event.target.value }))} />
      <label><input type="checkbox" checked={textStyle.backgroundEnabled} onChange={event => setTextStyle(value => ({ ...value, backgroundEnabled: event.target.checked }))} /> Fond</label>
      {textStyle.backgroundEnabled && <input aria-label="Couleur du fond" type="color" value={textStyle.background} onChange={event => setTextStyle(value => ({ ...value, background: event.target.value }))} />}
    </div>}

    <div className="zoom-controls"><button onClick={() => zoomCenter(0.9)}>−</button><span>{Math.round(viewport.scale * 100)} %</span><button onClick={() => zoomCenter(1.1)}>+</button></div>
    <div className={`canvas-performance ${performanceProfile.mode}`} title="Objets rendus / objets du tableau">{visibleElements.length}/{elements.length} · {performanceProfile.mode}</div>
    {busy && <div className="canvas-status"><span>{busy}</span>{importCancelable && <button type="button" onClick={cancelActiveImport}>Annuler</button>}</div>}
    <Stage ref={stageRef} width={size.width} height={size.height} x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale} draggable={tool === 'hand'} onDragEnd={event => setViewport(current => ({ ...current, x: event.target.x(), y: event.target.y() }))} onMouseDown={handleStageDown} onTouchStart={handleStageDown} onMouseMove={handleStageMove} onTouchMove={handleTouchMove} onMouseUp={handleStageUp} onTouchEnd={handleStageUp} onMouseLeave={() => scheduleCursor(null)} onWheel={onWheel}>
      <Layer>
        <Rect
          name="canvas-background"
          x={worldLeft - GRID}
          y={worldTop - GRID}
          width={worldRight - worldLeft + GRID * 2}
          height={worldBottom - worldTop + GRID * 2}
          fill="rgba(255,255,255,0.001)"
          listening
          perfectDrawEnabled={false}
        />
      </Layer>
      <Layer listening={false}>{gridLines.map(line => <Line key={line.key} points={line.points} stroke="#cbd5e1" strokeWidth={0.55 / viewport.scale} opacity={0.75} perfectDrawEnabled={false} />)}</Layer>
      <Layer>{staticElements.map(element => <BoardElementNode key={element.id} element={element} boardId={boardId} canEdit={canEdit} tool={tool} perfectDraw={performanceProfile.perfectDraw} shadows={performanceProfile.shadows} actionsRef={elementActionsRef} />)}</Layer>
      <Layer>
        {interactionElements.map(element => <BoardElementNode key={element.id} element={element} boardId={boardId} canEdit={canEdit} tool={tool} perfectDraw={performanceProfile.perfectDraw} shadows={performanceProfile.shadows} actionsRef={elementActionsRef} />)}
        {draft && (draft.type === 'arrow'
          ? <Arrow ref={(node: Konva.Arrow | null) => { draftNodeRef.current = node }} x={draft.x} y={draft.y} points={draft.points} stroke={draft.stroke} fill={draft.stroke} strokeWidth={draft.strokeWidth} opacity={draft.opacity} pointerLength={12} pointerWidth={12} lineCap="round" lineJoin="round" listening={false} perfectDrawEnabled={false} />
          : <Line ref={(node: Konva.Line | null) => { draftNodeRef.current = node }} x={draft.x} y={draft.y} points={draft.points} stroke={draft.stroke} strokeWidth={draft.strokeWidth} opacity={draft.opacity} tension={draft.type === 'draw' ? 0.35 : 0} lineCap={draft.type === 'draw' ? 'round' : 'square'} lineJoin={draft.type === 'draw' ? 'round' : 'bevel'} globalCompositeOperation={draft.type === 'highlighter' ? 'multiply' : 'source-over'} listening={false} perfectDrawEnabled={false} />)}
        {selectionRect && <Rect {...selectionRect} fill="rgba(124,58,237,.10)" stroke="#7c3aed" strokeWidth={1.5 / viewport.scale} dash={[6 / viewport.scale, 4 / viewport.scale]} listening={false} perfectDrawEnabled={false} />}
        {selectedIds.length > 0 && canEdit && <Transformer ref={transformerRef} rotateEnabled rotateAnchorOffset={30} rotateAnchorCursor="crosshair" enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']} anchorSize={12} borderStroke="#7c3aed" anchorStroke="#7c3aed" anchorFill="#ffffff" flipEnabled={false} boundBoxFunc={(oldBox, newBox) => newBox.width < 20 || newBox.height < 20 ? oldBox : newBox} onTransformEnd={() => {
          doc.transact(() => selectedIds.forEach(id => {
            const node = nodeRefs.current[id], current = migrateElement(map.get(id)); if (!node || !current) return
            const scaleX = node.scaleX(), scaleY = node.scaleY(); node.scale({ x: 1, y: 1 })
            if (current.type === 'draw' || current.type === 'highlighter' || current.type === 'arrow') {
              const points = (current.points ?? []).map((value, index) => value * (index % 2 === 0 ? scaleX : scaleY))
              map.set(id, { ...current, x: snap(node.x(), snapEnabled), y: snap(node.y(), snapEnabled), rotation: node.rotation(), points, width: Math.max(1, current.width * Math.abs(scaleX)), height: Math.max(1, current.height * Math.abs(scaleY)) })
            } else map.set(id, { ...current, x: snap(node.x(), snapEnabled), y: snap(node.y(), snapEnabled), rotation: node.rotation(), width: Math.max(20, current.width * Math.abs(scaleX)), height: Math.max(20, current.height * Math.abs(scaleY)) })
          }))
        }} />}
      </Layer>
      <Layer listening={false}>
        {remotePresences.map(([clientId, state]) => <Group key={clientId} x={state.canvasCursor!.x} y={state.canvasCursor!.y} listening={false}><Line points={[0, 0, 0, 20, 5, 15, 10, 26, 14, 24, 9, 13, 17, 13]} closed fill={state.user!.color} stroke="white" strokeWidth={1.5} perfectDrawEnabled={false} /><Rect x={14} y={18} height={24} width={Math.max(58, state.user!.username.length * 8 + 18)} fill={state.user!.color} cornerRadius={7} perfectDrawEnabled={false} /><KonvaText x={23} y={24} text={state.user!.username} fontSize={12} fill="white" perfectDrawEnabled={false} /></Group>)}
      </Layer>
    </Stage>

    <div className="canvas-rich-overlays" aria-live="polite">
      {visibleElements.filter(element => (element.type === 'text' || element.type === 'sticky') && element.richTextField).map(element => {
        const style = overlayStyle(element, viewport)
        return editingId === element.id ? <CanvasTextEditor key={element.id} doc={doc} field={element.richTextField!} initialText={element.legacyText} style={style} onClose={() => setEditingId(null)} /> : <div key={element.id} className={`canvas-rich-text ${element.type}`} style={{ ...style, pointerEvents: 'none', fontFamily: element.fontFamily, fontSize: element.fontSize ? element.fontSize * viewport.scale : undefined, color: element.textColor }}><RichTextContent doc={doc} field={element.richTextField!} fallbackText={element.legacyText} /></div>
      })}
    </div>
    {pdfDialog && <PdfImportDialog file={pdfDialog.file} onConfirm={options => closePdfDialog(options)} onCancel={() => closePdfDialog(null)} />}
  </div>
}

function overlayStyle(element: BoardElement, viewport: { x: number; y: number; scale: number }): CSSProperties {
  const padding = element.type === 'sticky' ? 14 : 4
  return {
    position: 'absolute', left: viewport.x + (element.x + padding) * viewport.scale, top: viewport.y + (element.y + padding) * viewport.scale,
    width: Math.max(20, (element.width - padding * 2) * viewport.scale), height: Math.max(20, (element.height - padding * 2) * viewport.scale),
    transform: `rotate(${element.rotation}deg)`, transformOrigin: `${-padding * viewport.scale}px ${-padding * viewport.scale}px`,
    fontFamily: element.fontFamily, fontSize: (element.fontSize ?? 18) * viewport.scale, color: element.textColor, opacity: element.opacity,
    overflow: 'auto', zIndex: 20 + element.zIndex,
  }
}

type BoardElementNodeProps = {
  element: BoardElement
  boardId: string
  canEdit: boolean
  tool: Tool
  perfectDraw: boolean
  shadows: boolean
  actionsRef: { current: ElementActions | null }
}

const BoardElementNode = memo(function BoardElementNode({ element, boardId, canEdit, tool, perfectDraw, shadows, actionsRef }: BoardElementNodeProps) {
  const actions = actionsRef.current
  const common = {
    id: element.id, x: element.x, y: element.y, rotation: element.rotation, opacity: element.opacity,
    draggable: canEdit && tool === 'select' && !element.locked,
    perfectDrawEnabled: perfectDraw,
    onClick: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => actionsRef.current?.select(element, event),
    onTap: (event: Konva.KonvaEventObject<TouchEvent>) => actionsRef.current?.select(element, event),
    onDblClick: () => actionsRef.current?.beginEdit(element),
    onDblTap: () => actionsRef.current?.beginEdit(element),
    onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => actionsRef.current?.dragStart(element, event),
    onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => actionsRef.current?.dragMove(element, event),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => actionsRef.current?.dragEnd(event),
    onMouseEnter: () => { if (tool === 'select') actionsRef.current?.cursor('move') },
    onMouseLeave: () => actionsRef.current?.cursor('default'),
    ref: (node: Konva.Node | null) => actionsRef.current?.register(element.id, node),
  }
  if (!actions) return null
  if (element.type === 'sticky' || element.type === 'text') return <Rect {...common} width={element.width} height={element.height} fill={element.backgroundEnabled ? element.fill ?? '#ffffff' : 'rgba(255,255,255,0.001)'} stroke={element.type === 'sticky' ? element.stroke : undefined} strokeWidth={element.type === 'sticky' ? 1.5 : 0} cornerRadius={element.type === 'sticky' ? 8 : 0} shadowColor="#1f2937" shadowOpacity={element.type === 'sticky' && shadows ? 0.12 : 0} shadowBlur={shadows ? 12 : 0} shadowOffsetY={shadows ? 5 : 0} />
  if (element.type === 'rect') return <Rect {...common} width={element.width} height={element.height} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} cornerRadius={14} />
  if (element.type === 'ellipse') return <Ellipse {...common} radiusX={element.width / 2} radiusY={element.height / 2} offsetX={-element.width / 2} offsetY={-element.height / 2} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} />
  if (element.type === 'arrow') return <Arrow {...common} points={element.points ?? []} stroke={element.stroke} fill={element.stroke} strokeWidth={element.strokeWidth} pointerLength={12} pointerWidth={12} lineCap="round" lineJoin="round" hitStrokeWidth={18} />
  if (element.type === 'draw' || element.type === 'highlighter') return <Line {...common} points={element.points ?? []} stroke={element.stroke} strokeWidth={element.strokeWidth} tension={element.type === 'draw' ? 0.35 : 0} lineCap={element.type === 'draw' ? 'round' : 'square'} lineJoin={element.type === 'draw' ? 'round' : 'bevel'} globalCompositeOperation={element.type === 'highlighter' ? 'multiply' : 'source-over'} hitStrokeWidth={Math.max(18, element.strokeWidth ?? 3)} />
  if ((element.type === 'image' || element.type === 'pdf-page') && element.assetId) return <AssetImage {...common} boardId={boardId} assetId={element.assetId} width={element.width} height={element.height} />
  return null
}, (previous, next) => previous.element === next.element && previous.boardId === next.boardId && previous.canEdit === next.canEdit && previous.tool === next.tool && previous.perfectDraw === next.perfectDraw && previous.shadows === next.shadows)

type AssetImageProps = { boardId: string; assetId: string; width: number; height: number } & Omit<ComponentProps<typeof KonvaImage>, 'image' | 'width' | 'height'>
function AssetImage(props: AssetImageProps) {
  const { boardId, assetId, width, height, ...rest } = props
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let active = true
    const thumbnail = assetUrl(boardId, assetId, 'thumbnail')
    const display = assetUrl(boardId, assetId, 'display')
    loadCachedImage(thumbnail).then(next => { if (active) setImage(next) }).catch(() => undefined)
    loadCachedImage(display).then(next => { if (active) setImage(next) }).catch(() => undefined)
    return () => { active = false }
  }, [assetId, boardId])
  return <KonvaImage {...rest} image={image ?? undefined} width={width} height={height} />
}

function ToolButton({ children, label, active, disabled, onClick }: { children: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className={`canvas-tool ${active ? 'active' : ''}`} disabled={disabled} onClick={onClick} title={label} aria-label={label}>{children}</button>
}

