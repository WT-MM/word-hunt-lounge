import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

export function Spinner() {
  return <div class="spinner" />
}

export function useToast(): [ComponentChildren, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const show = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2200)
  }, [])
  const el = msg ? <div class="toast">{msg}</div> : null
  return [el, show]
}

/** Re-render every `ms` while the document is visible (poll driver). */
export function usePoll(fn: () => void, ms: number, active: boolean) {
  useEffect(() => {
    if (!active) return
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id === null) id = setInterval(fn, ms)
    }
    const stop = () => {
      if (id !== null) {
        clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        fn()
        start()
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fn, ms, active])
}

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'now'
  const m = Math.ceil(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return `${d}d ${h % 24}h`
  return `${h}h ${m % 60}m`
}

export function modeBadge(mode: 'casual' | 'ranked') {
  return <span class={`badge ${mode}`}>{mode === 'ranked' ? '★ Ranked' : 'Casual'}</span>
}

export function deltaChip(delta: number | null) {
  if (delta === null) return null
  return (
    <span class={`delta ${delta >= 0 ? 'up' : 'down'}`}>
      {delta >= 0 ? '+' : ''}
      {delta}
    </span>
  )
}
