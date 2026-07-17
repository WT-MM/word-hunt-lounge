import { useEffect, useRef, useState } from 'preact/hooks'
import { NEIGHBORS } from '../../shared/solver'
import { hapticTick } from '../haptics'
import { sound, unlock } from '../sound'
import { SwitchHapticDriver, switchHapticsApplicable } from '../switch-haptics'

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
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const lineRef = useRef<SVGPolylineElement>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const pathRef = useRef<number[]>([])
  const fingerRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)
  const tracing = useRef(false)
  const activePointerRef = useRef<number | null>(null)
  const driverRef = useRef<SwitchHapticDriver | null>(null)
  const [path, setPath] = useState<number[]>([])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // real Taptic haptics in plain iOS Safari via genuine switch crossings
  useEffect(() => {
    if (!wrapRef.current || !switchHapticsApplicable()) return
    const driver = new SwitchHapticDriver(wrapRef.current)
    driverRef.current = driver
    return () => {
      driver.destroy()
      driverRef.current = null
    }
  }, [])

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

  /**
   * Eager, magnetic tile pickup, evaluated against the LEGAL next tiles
   * only (adjacent + unvisited):
   *  - core: finger inside a tile's inner circle → snap unconditionally
   *  - reach: snap as soon as the finger is within ~0.62 cells of a
   *    candidate AND decisively nearer to it than to any rival candidate.
   *    No midpoint requirement — on a straight move this captures at ~38%
   *    of the way, which is what makes it feel like the tiles come to you.
   *    The rival margin keeps diagonal swipes from clipping orthogonal
   *    neighbors at corners; backtracking unwinds only inside the previous
   *    tile's tighter core (0.40), so there's hysteresis, no flicker.
   */
  const pickPath = (clientX: number, clientY: number, prev: number[]): number[] => {
    const rect = rectRef.current
    if (!rect) return prev
    const x = clientX - rect.left
    const y = clientY - rect.top
    const cw = rect.width / 4
    const ch = rect.height / 4
    const cell2 = Math.min(cw, ch) ** 2
    const dist2 = (t: number) => {
      const dx = x - ((t % 4) + 0.5) * cw
      const dy = y - (Math.floor(t / 4) + 0.5) * ch
      return dx * dx + dy * dy
    }

    if (prev.length === 0) {
      let best = -1
      let bestD = Infinity
      for (let t = 0; t < 16; t++) {
        const d = dist2(t)
        if (d < bestD) {
          best = t
          bestD = d
        }
      }
      return bestD < cell2 * 0.23 ? [best] : prev // 0.48^2
    }

    const head = prev[prev.length - 1]
    // backtrack: finger firmly over the previous tile pops the head
    if (prev.length >= 2 && dist2(prev[prev.length - 2]) < cell2 * 0.16) {
      return prev.slice(0, -1) // 0.40^2
    }

    let best = -1
    let bestD = Infinity
    let rivalD = Infinity
    for (const t of NEIGHBORS[head]) {
      if (prev.includes(t)) continue
      const d = dist2(t)
      if (d < bestD) {
        rivalD = bestD
        bestD = d
        best = t
      } else if (d < rivalD) {
        rivalD = d
      }
    }
    if (best < 0) return prev

    // Tighter zones than before: a tile only captures once the finger is
    // genuinely into it. Big zones let an orthogonal neighbor intercept a
    // diagonal swipe near the shared corner (where it sits ~0.71 cells away),
    // so diagonals "wouldn't connect" — smaller reach lets the finger slip
    // through the gap to the corner tile.
    const core2 = cell2 * 0.13 // 0.36^2 — unconditional snap
    const reach2 = cell2 * 0.2 // 0.45^2 — snap if also clearly nearest
    const decisive = bestD < reach2 && Math.sqrt(bestD) + Math.sqrt(cell2) * 0.05 < Math.sqrt(rivalD)
    if (bestD < core2 || decisive) {
      return [...prev, best]
    }
    return prev
  }

  const trackFinger = (e: PointerEvent) => {
    const rect = rectRef.current
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    fingerRef.current = { x, y }
    driverRef.current?.track(x, y)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (disabled || !e.isPrimary || activePointerRef.current !== null) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    activePointerRef.current = e.pointerId
    tracing.current = true
    unlock() // AudioContext needs a user gesture; this is the earliest one
    const rect = gridRef.current?.getBoundingClientRect() ?? null
    rectRef.current = rect
    if (rect && svgRef.current) {
      svgRef.current.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`)
      lineRef.current?.setAttribute('stroke-width', String(rect.width * 0.058))
    }
    // Touch pointers already receive implicit capture. More importantly, the
    // iOS switch driver must keep ownership of the genuine native gesture;
    // transferring capture to the wrapper prevents its value crossings (and
    // therefore its Taptic feedback). Other platforms use explicit capture.
    if (!driverRef.current) {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    const rect2 = rectRef.current
    if (rect2) driverRef.current?.begin(e.clientX - rect2.left, e.clientY - rect2.top)
    trackFinger(e)
    const first = pickPath(e.clientX, e.clientY, [])
    if (first.length > 0) {
      hapticTick()
      sound.tick(1)
    }
    apply(first)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracing.current || activePointerRef.current !== e.pointerId) return

    // Browsers may combine several high-rate touch samples into one pointer
    // event. Walk those samples in order so a fast swipe still visits every
    // legal tile, then commit once per dispatched event to keep Preact, audio,
    // and the haptic channel out of the hot path.
    const coalesced = e.getCoalescedEvents?.() ?? []
    const samples = coalesced.length > 0 ? coalesced : [e]
    let next = pathRef.current
    for (const sample of samples) {
      trackFinger(sample)
      next = pickPath(sample.clientX, sample.clientY, next)
    }

    if (next !== pathRef.current) {
      // One feedback pulse per rendered frame avoids platform throttling when
      // several tile crossings arrive together.
      hapticTick()
      driverRef.current?.pulse()
      sound.tick(next.length)
      apply(next)
    } else {
      scheduleRedraw()
    }
  }

  const endTrace = (pointerId: number, submit: boolean) => {
    if (!tracing.current || activePointerRef.current !== pointerId) return
    tracing.current = false
    activePointerRef.current = null
    fingerRef.current = null
    driverRef.current?.end()
    const final = pathRef.current
    apply([])
    if (submit && final.length >= 2) onSubmit(final)
  }

  const flashClass = (i: number) => (flash && flash.path.includes(i) ? ` f-${flash.kind}` : '')

  return (
    <div
      class="board-wrap"
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endTrace(e.pointerId, true)}
      onPointerCancel={(e) => endTrace(e.pointerId, false)}
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
