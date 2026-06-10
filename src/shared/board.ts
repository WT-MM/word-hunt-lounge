import { mulberry32 } from './rng'
import { solveBoard } from './solver'

/**
 * The 16 standard (modern) Boggle dice, with one change: like GamePigeon's
 * Word Hunt, there is no Q — the classic 'himnqu' die swaps its q for an o.
 * (The solver still supports multi-letter tiles for any old boards.)
 */
export const DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps',
  'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnou', 'hlnnrz',
]

export function rollBoard(seed: number): string[] {
  const rnd = mulberry32(seed)
  const dice = [...DICE]
  for (let i = dice.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[dice[i], dice[j]] = [dice[j], dice[i]]
  }
  return dice.map((die) => die[Math.floor(rnd() * die.length)])
}

export interface GeneratedBoard {
  tiles: string[]
  seed: number
  solutions: Map<string, number>
}

export function isGoodBoard(solutions: Map<string, number>): boolean {
  if (solutions.size < 80) return false
  for (const word of solutions.keys()) {
    if (word.length >= 6) return true
  }
  return false
}

/**
 * Roll boards until one passes the quality gate. Attempts are capped (each
 * solve costs ~2ms CPU against a 10ms budget); if none pass, the attempt
 * with the most words wins — never fails.
 */
export function generateBoard(
  trie: Uint32Array,
  seeds: ReadonlyArray<number>,
): GeneratedBoard {
  let best: GeneratedBoard | undefined
  for (const seed of seeds) {
    const tiles = rollBoard(seed)
    const solutions = solveBoard(tiles, trie)
    const candidate = { tiles, seed, solutions }
    if (isGoodBoard(solutions)) return candidate
    if (!best || solutions.size > best.solutions.size) best = candidate
  }
  if (!best) throw new Error('generateBoard: no seeds provided')
  return best
}
