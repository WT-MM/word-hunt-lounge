/**
 * Best-effort haptics:
 * - iOS Safari has no vibration API. Workaround (iOS 17.4+): toggling an
 *   <input type="checkbox" switch> fires the system toggle haptic. The
 *   reliable invocation (per the ios-haptics library): wrap it in a
 *   <label> appended to document.head — head children never render, so
 *   nothing can flag them hidden — and click the LABEL, synchronously.
 * - Elsewhere: navigator.vibrate.
 * Visit /haptics for a device test page.
 */
const IOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

function iosImpulse(): void {
  const label = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  label.appendChild(input)
  document.head.appendChild(label)
  label.click()
  document.head.removeChild(label)
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
