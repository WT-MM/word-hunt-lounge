import { MIN_PLAYERS_TO_RATE } from '../shared/constants'
import { RATING_FLOOR, eloDeltas } from '../shared/elo'
import type { Env } from './env'
import type { LoungeRow } from './db'

/**
 * Finalize a ranked lounge past its deadline: lock standings, apply Elo.
 *
 * Concurrency: deltas are computed from a snapshot but applied RELATIVELY in
 * one atomic batch(), and every statement guards on the lounge still being
 * 'open' (the status flip is the last statement). Concurrent finalizers
 * serialize on SQLite's single writer; the loser's whole batch no-ops.
 * Rounds can never be in flight here — starts that would cross the deadline
 * are rejected (409), so every round is complete by deadline by construction.
 */
export async function maybeFinalizeLounge(
  env: Env,
  lounge: Pick<LoungeRow, 'id' | 'mode' | 'status' | 'deadline_at'>,
  now: number,
): Promise<boolean> {
  if (lounge.mode !== 'ranked' || lounge.status !== 'open') return false
  if (lounge.deadline_at === null || now < lounge.deadline_at) return false

  const db = env.DB
  const { results: entrants } = await db
    .prepare(
      `SELECT r.player_id AS id, r.score, p.rating
       FROM rounds r JOIN players p ON p.id = r.player_id
       WHERE r.lounge_id = ?`,
    )
    .bind(lounge.id)
    .all<{ id: string; score: number; rating: number }>()

  const guard = `(SELECT status FROM lounges WHERE id = ?) = 'open'`
  const statements = []

  if (entrants.length >= MIN_PLAYERS_TO_RATE) {
    const deltas = eloDeltas(entrants)
    for (const entrant of entrants) {
      const delta = deltas.get(entrant.id) ?? 0
      // pairwise W/L/T vs every co-participant on this board — the same
      // comparison the Elo uses, so a 2nd-of-4 finish records 2W/1L
      let wins = 0
      let losses = 0
      let ties = 0
      for (const other of entrants) {
        if (other.id === entrant.id) continue
        if (entrant.score > other.score) wins++
        else if (entrant.score < other.score) losses++
        else ties++
      }
      statements.push(
        db
          .prepare(
            `UPDATE players
             SET rating = MAX(?, rating + ?), games_played = games_played + 1,
                 wins = wins + ?, losses = losses + ?, ties = ties + ?
             WHERE id = ? AND ${guard}`,
          )
          .bind(RATING_FLOOR, delta, wins, losses, ties, entrant.id, lounge.id),
        db
          .prepare(
            `INSERT INTO rating_events (id, lounge_id, player_id, delta, created_at)
             SELECT ?, ?, ?, ?, ? WHERE ${guard}`,
          )
          .bind(crypto.randomUUID(), lounge.id, entrant.id, delta, now, lounge.id),
      )
    }
  }
  statements.push(
    db
      .prepare(`UPDATE lounges SET status = 'finalized', finalized_at = ? WHERE id = ? AND status = 'open'`)
      .bind(now, lounge.id),
  )
  await db.batch(statements)
  return true
}

/**
 * Lazy-finalization backstop (no cron): called from /api/me and lounge
 * creation so no expired ranked lounge can stay open forever and ratings are
 * fresh before being displayed or before a new ranked match starts.
 */
export async function sweepExpiredLounges(env: Env, now: number): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, mode, status, deadline_at FROM lounges
     WHERE status = 'open' AND deadline_at IS NOT NULL AND deadline_at < ?
     LIMIT 5`,
  )
    .bind(now)
    .all<Pick<LoungeRow, 'id' | 'mode' | 'status' | 'deadline_at'>>()
  for (const lounge of results) {
    await maybeFinalizeLounge(env, lounge, now)
  }
}
