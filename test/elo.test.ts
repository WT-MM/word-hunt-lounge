import { describe, expect, it } from 'vitest'
import { eloDeltas } from '../src/shared/elo'

describe('eloDeltas', () => {
  it('gives +16/-16 for a win between equals (K=32)', () => {
    const d = eloDeltas([
      { id: 'a', rating: 1200, score: 5000 },
      { id: 'b', rating: 1200, score: 3000 },
    ])
    expect(d.get('a')).toBe(16)
    expect(d.get('b')).toBe(-16)
  })

  it('gives zero deltas on a tie between equals', () => {
    const d = eloDeltas([
      { id: 'a', rating: 1200, score: 4000 },
      { id: 'b', rating: 1200, score: 4000 },
    ])
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(0)
  })

  it('rewards upsets more than expected wins', () => {
    const upset = eloDeltas([
      { id: 'low', rating: 1000, score: 2 },
      { id: 'high', rating: 1400, score: 1 },
    ])
    const expected = eloDeltas([
      { id: 'low', rating: 1000, score: 1 },
      { id: 'high', rating: 1400, score: 2 },
    ])
    expect(upset.get('low')!).toBeGreaterThan(16)
    expect(expected.get('high')!).toBeLessThan(16)
    expect(expected.get('high')!).toBeGreaterThan(0)
  })

  it('scales K by 1/(N-1) so a sweep of 3 equals nets ~+32 total', () => {
    const d = eloDeltas([
      { id: 'a', rating: 1200, score: 3 },
      { id: 'b', rating: 1200, score: 2 },
      { id: 'c', rating: 1200, score: 1 },
      { id: 'd', rating: 1200, score: 0 },
    ])
    // winner beats 3 equals: 3 * (32/3) * 0.5 = 16
    expect(d.get('a')).toBe(16)
    // last place loses symmetrically
    expect(d.get('d')).toBe(-16)
    // middle places net out around zero
    expect(Math.abs(d.get('b')!)).toBeLessThanOrEqual(6)
  })

  it('is zero-sum before rounding', () => {
    const d = eloDeltas([
      { id: 'a', rating: 1310, score: 9 },
      { id: 'b', rating: 1187, score: 9 },
      { id: 'c', rating: 1456, score: 3 },
    ])
    const total = [...d.values()].reduce((s, x) => s + x, 0)
    expect(Math.abs(total)).toBeLessThanOrEqual(2) // rounding slack only
  })

  it('returns zeros for fewer than 2 entrants', () => {
    expect(eloDeltas([{ id: 'a', rating: 1200, score: 1 }]).get('a')).toBe(0)
    expect(eloDeltas([]).size).toBe(0)
  })
})
