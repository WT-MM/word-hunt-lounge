import { describe, expect, it } from 'vitest'
import { wordScore } from '../src/shared/score'

describe('wordScore', () => {
  it('matches the GamePigeon table', () => {
    expect(wordScore(3)).toBe(100)
    expect(wordScore(4)).toBe(400)
    expect(wordScore(5)).toBe(800)
    expect(wordScore(6)).toBe(1400)
    expect(wordScore(7)).toBe(1800)
    expect(wordScore(8)).toBe(2200)
  })

  it('adds 400 per letter past 8', () => {
    expect(wordScore(9)).toBe(2600)
    expect(wordScore(12)).toBe(3800)
  })

  it('scores nothing below 3 letters', () => {
    expect(wordScore(0)).toBe(0)
    expect(wordScore(2)).toBe(0)
  })
})
