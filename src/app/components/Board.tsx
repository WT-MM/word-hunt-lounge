import { useRef, useState } from 'preact/hooks'
import { isAdjacent } from '../../shared/path'

export interface Flash {
  path: number[]
  kind: 'valid' | 'dup' | 'invalid'
  key: number
}

interface BoardProps {
  tiles: string[]
  disabled: boolean
  flash: Flash | null
  onTrace: (path: number[]) => void
  onSubmit: (path: number[]) => void
}

/**
 * Drag-to-trace board. iOS notes: the wrap has `touch-action: none` (else
 * Safari fires pointercancel as soon as it claims the gesture), and tile hit
 * detection is pure geometry from the grid rect — pointer capture retargets
 * events, so event targets are useless. Hit zone is ~40% of a cell so
 * diagonal drags don't clip orthogonal neighbors. Sliding back onto the
 * previous tile pops the head (backtrack), like the original.
 */
export function Board({ tiles, disabled, flash, onTrace, onSubmit }: BoardProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState<number[]>([])
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null)
  const tracing = useRef(false)

  const tileAt = (clientX: number, clientY: number): number | null => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null
    const cw = rect.width / 4
    const ch = rect.height / 4
    const col = Math.min(3, Math.floor(x / cw))
    const row = Math.min(3, Math.floor(y / ch))
    const cx = (col + 0.5) * cw
    const cy = (row + 0.5) * ch
    const radius = Math.min(cw, ch) * 0.4
    if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) return null
    return row * 4 + col
  }

  const svgPoint = (clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((clientX - rect.left) / rect.width) * 400, y: ((clientY - rect.top) / rect.height) * 400 }
  }

  const extend = (tile: number | null, prev: number[]): number[] => {
    if (tile === null) return prev
    if (prev.length === 0) return [tile]
    const last = prev[prev.length - 1]
    if (tile === last) return prev
    if (prev.length >= 2 && tile === prev[prev.length - 2]) return prev.slice(0, -1)
    if (!prev.includes(tile) && isAdjacent(last, tile)) return [...prev, tile]
    return prev
  }

  const update = (next: number[]) => {
    setPath(next)
    onTrace(next)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (disabled) return
    tracing.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    update(extend(tileAt(e.clientX, e.clientY), []))
    setFinger(svgPoint(e.clientX, e.clientY))
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracing.current) return
    setPath((prev) => {
      const next = extend(tileAt(e.clientX, e.clientY), prev)
      if (next !== prev) onTrace(next)
      return next
    })
    setFinger(svgPoint(e.clientX, e.clientY))
  }

  const endTrace = (submit: boolean) => {
    if (!tracing.current) return
    tracing.current = false
    setFinger(null)
    setPath((prev) => {
      if (submit && prev.length >= 2) onSubmit(prev)
      onTrace([])
      return []
    })
  }

  const center = (tile: number) => ({
    x: ((tile % 4) + 0.5) * 100,
    y: (Math.floor(tile / 4) + 0.5) * 100,
  })

  const points = path.map((t) => {
    const c = center(t)
    return `${c.x},${c.y}`
  })
  if (finger && path.length > 0) points.push(`${finger.x},${finger.y}`)

  const flashClass = (i: number) =>
    flash && flash.path.includes(i) ? ` f-${flash.kind}` : ''

  return (
    <div
      class="board-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endTrace(true)}
      onPointerCancel={() => endTrace(false)}
    >
      <div class="board-grid" ref={gridRef}>
        {tiles.map((letter, i) => (
          <div key={i} class={`tile${path.includes(i) ? ' sel' : ''}${flashClass(i)}`}>
            <span>{letter}</span>
          </div>
        ))}
      </div>
      <svg class="trace" viewBox="0 0 400 400" preserveAspectRatio="none">
        {points.length >= 2 && <polyline points={points.join(' ')} stroke-width="14" />}
      </svg>
    </div>
  )
}
