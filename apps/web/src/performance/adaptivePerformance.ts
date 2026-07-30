import { useEffect, useMemo, useState } from 'react'

export type PerformanceMode = 'quality' | 'balanced' | 'economy'

type DeviceNavigator = Navigator & { deviceMemory?: number }

export function useAdaptivePerformance(totalElements: number, visibleElements: number) {
  const [longTaskPressure, setLongTaskPressure] = useState(0)
  useEffect(() => {
    if (!('PerformanceObserver' in window)) return
    let observer: PerformanceObserver | undefined
    try {
      observer = new PerformanceObserver(list => {
        const severe = list.getEntries().filter(entry => entry.duration >= 80).length
        if (severe) setLongTaskPressure(value => Math.min(10, value + severe))
      })
      observer.observe({ entryTypes: ['longtask'] })
      const timer = window.setInterval(() => setLongTaskPressure(value => Math.max(0, value - 1)), 5000)
      return () => { observer?.disconnect(); window.clearInterval(timer) }
    } catch { return }
  }, [])

  return useMemo(() => {
    const memory = (navigator as DeviceNavigator).deviceMemory ?? 8
    const economy = visibleElements > 1200 || totalElements > 25_000 || memory <= 2 || longTaskPressure >= 4
    const balanced = economy || visibleElements > 500 || totalElements > 8_000 || memory <= 4 || longTaskPressure >= 2
    const mode: PerformanceMode = economy ? 'economy' : balanced ? 'balanced' : 'quality'
    return {
      mode,
      pixelRatio: economy ? 1 : Math.min(window.devicePixelRatio || 1, balanced ? 1.5 : 2),
      shadows: mode === 'quality',
      perfectDraw: mode === 'quality',
      remoteCursorHz: economy ? 20 : balanced ? 30 : 40,
    }
  }, [longTaskPressure, totalElements, visibleElements])
}
