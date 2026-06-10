/**
 * On-demand haptics in plain iOS Safari 26.5+, riding the one path Apple
 * preserved: GENUINE knob-drag interaction with <input type="checkbox"
 * switch> buzzes on every value flip within a single touch, re-evaluated on
 * touchmove (device-verified: finger crossings buzz; transforms under a
 * still finger don't).
 *
 * Mechanism: at rest the (near-invisible) switch covers the whole host, so
 * any trace's touchstart lands on it and the control owns the gesture for
 * its duration. When the game wants a haptic, pulse() parks the switch's
 * flip threshold a few px AHEAD of the finger along its motion — the very
 * next touchmove genuinely crosses it → native flip → real haptic. After
 * each flip the switch parks offscreen so nothing crosses accidentally.
 */

/** Only iOS Safari needs (and supports) this; the native shell bridge and
    Android's navigator.vibrate are better channels when present. */
export function switchHapticsApplicable(): boolean {
  try {
    const w = window as unknown as Record<string, any>
    if (w.webkit?.messageHandlers?.haptic) return false // native shell
    return (
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  } catch {
    return false
  }
}

// native rendered size of the switch control in Safari
const SWITCH_W = 51
const SWITCH_H = 31
// knob circle center when unchecked (knob sits at the left end)
const KNOB_CX = 15.5
const KNOB_CY = 15.5

export class SwitchHapticDriver {
  private host: HTMLElement
  private input: HTMLInputElement
  private lastX = 0
  private lastY = 0
  private vx = 0
  private vy = 0
  /** native value flips observed (each one should be a buzz) */
  crossings = 0
  onCross?: () => void

  // tunables (device behavior mapped empirically via /haptics):
  /** how far ahead of the finger the flip threshold is parked */
  leadPx = 12
  /** control scale at pulse time (bigger = harder to overshoot) */
  pulseScale = 1
  /** 'knob' = knob covers the host at rest; 'stretch' = whole control does */
  restMode: 'knob' | 'stretch' = 'stretch'

  constructor(host: HTMLElement) {
    this.host = host
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.setAttribute('switch', '')
    el.setAttribute('aria-hidden', 'true')
    el.tabIndex = -1
    el.style.cssText =
      'position:absolute;left:0;top:0;margin:0;opacity:0.02;z-index:5;transform-origin:0 0;'
    el.addEventListener('change', () => {
      this.crossings++
      this.park()
      this.onCross?.()
    })
    host.appendChild(el)
    this.input = el
    this.rest()
  }

  /** Debug: make the overlay visible. */
  setVisible(visible: boolean): void {
    this.input.style.opacity = visible ? '0.55' : '0.02'
  }

  /**
   * Resting: scale the switch so the KNOB ALONE covers the whole host.
   * Knob-drag mode only engages when the touch starts on the knob —
   * starting on the empty track arms tap-mode, where crossings don't
   * register. With the knob covering everything, every trace engages drag.
   */
  rest(): void {
    this.input.checked = false // knob parks at the left end
    const w = this.host.clientWidth || SWITCH_W
    const h = this.host.clientHeight || SWITCH_H
    if (this.restMode === 'knob') {
      const s = Math.max(w, h) / 22 // knob diameter ≈ 27px native; oversize it
      const tx = w / 2 - KNOB_CX * s
      const ty = h / 2 - KNOB_CY * s
      this.input.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
    } else {
      this.input.style.transform = `scale(${w / SWITCH_W}, ${h / SWITCH_H})`
    }
  }

  /** Trace started (host-relative coords). */
  begin(x: number, y: number): void {
    this.lastX = x
    this.lastY = y
    this.vx = 0
    this.vy = 0
    this.park()
  }

  /** Call on every pointermove (host-relative coords). */
  track(x: number, y: number): void {
    this.vx = x - this.lastX
    this.vy = y - this.lastY
    this.lastX = x
    this.lastY = y
  }

  /**
   * Ask for one haptic: park the switch's (horizontal) flip threshold just
   * ahead of the finger along its HORIZONTAL motion, so the next touchmove
   * crosses it. WebKit's switch drag recognizer tracks screen-horizontal
   * displacement only — it ignores CSS rotation — so a purely vertical
   * finger move can't trigger a flip and is skipped here rather than faked.
   */
  pulse(): void {
    // horizontal recognizer only; near-vertical moves have no crossing to
    // make and are skipped (the oscillation experiment that tried to fake
    // them throttled haptics and lagged the trace — not worth it)
    if (Math.abs(this.vx) < 0.4) return
    const dirX = this.vx > 0 ? 1 : -1
    const cx = this.lastX + dirX * this.leadPx
    this.input.checked = dirX < 0 // knob trails the motion
    this.input.style.transform =
      `translate(${cx}px, ${this.lastY}px) scale(${this.pulseScale}) translate(${-SWITCH_W / 2}px, ${-SWITCH_H / 2}px)`
  }

  /** Park offscreen so nothing crosses until the next pulse(). */
  private park(): void {
    this.input.style.transform = 'translate(-9999px, -9999px)'
  }

  /** Trace ended — restore full coverage for the next touchstart. */
  end(): void {
    this.rest()
  }

  destroy(): void {
    this.input.remove()
  }
}
