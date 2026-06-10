import { MIN_PLAYERS_TO_RATE } from '../shared/constants'
import { RATING_FLOOR, STARTING_RATING, eloDeltas } from '../shared/elo'
import type { Env } from './env'
import type { LoungeRow } from './db'

/** Pairwise W/L/T for one entrant vs the rest of a field. */
function pairwiseRecord(
  entrant: { id: string; score: number },
  field: ReadonlyArray<{ id: string; score: number }>,
): { wins: number; losses: number; ties: number } {
  let wins = 0
  let losses = 0
  let ties = 0
  for (const other of field) {
    if (other.id === entrant.id) continue
    if (entrant.score > other.score) wins++
    else if (entrant.score < other.score) losses++
    else ties++
  }
  return { wins, losses, ties }
}

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
  lounge: Pick<LoungeRow, 'id' | 'mode' | 'status' | 'deadline_at' | 'group_id'>,
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
      const { wins, losses, ties } = pairwiseRecord(entrant, entrants)
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

  // Per-group ladder: a separate Elo league scoped to this group, computed
  // among the board's participants who are members of it. Upserts are guarded
  // by the same open-status check (via INSERT…SELECT…WHERE) so a losing
  // concurrent finalizer can't double-apply.
  if (lounge.group_id) {
    const { results: members } = await db
      .prepare(
        `SELECT r.player_id AS id, r.score, COALESCE(gs.rating, ?) AS rating
         FROM rounds r
         JOIN group_members m ON m.group_id = ? AND m.player_id = r.player_id
         LEFT JOIN group_standings gs ON gs.group_id = ? AND gs.player_id = r.player_id
         WHERE r.lounge_id = ?`,
      )
      .bind(STARTING_RATING, lounge.group_id, lounge.group_id, lounge.id)
      .all<{ id: string; score: number; rating: number }>()

    if (members.length >= MIN_PLAYERS_TO_RATE) {
      const gDeltas = eloDeltas(members)
      for (const entrant of members) {
        const delta = gDeltas.get(entrant.id) ?? 0
        const { wins, losses, ties } = pairwiseRecord(entrant, members)
        statements.push(
          db
            .prepare(
              `INSERT INTO group_standings (group_id, player_id, rating, games_played, wins, losses, ties)
               SELECT ?, ?, ?, 1, ?, ?, ? WHERE ${guard}
               ON CONFLICT(group_id, player_id) DO UPDATE SET
                 rating = MAX(?, group_standings.rating + ?),
                 games_played = group_standings.games_played + 1,
                 wins = group_standings.wins + excluded.wins,
                 losses = group_standings.losses + excluded.losses,
                 ties = group_standings.ties + excluded.ties`,
            )
            .bind(
              lounge.group_id,
              entrant.id,
              Math.max(RATING_FLOOR, STARTING_RATING + delta),
              wins,
              losses,
              ties,
              lounge.id, // guard
              RATING_FLOOR,
              delta,
            ),
        )
      }
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
    `SELECT id, mode, status, deadline_at, group_id FROM lounges
     WHERE status = 'open' AND deadline_at IS NOT NULL AND deadline_at < ?
     LIMIT 5`,
  )
    .bind(now)
    .all<Pick<LoungeRow, 'id' | 'mode' | 'status' | 'deadline_at' | 'group_id'>>()
  for (const lounge of results) {
    await maybeFinalizeLounge(env, lounge, now)
  }
}
