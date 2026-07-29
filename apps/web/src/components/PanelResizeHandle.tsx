import { useEffect, type PointerEvent as ReactPointerEvent } from 'react'

const STORAGE_KEY = 'spletch.panelWidth'

export function useSavedPanelWidth() {
  useEffect(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(stored) && stored >= 360) {
      document.documentElement.style.setProperty('--panel-width', `${Math.min(stored, window.innerWidth * 0.7)}px`)
    }
  }, [])
}

export function PanelResizeHandle() {
  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 1023) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(360, Math.min(window.innerWidth * 0.7, window.innerWidth - moveEvent.clientX))
      document.documentElement.style.setProperty('--panel-width', `${width}px`)
      localStorage.setItem(STORAGE_KEY, String(Math.round(width)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  return <div className="panel-resize-handle" onPointerDown={start} role="separator" aria-orientation="vertical" aria-label="Redimensionner le panneau" />
}
