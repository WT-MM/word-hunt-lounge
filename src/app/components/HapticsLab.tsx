import { useState } from 'preact/hooks'

/**
 * Hidden device-test page (/haptics) to isolate why iOS haptics may be
 * silent: device setting vs. the programmatic trick being patched.
 */
export function HapticsLab() {
  const [log, setLog] = useState<string[]>([])
  const note = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 8))

  const labelInHead = () => {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.head.appendChild(label)
    label.click()
    document.head.removeChild(label)
    note('A: label-in-head click fired')
  }

  const inputInBody = () => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    document.body.appendChild(input)
    input.click()
    input.remove()
    note('B: input-in-body click fired')
  }

  const burst = () => {
    note('C: burst of 6 started')
    let n = 0
    const id = setInterval(() => {
      labelInHead()
      if (++n >= 6) clearInterval(id)
    }, 180)
  }

  const vibrate = () => {
    const supported = 'vibrate' in navigator
    if (supported) navigator.vibrate(30)
    note(`D: navigator.vibrate ${supported ? 'called' : 'NOT SUPPORTED'}`)
  }

  return (
    <div class="stack fade-in">
      <h2 class="display" style={{ fontSize: 24, marginTop: 8 }}>
        Haptics test
      </h2>
      <div class="panel stack">
        <p class="muted" style={{ margin: 0 }}>
          1 — Flick this real switch with your finger. If even this doesn't buzz, the
          device isn't producing system haptics at all (check Settings → Sounds &amp;
          Haptics → System Haptics, and Low Power Mode).
        </p>
        <div style={{ fontSize: 28 }}>
          <input type="checkbox" {...({ switch: '' } as Record<string, string>)} />
        </div>
      </div>
      <div class="panel stack">
        <p class="muted" style={{ margin: 0 }}>
          2 — Then try each button. Tell me which (if any) buzz.
        </p>
        <button class="btn btn-primary" onClick={labelInHead}>
          A · label in &lt;head&gt; (current method)
        </button>
        <button class="btn btn-primary" onClick={inputInBody}>
          B · bare input in &lt;body&gt;
        </button>
        <button class="btn btn-primary" onClick={burst}>
          C · burst ×6 (no tap context)
        </button>
        <button class="btn btn-primary" onClick={vibrate}>
          D · navigator.vibrate
        </button>
      </div>
      <div class="panel">
        <p class="kicker">Log</p>
        {log.length === 0 ? (
          <p class="muted">No taps yet.</p>
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
