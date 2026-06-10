/**
 * Synthesized game sounds (no assets, Web Audio). On iOS 26 Safari shipped
 * no path to system haptics at all (verified on-device: even a real switch
 * control doesn't buzz), so audio carries the game feel there. The original
 * Word Hunt's signature is a per-tile tick that RISES in pitch as the word
 * grows — replicated here.
 */
let ctx: AudioContext | null = null
let enabled = typeof localStorage !== 'undefined' && localStorage.getItem('whl.sound') !== '0'

export function soundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
  localStorage.setItem('whl.sound', on ? '1' : '0')
  if (on) unlock()
}

/** Must be called from a user gesture (we use pointerdown on the board). */
export function unlock(): void {
  if (!enabled) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* no audio */
  }
}

function blip(
  freqFrom: number,
  freqTo: number,
  ms: number,
  delayMs = 0,
  peak = 0.05,
  type: OscillatorType = 'triangle',
): void {
  if (!enabled || !ctx || ctx.state !== 'running') return
  try {
    const t0 = ctx.currentTime + delayMs / 1000
    const t1 = t0 + ms / 1000
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freqFrom, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t1)
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.02)
  } catch {
    /* no audio */
  }
}

export const sound = {
  /** Per-tile tick; pitch climbs with the trace length. */
  tick(step: number): void {
    const base = 440 + Math.min(step, 12) * 60
    blip(base, base * 1.3, 55, 0, 0.045)
  },
  /** New valid word: quick two-note rise. */
  success(): void {
    blip(660, 680, 70, 0, 0.06)
    blip(980, 1020, 110, 70, 0.06)
  },
  /** Already found: flat mid thunk. */
  dup(): void {
    blip(330, 300, 80, 0, 0.04)
  },
  /** Not a word: low dud. */
  invalid(): void {
    blip(190, 130, 100, 0, 0.045, 'sine')
  },
}
