/**
 * Best-effort haptics:
 *
 * 1. Native bridge — when running inside the ios/ WKWebView shell, a
 *    `haptic` message handler drives the real Taptic Engine
 *    (UIImpactFeedbackGenerator). This is the only true-haptics path on
 *    modern iOS: Safari has no vibration API, and Apple patched the
 *    checkbox-switch click() loophole in iOS 26.5 (verified on-device —
 *    a real finger-flicked switch buzzes, programmatic clicks don't),
 *    so we don't burn pointermove time attempting it directly.
 * 2. navigator.vibrate — Android Chrome.
 * 3. Plain iOS Safari 18+ uses the genuine switch-drag mechanism in
 *    switch-haptics.ts; that path has to retain ownership of the touch.
 *
 * Sound remains the fallback when none of those channels is available.
 */
interface HapticBridge {
  postMessage(kind: string): void
}

const bridge: HapticBridge | null = (() => {
  try {
    return (
      (window as unknown as Record<string, any>).webkit?.messageHandlers?.haptic ?? null
    )
  } catch {
    return null
  }
})()

function impulse(kind: 'tick' | 'success', pattern: number | number[]): void {
  try {
    if (bridge) {
      bridge.postMessage(kind)
      return
    }
    if ('vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* haptics are decorative */
  }
}

/** One light tick — fired as each tile joins the trace. */
export function hapticTick(): void {
  impulse('tick', 10)
}

/** Stronger pulse for a scored word. */
export function hapticSuccess(): void {
  impulse('success', [12, 50, 20])
}
