/**
 * Hard stop on iOS Safari zoom. CSS touch-action helps but iOS still allows
 * pinch via its proprietary gesture events and double-tap-to-zoom in cases
 * touch-action misses, and it ignores `user-scalable=no`. These listeners
 * close both holes for the whole document.
 */
export function installZoomGuards(): void {
  // pinch zoom: iOS fires non-standard gesture* events; cancelling start is enough
  const cancel = (e: Event) => e.preventDefault()
  document.addEventListener('gesturestart', cancel, { passive: false })
  document.addEventListener('gesturechange', cancel, { passive: false })
  document.addEventListener('gestureend', cancel, { passive: false })

  // double-tap zoom: suppress the second tap when it lands within 300ms of the
  // first, but never for text inputs (typing) — preventDefault there would
  // block focus/caret placement
  let lastTouchEnd = 0
  document.addEventListener(
    'touchend',
    (e) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      const now = e.timeStamp
      if (now - lastTouchEnd <= 300) e.preventDefault()
      lastTouchEnd = now
    },
    { passive: false },
  )
}
