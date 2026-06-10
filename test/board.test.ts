import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DICE, generateBoard, isGoodBoard, rollBoard } from '../src/shared/board'
import { compileTrie, trieHas } from '../src/shared/trie'
import { solveBoard } from '../src/shared/solver'
import { MIN_WORD_LENGTH } from '../src/shared/score'

// Build the real trie from the committed word list (fast: ~150ms).
const words = readFileSync(join(__dirname, '..', 'data', 'dictionary.txt'), 'utf8')
  .split('\n')
  .map((w) => w.trim())
  .filter((w) => w.length >= MIN_WORD_LENGTH && w.length <= 17 && /^[a-z]+$/.test(w))
const trie = compileTrie(words)

describe('rollBoard', () => {
  it('is deterministic per seed and uses every die once', () => {
    const a = rollBoard(12345)
    const b = rollBoard(12345)
    expect(a).toEqual(b)
    expect(a).toHaveLength(16)
    expect(rollBoard(54321)).not.toEqual(a)

    // every tile must be a face of some die (q face surfaces as 'qu')
    const faces = new Set(DICE.flatMap((d) => d.split('').map((f) => (f === 'q' ? 'qu' : f))))
    for (const tile of a) expect(faces.has(tile), tile).toBe(true)
  })
})

describe('generateBoard with the real dictionary', () => {
  it('produces a quality board from typical seeds', () => {
    const board = generateBoard(trie, [1, 2, 3])
    expect(isGoodBoard(board.solutions)).toBe(true)
    expect(board.solutions.size).toBeGreaterThanOrEqual(80)
  })

  it('returns the best attempt even if no seed passes the gate', () => {
    const board = generateBoard(trie, [7])
    expect(board.seed).toBe(7)
    expect(board.solutions.size).toBeGreaterThan(0)
  })

  it('solves a real board to a sane word set', () => {
    const board = generateBoard(trie, [42])
    for (const [word, score] of board.solutions) {
      expect(trieHas(trie, word), word).toBe(true)
      expect(score).toBeGreaterThanOrEqual(100)
    }
    // sanity: solutions match a fresh solve of the same tiles
    expect(board.solutions).toEqual(solveBoard(board.tiles, trie))
  })
})
