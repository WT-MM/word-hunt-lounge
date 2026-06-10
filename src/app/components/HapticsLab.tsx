import { useRef, useState } from 'preact/hooks'

/**
 * /haptics — device experiments for the one unexplored haptics path on
 * iOS 26.5+: programmatic switch clicks are patched, but GENUINE knob-drag
 * interaction still buzzes. If a real touch that starts on a switch keeps
 * driving it (UISwitch semantics), and CSS transforms applied mid-gesture
 * retarget the flip threshold, we can fire haptics on demand during a trace.
 * Tests T1–T4 isolate each unknown.
 */

function applySwitchAttr(el: HTMLInputElement | null) {
  el?.setAttribute('switch', '')
}

interface FlipTestProps {
  id: string
  title: string
  instructions: string
  opacity?: number
  touchAction?: string
  note: (msg: string) => void
}

/**
 * Press-and-hold area containing a scaled switch. While held, we oscillate
 * the switch's translateX every 550ms so its flip threshold passes under
 * the (stationary) finger. Native `change` events are logged — they prove
 * the mechanism engages even if the buzz is absent.
 */
function FlipTest({ id, title, instructions, opacity = 1, touchAction = 'pan-y', note }: FlipTestProps) {
  const switchRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setInterval>>()
  const side = useRef(false)
  const [flips, setFlips] = useState(0)
  const [changes, setChanges] = useState(0)

  const start = () => {
    note(`${id}: hold started, oscillating transform`)
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      side.current = !side.current
      if (switchRef.current) {
        switchRef.current.style.transform = `translateX(${side.current ? 70 : -70}px) scale(3)`
      }
      setFlips((f) => f + 1)
    }, 550)
  }

  const stop = () => {
    clearInterval(timer.current)
    timer.current = undefined
  }

  return (
    <div class="panel stack">
      <p class="kicker" style={{ margin: 0 }}>
        {id} · {title}
      </p>
      <p class="muted" style={{ margin: 0 }}>
        {instructions}
      </p>
      <div
        onPointerDown={start}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        style={{
          height: 110,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(0,0,0,0.18)',
          borderRadius: 12,
          touchAction,
        }}
      >
        <input
          ref={(el) => {
            applySwitchAttr(el)
            ;(switchRef as { current: HTMLInputElement | null }).current = el
          }}
          type="checkbox"
          onChange={() => {
            setChanges((c) => c + 1)
            note(`${id}: NATIVE VALUE FLIP (change event)`)
          }}
          style={{ transform: 'scale(3)', opacity }}
        />
      </div>
      <p class="muted" style={{ margin: 0 }}>
        transform flips: {flips} · native value flips: <b style={{ color: 'var(--gold)' }}>{changes}</b>
      </p>
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
        Haptics lab v2
      </h2>
      <p class="muted">
        Goal: fire real haptics during a trace by retargeting a genuine knob-drag.
        Run T1 first, then T2–T4. Report buzzes + the gold counters.
      </p>

      <div class="panel stack">
        <p class="kicker" style={{ margin: 0 }}>
          T1 · knob drag baseline
        </p>
        <p class="muted" style={{ margin: 0 }}>
          Put your finger ON the knob, drag slowly right, then left, then right —
          WITHOUT lifting. (a) Does the knob follow your finger? (b) Do you feel a
          buzz EACH time it flips, or only on the first/none? Then lift, and retry
          starting your drag from the empty (track) end instead of the knob.
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

      <FlipTest
        id="T2"
        title="auto-flip under a still finger (the mechanism)"
        instructions="Press and HOLD your finger on the switch and keep it perfectly still. We slide the switch back and forth beneath it. Do you feel buzzes while holding? Watch the gold counter."
        note={note}
      />

      <FlipTest
        id="T3"
        title="same, but nearly invisible"
        instructions="Same hold-still test with the switch at 5% opacity — checks whether hiding it kills the haptic."
        opacity={0.05}
        note={note}
      />

      <FlipTest
        id="T4"
        title="same, under touch-action: none"
        instructions="Same hold-still test inside a touch-action:none container (what the game board uses). If T2 buzzes but T4 doesn't, the board needs a different touch-action strategy."
        touchAction="none"
        note={note}
      />

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
