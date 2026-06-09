import { describe, expect, it } from 'vitest'
import { isAdjacent, isValidPath, wordFromPath } from '../src/shared/path'

describe('isAdjacent', () => {
  it('accepts the 8 neighbors and rejects everything else', () => {
    // tile 5 = row 1, col 1
    for (const n of [0, 1, 2, 4, 6, 8, 9, 10]) expect(isAdjacent(5, n), `5-${n}`).toBe(true)
    for (const n of [5, 3, 7, 11, 12, 15]) expect(isAdjacent(5, n), `5-${n}`).toBe(false)
  })

  it('does not wrap across rows', () => {
    expect(isAdjacent(3, 4)).toBe(false) // end of row 0 vs start of row 1
  })
})

describe('isValidPath', () => {
  it('accepts a legal snake', () => {
    expect(isValidPath([0, 1, 2, 3, 7, 11, 15])).toBe(true)
  })

  it('rejects repeats, gaps, out-of-range, and too-short paths', () => {
    expect(isValidPath([0, 1, 0])).toBe(false)
    expect(isValidPath([0, 2])).toBe(false)
    expect(isValidPath([0, 16])).toBe(false)
    expect(isValidPath([-1, 0])).toBe(false)
    expect(isValidPath([0])).toBe(false)
    expect(isValidPath([0.5, 1] as number[])).toBe(false)
  })
})

describe('wordFromPath', () => {
  it('derives the word, including multi-letter tiles', () => {
    const tiles = ['c', 'a', 't', 's', 'o', 'x', 'e', 'r', 'm', 'd', 'o', 'qu', 'e', 'n', 'g', 'a']
    expect(wordFromPath(tiles, [0, 1, 2])).toBe('cat')
    expect(wordFromPath(tiles, [11, 10, 9])).toBe('quod')
  })
})
