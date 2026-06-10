/**
 * Best-effort haptics:
 * - Android Chrome: navigator.vibrate
 * - iOS Safari has no vibration API, but programmatically toggling an
 *   <input type="checkbox" switch> (iOS 17.4+) fires the system toggle
 *   haptic — the standard workaround. Only works from within a
 *   user-gesture handler, which is where we call it (pointer events).
 */
let switchInput: HTMLInputElement | null = null

function iosSwitch(): HTMLInputElement {
  if (!switchInput) {
    switchInput = document.createElement('input')
    switchInput.type = 'checkbox'
    switchInput.setAttribute('switch', '')
    switchInput.tabIndex = -1
    switchInput.setAttribute('aria-hidden', 'true')
    switchInput.style.cssText =
      'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;'
    document.body.appendChild(switchInput)
  }
  return switchInput
}

/** One light tick — fired as each tile joins the trace. */
export function hapticTick(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
      return
    }
    iosSwitch().click()
  } catch {
    /* haptics are decorative */
  }
}

/** Slightly stronger pattern for a scored word. */
export function hapticSuccess(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([12, 50, 20])
      return
    }
    iosSwitch().click()
  } catch {
    /* haptics are decorative */
  }
}
