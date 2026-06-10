import type { D1Database } from '@cloudflare/workers-types'
import { GRACE_MS } from '../shared/constants'

export interface PlayerRow {
  id: string
  name: string
  rating: number
  games_played: number
  claim_code: string
}

export interface LoungeRow {
  id: string
  mode: 'casual' | 'ranked'
  status: 'open' | 'finalized'
  board: string
  duration_s: number
  word_count: number
  deadline_at: number | null
  rematch_code: string | null
  group_id: string | null
  created_by: string
  created_at: number
  finalized_at: number | null
}

export interface RoundRow {
  id: string
  lounge_id: string
  player_id: string
  started_at: number
  duration_s: number
  finished_at: number | null
  score: number
}

/** Explicit column list — `solutions` must never ride along on polled reads. */
const LOUNGE_COLS =
  'id, mode, status, board, duration_s, word_count, deadline_at, rematch_code, group_id, created_by, created_at, finalized_at'

export async function getLounge(db: D1Database, code: string): Promise<LoungeRow | null> {
  return await db
    .prepare(`SELECT ${LOUNGE_COLS} FROM lounges WHERE id = ?`)
    .bind(code)
    .first<LoungeRow>()
}

export async function getRound(
  db: D1Database,
  loungeId: string,
  playerId: string,
): Promise<RoundRow | null> {
  return await db
    .prepare(
      'SELECT id, lounge_id, player_id, started_at, duration_s, finished_at, score FROM rounds WHERE lounge_id = ? AND player_id = ?',
    )
    .bind(loungeId, playerId)
    .first<RoundRow>()
}

export function roundEndsAt(round: Pick<RoundRow, 'started_at' | 'duration_s'>): number {
  return round.started_at + round.duration_s * 1000
}

/** A round counts as complete once finished or its window (plus grace) lapses. */
export function isRoundComplete(round: RoundRow, now: number): boolean {
  return round.finished_at !== null || now > roundEndsAt(round) + GRACE_MS
}

/** A round that is neither finished nor lapsed is live (resumable). */
export function isRoundLive(round: RoundRow, now: number): boolean {
  return round.finished_at === null && now <= roundEndsAt(round)
}

export function boardTiles(lounge: Pick<LoungeRow, 'board'>): string[] {
  return lounge.board.split(' ')
}

export async function isGroupMember(
  db: D1Database,
  groupId: string,
  playerId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND player_id = ?')
    .bind(groupId, playerId)
    .first<{ ok: number }>()
  return row?.ok === 1
}
