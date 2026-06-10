import { useEffect, useRef, useState } from 'preact/hooks'
import { isAdjacent } from '../../shared/path'
import { hapticTick } from '../haptics'
import { sound, unlock } from '../sound'

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
 * Drag-to-trace board, tuned for 60fps on phones:
 * - the grid rect is measured ONCE per trace (pointerdown), not per move
 * - the chunky translucent trace line (like the original Word Hunt) is drawn
 *   imperatively: pointermove writes a ref and schedules one rAF that sets
 *   the polyline's `points` attribute directly — no VDOM work per move
 * - component state only changes when the path actually changes (tile
 *   added/popped); moves inside the same tile are pure math
 * iOS notes: `touch-action: none` on the wrap (else Safari fires
 * pointercancel and kills the trace) and geometry hit detection (pointer
 * capture retargets events, so event targets are useless). Hit zone ≈ 42%
 * of a cell so diagonal drags don't clip orthogonal neighbors. Sliding back
 * onto the previous tile pops the head (backtrack).
 */
export function Board({ tiles, disabled, flash, onTrace, onSubmit }: BoardProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const lineRef = useRef<SVGPolylineElement>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const pathRef = useRef<number[]>([])
  const fingerRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)
  const tracing = useRef(false)
  const [path, setPath] = useState<number[]>([])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const redrawLine = () => {
    rafRef.current = 0
    const line = lineRef.current
    const rect = rectRef.current
    if (!line || !rect) return
    const current = pathRef.current
    if (current.length === 0) {
      line.setAttribute('points', '')
      return
    }
    const cw = rect.width / 4
    const ch = rect.height / 4
    const points = current.map((t) => `${((t % 4) + 0.5) * cw},${(Math.floor(t / 4) + 0.5) * ch}`)
    const finger = fingerRef.current
    if (finger) points.push(`${finger.x},${finger.y}`)
    line.setAttribute('points', points.join(' '))
  }

  const scheduleRedraw = () => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(redrawLine)
  }

  const apply = (next: number[]) => {
    pathRef.current = next
    setPath(next)
    onTrace(next)
    scheduleRedraw()
  }

  const tileAt = (clientX: number, clientY: number): number | null => {
    const rect = rectRef.current
    if (!rect) return null
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null
    const cw = rect.width / 4
    const ch = rect.height / 4
    const col = Math.min(3, Math.floor(x / cw))
    const row = Math.min(3, Math.floor(y / ch))
    const dx = x - (col + 0.5) * cw
    const dy = y - (row + 0.5) * ch
    const radius = Math.min(cw, ch) * 0.42
    if (dx * dx + dy * dy > radius * radius) return null
    return row * 4 + col
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

  const trackFinger = (e: PointerEvent) => {
    const rect = rectRef.current
    if (!rect) return
    fingerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: PointerEvent) => {
    if (disabled) return
    tracing.current = true
    unlock() // AudioContext needs a user gesture; this is the earliest one
    const rect = gridRef.current?.getBoundingClientRect() ?? null
    rectRef.current = rect
    if (rect && svgRef.current) {
      svgRef.current.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`)
      lineRef.current?.setAttribute('stroke-width', String(rect.width * 0.058))
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    trackFinger(e)
    const first = extend(tileAt(e.clientX, e.clientY), [])
    if (first.length > 0) {
      hapticTick()
      sound.tick(1)
    }
    apply(first)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracing.current) return
    trackFinger(e)
    const next = extend(tileAt(e.clientX, e.clientY), pathRef.current)
    if (next !== pathRef.current) {
      // per tile joined (or popped on backtrack), like the original
      hapticTick()
      sound.tick(next.length)
      apply(next)
    } else {
      scheduleRedraw()
    }
  }

  const endTrace = (submit: boolean) => {
    if (!tracing.current) return
    tracing.current = false
    fingerRef.current = null
    const final = pathRef.current
    apply([])
    if (submit && final.length >= 2) onSubmit(final)
  }

  const flashClass = (i: number) => (flash && flash.path.includes(i) ? ` f-${flash.kind}` : '')

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
      <svg class="trace" ref={svgRef} preserveAspectRatio="none">
        <polyline ref={lineRef} />
      </svg>
    </div>
  )
}
