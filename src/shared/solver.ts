import { childGroup, findChild, isTerminal } from './trie'
import { MIN_WORD_LENGTH, wordScore } from './score'

export const BOARD_SIZE = 4
export const TILE_COUNT = BOARD_SIZE * BOARD_SIZE

/** 8-directional neighbors for each tile index on the 4x4 grid. */
export const NEIGHBORS: ReadonlyArray<ReadonlyArray<number>> = (() => {
  const all: number[][] = []
  for (let i = 0; i < TILE_COUNT; i++) {
    const row = Math.floor(i / BOARD_SIZE)
    const col = i % BOARD_SIZE
    const near: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const r = row + dr
        const c = col + dc
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) near.push(r * BOARD_SIZE + c)
      }
    }
    all.push(near)
  }
  return all
})()

/**
 * All dictionary words traceable on the board, with their scores.
 * Tiles may be multi-letter ('qu'). ~2ms CPU on a typical board.
 */
export function solveBoard(tiles: ReadonlyArray<string>, trie: Uint32Array): Map<string, number> {
  const found = new Map<string, number>()

  const dfs = (tile: number, group: number, word: string, mask: number) => {
    let g = group
    let entry = -1
    for (let i = 0; i < tiles[tile].length; i++) {
      const index = findChild(trie, g, tiles[tile].charCodeAt(i) - 97)
      if (index < 0) return
      entry = trie[index]
      g = childGroup(entry)
    }
    const next = word + tiles[tile]
    const nextMask = mask | (1 << tile)
    if (isTerminal(entry) && next.length >= MIN_WORD_LENGTH) {
      found.set(next, wordScore(next.length))
    }
    if (g < 0) return
    for (const n of NEIGHBORS[tile]) {
      if (!(nextMask & (1 << n))) dfs(n, g, next, nextMask)
    }
  }

  for (let i = 0; i < TILE_COUNT; i++) dfs(i, 0, '', 0)
  return found
}
