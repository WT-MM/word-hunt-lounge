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

// native rendered size of the switch control in Safari
const SWITCH_W = 51
const SWITCH_H = 31
// knob circle center when unchecked (knob sits at the left end)
const KNOB_CX = 15.5
const KNOB_CY = 15.5
const LEAD_PX = 2
/** pulse-time scale: widens the control so fast frame-to-frame finger jumps
    still land inside it instead of leaping clean over the threshold */
const PULSE_SCALE = 2.5

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
    const s = Math.max(w, h) / 22 // knob diameter ≈ 27px native; oversize it
    const tx = w / 2 - KNOB_CX * s
    const ty = h / 2 - KNOB_CY * s
    this.input.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
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

  /** Ask for one haptic: arm a threshold crossing just ahead of the finger. */
  pulse(): void {
    const speed = Math.hypot(this.vx, this.vy)
    if (speed < 0.5) return // no direction to lead into; skip this one
    const ux = this.vx / speed
    const uy = this.vy / speed
    const cx = this.lastX + ux * LEAD_PX
    const cy = this.lastY + uy * LEAD_PX
    const angle = Math.atan2(uy, ux)
    // knob to the local-left ("off"), so the finger sits a hair short of the
    // centerline and flips the value with its next forward movement (no
    // change event fires for programmatic .checked writes, so this is silent)
    this.input.checked = false
    this.input.style.transform =
      `translate(${cx}px, ${cy}px) rotate(${angle}rad) scale(${PULSE_SCALE}) translate(${-SWITCH_W / 2}px, ${-SWITCH_H / 2}px)`
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
