import { BOARD_SIZE, TILE_COUNT } from './solver'

export function isAdjacent(a: number, b: number): boolean {
  if (a === b) return false
  const dr = Math.abs(Math.floor(a / BOARD_SIZE) - Math.floor(b / BOARD_SIZE))
  const dc = Math.abs((a % BOARD_SIZE) - (b % BOARD_SIZE))
  return dr <= 1 && dc <= 1
}

/** Tile indices in range, no repeats, each step 8-adjacent. */
export function isValidPath(path: ReadonlyArray<number>): boolean {
  if (path.length < 2 || path.length > TILE_COUNT) return false
  const seen = new Set<number>()
  for (let i = 0; i < path.length; i++) {
    const tile = path[i]
    if (!Number.isInteger(tile) || tile < 0 || tile >= TILE_COUNT) return false
    if (seen.has(tile)) return false
    seen.add(tile)
    if (i > 0 && !isAdjacent(path[i - 1], tile)) return false
  }
  return true
}

/** The word a path spells. Clients submit paths, never word strings. */
export function wordFromPath(tiles: ReadonlyArray<string>, path: ReadonlyArray<number>): string {
  return path.map((i) => tiles[i]).join('')
}
