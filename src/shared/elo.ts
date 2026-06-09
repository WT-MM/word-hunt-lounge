export const STARTING_RATING = 1200
export const RATING_FLOOR = 100
const K = 32

export interface EloEntrant {
  id: string
  rating: number
  score: number
}

/**
 * N-player Elo: the match counts as every pairwise comparison, with K scaled
 * by 1/(N-1) so lobby size doesn't inflate swings. Deltas are zero-sum before
 * rounding. Apply relatively (rating = MAX(floor, rating + delta)).
 */
export function eloDeltas(entrants: ReadonlyArray<EloEntrant>): Map<string, number> {
  const raw = new Map<string, number>(entrants.map((e) => [e.id, 0]))
  if (entrants.length < 2) return raw
  const scale = K / (entrants.length - 1)
  for (let i = 0; i < entrants.length; i++) {
    for (let j = i + 1; j < entrants.length; j++) {
      const a = entrants[i]
      const b = entrants[j]
      const expected = 1 / (1 + 10 ** ((b.rating - a.rating) / 400))
      const actual = a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5
      const delta = scale * (actual - expected)
      raw.set(a.id, raw.get(a.id)! + delta)
      raw.set(b.id, raw.get(b.id)! - delta)
    }
  }
  return new Map([...raw].map(([id, d]) => [id, Math.round(d)]))
}
