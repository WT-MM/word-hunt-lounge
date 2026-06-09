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
 * Drag-to-trace board, tuned for 60fps on phones:
 * - the grid rect is measured ONCE per trace (pointerdown), not per move
 * - pointermove does pure math and only touches state when the path actually
 *   changes (a tile added/popped) — moves inside the same tile are free
 * - feedback is tile highlighting only (like the original Word Hunt);
 *   no SVG line, no filters, nothing repainting under the finger
 * iOS notes: `touch-action: none` on the wrap (else Safari fires
 * pointercancel and kills the trace) and geometry hit detection (pointer
 * capture retargets events, so event targets are useless). Hit zone ≈ 42%
 * of a cell so diagonal drags don't clip orthogonal neighbors. Sliding back
 * onto the previous tile pops the head (backtrack).
 */
export function Board({ tiles, disabled, flash, onTrace, onSubmit }: BoardProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const pathRef = useRef<number[]>([])
  const tracing = useRef(false)
  const [path, setPath] = useState<number[]>([])

  const apply = (next: number[]) => {
    pathRef.current = next
    setPath(next)
    onTrace(next)
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

  const onPointerDown = (e: PointerEvent) => {
    if (disabled) return
    tracing.current = true
    rectRef.current = gridRef.current?.getBoundingClientRect() ?? null
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    apply(extend(tileAt(e.clientX, e.clientY), []))
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracing.current) return
    const next = extend(tileAt(e.clientX, e.clientY), pathRef.current)
    if (next !== pathRef.current) apply(next)
  }

  const endTrace = (submit: boolean) => {
    if (!tracing.current) return
    tracing.current = false
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
    </div>
  )
}
