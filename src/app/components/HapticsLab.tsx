import { useEffect, useRef, useState } from 'preact/hooks'
import { SwitchHapticDriver } from '../switch-haptics'

/**
 * /haptics — device experiments. Current state of knowledge (on-device):
 * knob-drag interaction buzzes on EVERY value flip within one touch and is
 * re-evaluated when the finger MOVES (transforms under a still finger do
 * nothing). T5 is the production-shaped prototype: invisible switch overlay
 * owns the touch; on each cell crossing we park its flip threshold just
 * ahead of the finger so the next movement crosses it.
 */

function applySwitchAttr(el: HTMLInputElement | null) {
  el?.setAttribute('switch', '')
}

function TraceStrip({ note }: { note: (msg: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const driverRef = useRef<SwitchHapticDriver | null>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const cellRef = useRef(-1)
  const tracing = useRef(false)
  const [cells, setCells] = useState(0)
  const [flips, setFlips] = useState(0)
  const [showOverlay, setShowOverlay] = useState(false)
  const [capture, setCapture] = useState(true)
  const [lead, setLead] = useState(12)
  const [scale, setScale] = useState(1)
  const [restMode, setRestMode] = useState<'knob' | 'stretch'>('stretch')

  useEffect(() => {
    if (!hostRef.current) return
    const driver = new SwitchHapticDriver(hostRef.current)
    driver.onCross = () => {
      setFlips((f) => f + 1)
      note('T5: NATIVE FLIP — did it buzz?')
    }
    driverRef.current = driver
    return () => driver.destroy()
  }, [])

  useEffect(() => {
    driverRef.current?.setVisible(showOverlay)
  }, [showOverlay])

  useEffect(() => {
    const driver = driverRef.current
    if (!driver) return
    driver.leadPx = lead
    driver.pulseScale = scale
    driver.restMode = restMode
    driver.rest()
  }, [lead, scale, restMode])

  const rel = (e: PointerEvent) => {
    const r = rectRef.current!
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const cellAt = (x: number) => {
    const r = rectRef.current!
    return Math.max(0, Math.min(3, Math.floor((x / r.width) * 4)))
  }

  const onPointerDown = (e: PointerEvent) => {
    tracing.current = true
    rectRef.current = hostRef.current!.getBoundingClientRect()
    if (capture) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const { x, y } = rel(e)
    driverRef.current?.begin(x, y)
    cellRef.current = cellAt(x)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracing.current) return
    const { x, y } = rel(e)
    driverRef.current?.track(x, y)
    const cell = cellAt(x)
    if (cell !== cellRef.current) {
      cellRef.current = cell
      setCells((n) => n + 1)
      driverRef.current?.pulse()
    }
  }

  const endTrace = () => {
    if (!tracing.current) return
    tracing.current = false
    driverRef.current?.end()
  }

  return (
    <div class="panel stack">
      <p class="kicker" style={{ margin: 0 }}>
        T5 · the real mechanism (production setup)
      </p>
      <p class="muted" style={{ margin: 0 }}>
        Swipe slowly across the four tiles below, like tracing a word. Expected: a
        buzz each time you enter a new tile. Gold counter = native flips (each
        should buzz). Cells = tile crossings we asked haptics for.
      </p>
      <div
        ref={hostRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endTrace}
        onPointerCancel={endTrace}
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          padding: 8,
          height: 104,
          background: 'rgba(0,0,0,0.18)',
          borderRadius: 12,
          touchAction: 'none',
        }}
      >
        {['W', 'O', 'R', 'D'].map((letter) => (
          <div key={letter} class="tile" style={{ pointerEvents: 'none' }}>
            <span>{letter}</span>
          </div>
        ))}
      </div>
      <p class="muted" style={{ margin: 0 }}>
        cells: {cells} · native flips: <b style={{ color: 'var(--gold)' }}>{flips}</b> · config:
        lead {lead}px / scale {scale} / rest {restMode}
      </p>
      <div class="stack" style={{ gap: 8 }}>
        <div class="row" style={{ gap: 6 }}>
          <span class="muted" style={{ width: 52 }}>
            lead
          </span>
          {[2, 6, 12, 20].map((v) => (
            <button
              key={v}
              class={`btn btn-ghost btn-small${lead === v ? ' on' : ''}`}
              style={lead === v ? { background: 'var(--gold)', color: '#5d4524' } : {}}
              onClick={() => setLead(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div class="row" style={{ gap: 6 }}>
          <span class="muted" style={{ width: 52 }}>
            scale
          </span>
          {[0.4, 0.7, 1, 1.75, 2.5].map((v) => (
            <button
              key={v}
              class="btn btn-ghost btn-small"
              style={scale === v ? { background: 'var(--gold)', color: '#5d4524' } : {}}
              onClick={() => setScale(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div class="row" style={{ gap: 6 }}>
          <span class="muted" style={{ width: 52 }}>
            rest
          </span>
          {(['knob', 'stretch'] as const).map((v) => (
            <button
              key={v}
              class="btn btn-ghost btn-small"
              style={restMode === v ? { background: 'var(--gold)', color: '#5d4524' } : {}}
              onClick={() => setRestMode(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div class="row" style={{ gap: 16 }}>
          <label class="muted">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay((e.target as HTMLInputElement).checked)}
            />{' '}
            show overlay
          </label>
          <label class="muted">
            <input
              type="checkbox"
              checked={capture}
              onChange={(e) => setCapture((e.target as HTMLInputElement).checked)}
            />{' '}
            pointer capture
          </label>
        </div>
      </div>
    </div>
  )
}

export function HapticsLab() {
  const [log, setLog] = useState<string[]>([])
  const note = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 10))

  return (
    <div class="stack fade-in" style={{ paddingBottom: 40 }}>
      <h2 class="display" style={{ fontSize: 24, marginTop: 8 }}>
        Haptics lab v3
      </h2>
      <p class="muted">
        T5 is the one that matters now. If swiping the strip buzzes per tile, the
        game gets real haptics in plain Safari. If flips count but no buzz, report
        that. If flips stay 0, toggle "pointer capture" off and retry; then
        "show overlay" on to watch what the switch is doing.
      </p>

      <TraceStrip note={note} />

      <div class="panel stack">
        <p class="kicker" style={{ margin: 0 }}>
          T1 · baseline (for comparison)
        </p>
        <p class="muted" style={{ margin: 0 }}>
          Drag the knob side to side without lifting — buzzes per flip (known
          working).
        </p>
        <div style={{ display: 'grid', placeItems: 'center', height: 90, touchAction: 'pan-y' }}>
          <input
            ref={applySwitchAttr}
            type="checkbox"
            onChange={() => note('T1: NATIVE VALUE FLIP')}
            style={{ transform: 'scale(2.6)' }}
          />
        </div>
      </div>

      <div class="panel">
        <p class="kicker">Log</p>
        {log.length === 0 ? (
          <p class="muted">No events yet.</p>
        ) : (
          log.map((l) => (
            <p key={l} class="muted" style={{ margin: '2px 0' }}>
              {l}
            </p>
          ))
        )}
      </div>
    </div>
  )
}
