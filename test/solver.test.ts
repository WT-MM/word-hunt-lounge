import { describe, expect, it } from 'vitest'
import { compileTrie } from '../src/shared/trie'
import { solveBoard } from '../src/shared/solver'

// Fixture board (indices left-to-right, top-to-bottom):
//   c  a  t  s
//   o  x  e  r
//   m  d  o  qu
//   e  n  g  a
const TILES = ['c', 'a', 't', 's', 'o', 'x', 'e', 'r', 'm', 'd', 'o', 'qu', 'e', 'n', 'g', 'a']

const DICT = ['cat', 'cats', 'axe', 'tax', 'dog', 'god', 'quod', 'oxo', 'ten', 'tat', 'at']
const trie = compileTrie(DICT)

describe('solveBoard', () => {
  const found = solveBoard(TILES, trie)

  it('finds exactly the traceable words', () => {
    expect(new Set(found.keys())).toEqual(
      new Set(['cat', 'cats', 'axe', 'tax', 'dog', 'god', 'quod', 'oxo']),
    )
  })

  it('handles the qu digraph as one tile worth two letters', () => {
    expect(found.get('quod')).toBe(400) // 4 letters via 3 tiles
  })

  it('does not find words requiring non-adjacent steps', () => {
    expect(found.has('ten')).toBe(false) // t,e,n all present but n is not adjacent to e
  })

  it('does not reuse tiles', () => {
    expect(found.has('tat')).toBe(false) // single t on the board
  })

  it('ignores words shorter than 3 letters', () => {
    expect(found.has('at')).toBe(false) // traceable but too short
  })

  it('scores by word length', () => {
    expect(found.get('cat')).toBe(100)
    expect(found.get('cats')).toBe(400)
  })
})
