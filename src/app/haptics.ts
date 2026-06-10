/**
 * Best-effort haptics:
 * - iOS Safari has no vibration API. Workaround (iOS 17.4+): toggling an
 *   <input type="checkbox" switch> fires the system toggle haptic. The
 *   element must NOT be hidden (display:none / opacity:0 / pointer-events:
 *   none can suppress it), so we create a fresh bare element, click it, and
 *   remove it synchronously — it exists within one task and never paints.
 * - Elsewhere: navigator.vibrate.
 */
const IOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

function iosImpulse(): void {
  const el = document.createElement('input')
  el.type = 'checkbox'
  el.setAttribute('switch', '')
  document.body.appendChild(el)
  el.click()
  el.remove()
}

function impulse(ms: number): void {
  try {
    if (IOS) {
      iosImpulse()
      return
    }
    if ('vibrate' in navigator) navigator.vibrate(ms)
  } catch {
    /* haptics are decorative */
  }
}

/** One light tick — fired as each tile joins the trace. */
export function hapticTick(): void {
  impulse(10)
}

/** Slightly stronger double pulse for a scored word. */
export function hapticSuccess(): void {
  impulse(15)
  setTimeout(() => impulse(20), 90)
}
