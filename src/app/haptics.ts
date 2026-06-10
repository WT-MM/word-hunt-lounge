/**
 * Best-effort haptics.
 *
 * iOS: none. Verified on-device (iOS 26.5): a real finger-flicked switch
 * control buzzes, but programmatic clicks on one do not — Apple closed the
 * iOS 17.4–18 checkbox-switch loophole by gating the haptic on genuine user
 * interaction. No invocation works, so we don't burn pointermove time on
 * DOM churn for nothing (see /haptics test page; sound.ts carries the feel).
 *
 * Android Chrome: navigator.vibrate.
 */
function vibrate(pattern: number | number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* haptics are decorative */
  }
}

/** One light tick — fired as each tile joins the trace. */
export function hapticTick(): void {
  vibrate(10)
}

/** Slightly stronger pattern for a scored word. */
export function hapticSuccess(): void {
  vibrate([12, 50, 20])
}
