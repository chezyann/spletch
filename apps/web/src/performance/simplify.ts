export type XY = { x: number; y: number }

function squaredDistance(a: XY, b: XY): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return dx * dx + dy * dy
}
function squaredSegmentDistance(point: XY, start: XY, end: XY): number {
  let x = start.x, y = start.y
  let dx = end.x - x, dy = end.y - y
  if (dx || dy) {
    const t = ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) { x = end.x; y = end.y }
    else if (t > 0) { x += dx * t; y += dy * t }
  }
  dx = point.x - x; dy = point.y - y
  return dx * dx + dy * dy
}

function radialSimplify(points: XY[], toleranceSq: number): XY[] {
  let previous = points[0]
  const output = [previous]
  for (let index = 1; index < points.length; index++) {
    const point = points[index]
    if (squaredDistance(point, previous) > toleranceSq) { output.push(point); previous = point }
  }
  if (previous !== points.at(-1)) output.push(points.at(-1)!)
  return output
}
function douglasPeuckerStep(points: XY[], first: number, last: number, toleranceSq: number, output: XY[]): void {
  let maxDistance = toleranceSq, index = 0
  for (let cursor = first + 1; cursor < last; cursor++) {
    const distance = squaredSegmentDistance(points[cursor], points[first], points[last])
    if (distance > maxDistance) { index = cursor; maxDistance = distance }
  }
  if (maxDistance > toleranceSq) {
    if (index - first > 1) douglasPeuckerStep(points, first, index, toleranceSq, output)
    output.push(points[index])
    if (last - index > 1) douglasPeuckerStep(points, index, last, toleranceSq, output)
  }
}
function douglasPeucker(points: XY[], toleranceSq: number): XY[] {
  const last = points.length - 1
  const output = [points[0]]
  douglasPeuckerStep(points, 0, last, toleranceSq, output)
  output.push(points[last])
  return output
}

export function simplifyFlatPoints(flat: readonly number[], tolerance = 1.5): number[] {
  if (flat.length <= 8) return [...flat]
  const points: XY[] = []
  for (let index = 0; index + 1 < flat.length; index += 2) points.push({ x: flat[index], y: flat[index + 1] })
  const toleranceSq = tolerance * tolerance
  const radial = radialSimplify(points, toleranceSq)
  const simplified = radial.length > 2 ? douglasPeucker(radial, toleranceSq) : radial
  return simplified.flatMap(point => [point.x, point.y])
}

export function normalizeFlatPoints(origin: XY, flat: readonly number[]): { x: number; y: number; width: number; height: number; points: number[] } {
  if (flat.length < 2) return { x: origin.x, y: origin.y, width: 1, height: 1, points: [0, 0] }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let index = 0; index + 1 < flat.length; index += 2) {
    minX = Math.min(minX, flat[index]); maxX = Math.max(maxX, flat[index])
    minY = Math.min(minY, flat[index + 1]); maxY = Math.max(maxY, flat[index + 1])
  }
  return {
    x: origin.x + minX,
    y: origin.y + minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    points: flat.map((value, index) => value - (index % 2 === 0 ? minX : minY)),
  }
}
