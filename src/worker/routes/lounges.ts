import { Hono } from 'hono'
import type { Context } from 'hono'
import {
  DEFAULT_DURATION_S,
  DEFAULT_RANKED_WINDOW_H,
  GRACE_MS,
  MAX_DURATION_S,
  MAX_RANKED_WINDOW_H,
  MIN_DURATION_S,
  MIN_RANKED_WINDOW_H,
} from '../../shared/constants'
import { generateBoard } from '../../shared/board'
import { isValidPath, wordFromPath } from '../../shared/path'
import { type AppEnv, normalizeCode, playerFromRequest, randomCode, requireAuth } from '../auth'
import {
  type LoungeRow,
  type PlayerRow,
  type RoundRow,
  boardTiles,
  getLounge,
  getRound,
  isRoundComplete,
  isRoundLive,
  roundEndsAt,
} from '../db'
import type { Env } from '../env'
import { loadTrie } from '../dict'
import { maybeFinalizeLounge, sweepExpiredLounges } from '../finalize'

export const lounges = new Hono<AppEnv>()

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(max, Math.max(min, n))
}

interface LoungeRoundRow extends RoundRow {
  name: string
  rating: number
  words_found: number
}

async function loungeRounds(env: Env, loungeId: string): Promise<LoungeRoundRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.lounge_id, r.player_id, r.started_at, r.duration_s, r.finished_at, r.score,
            p.name, p.rating,
            (SELECT COUNT(*) FROM found_words f WHERE f.round_id = r.id) AS words_found
     FROM rounds r JOIN players p ON p.id = r.player_id
     WHERE r.lounge_id = ?`,
  )
    .bind(loungeId)
    .all<LoungeRoundRow>()
  return results
}

/**
 * The board's solution words ship to the client at round start so word
 * verdicts are instant (no per-word network wait, like the original). The
 * server stays authoritative: submissions are still path-validated, checked
 * against this same set, and time-windowed.
 */
async function solutionWords(env: Env, loungeId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT solutions FROM lounges WHERE id = ?')
    .bind(loungeId)
    .first<{ solutions: string }>()
  return row ? Object.keys(JSON.parse(row.solutions) as Record<string, number>) : []
}

async function loungeDeltas(env: Env, lounge: LoungeRow): Promise<Map<string, number>> {
  if (lounge.status !== 'finalized') return new Map()
  const { results } = await env.DB.prepare(
    'SELECT player_id, delta FROM rating_events WHERE lounge_id = ?',
  )
    .bind(lounge.id)
    .all<{ player_id: string; delta: number }>()
  return new Map(results.map((r) => [r.player_id, r.delta]))
}

/** Why the viewer can't play, or null if they can. */
function blockReason(
  lounge: LoungeRow,
  viewerRound: RoundRow | undefined,
  now: number,
): string | null {
  if (viewerRound) return 'already_played'
  if (lounge.status === 'finalized') return 'finalized'
  if (
    lounge.mode === 'ranked' &&
    lounge.deadline_at !== null &&
    now + lounge.duration_s * 1000 + GRACE_MS > lounge.deadline_at
  ) {
    return 'not_enough_time'
  }
  return null
}

async function viewerState(
  env: Env,
  lounge: LoungeRow,
  rounds: LoungeRoundRow[],
  viewer: PlayerRow,
  now: number,
) {
  const mine = rounds.find((r) => r.player_id === viewer.id)
  const reason = blockReason(lounge, mine, now)
  const state: Record<string, unknown> = {
    playerId: viewer.id,
    played: mine ? isRoundComplete(mine, now) : false,
    canPlay: reason === null,
    reason,
  }
  if (mine && isRoundLive(mine, now)) {
    const { results: found } = await env.DB.prepare(
      'SELECT word, score FROM found_words WHERE round_id = ? ORDER BY found_at',
    )
      .bind(mine.id)
      .all<{ word: string; score: number }>()
    state.resume = {
      board: boardTiles(lounge),
      words: await solutionWords(env, lounge.id),
      startedAt: mine.started_at,
      endsAt: roundEndsAt(mine),
      found,
      totalScore: mine.score,
    }
  }
  return state
}

function publicLounge(lounge: LoungeRow) {
  return {
    code: lounge.id,
    mode: lounge.mode,
    status: lounge.status,
    durationS: lounge.duration_s,
    wordCount: lounge.word_count,
    deadlineAt: lounge.deadline_at,
    rematchCode: lounge.rematch_code,
    createdAt: lounge.created_at,
    finalizedAt: lounge.finalized_at,
  }
}

lounges.post('/api/lounges', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const mode: LoungeRow['mode'] = body?.mode === 'ranked' ? 'ranked' : 'casual'
  const durationS = Math.round(
    clampNumber(body?.durationS, MIN_DURATION_S, MAX_DURATION_S, DEFAULT_DURATION_S),
  )
  const windowH = clampNumber(
    body?.rankedWindowH,
    MIN_RANKED_WINDOW_H,
    MAX_RANKED_WINDOW_H,
    DEFAULT_RANKED_WINDOW_H,
  )
  const now = Date.now()
  await sweepExpiredLounges(c.env, now)

  const trie = await loadTrie(c.env, c.req.url)
  const seeds = [...crypto.getRandomValues(new Uint32Array(3))]
  const board = generateBoard(trie, seeds)
  const solutions = JSON.stringify(Object.fromEntries(board.solutions))
  const deadlineAt = mode === 'ranked' ? Math.round(now + windowH * 3_600_000) : null
  const player = c.get('player')

  let code: string | null = null
  for (let attempt = 0; attempt < 3 && code === null; attempt++) {
    const candidate = randomCode(6)
    try {
      await c.env.DB.prepare(
        `INSERT INTO lounges (id, mode, status, board, seed, duration_s, solutions, word_count, deadline_at, created_by, created_at)
         VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          candidate,
          mode,
          board.tiles.join(' '),
          board.seed,
          durationS,
          solutions,
          board.solutions.size,
          deadlineAt,
          player.id,
          now,
        )
        .run()
      code = candidate
    } catch {
      // lounge-code collision — retry with a fresh code
    }
  }
  if (code === null) return c.json({ error: 'try_again' }, 500)

  const rematchOf = normalizeCode(body?.rematchOf)
  if (rematchOf) {
    await c.env.DB.prepare(
      'UPDATE lounges SET rematch_code = ? WHERE id = ? AND rematch_code IS NULL',
    )
      .bind(code, rematchOf)
      .run()
  }
  return c.json({ code, mode, status: 'open', durationS, deadlineAt, wordCount: board.solutions.size }, 201)
})

lounges.get('/api/lounges/:code', async (c) => {
  const code = normalizeCode(c.req.param('code'))
  if (!code) return c.json({ error: 'not_found' }, 404)
  let lounge = await getLounge(c.env.DB, code)
  if (!lounge) return c.json({ error: 'not_found' }, 404)
  const now = Date.now()
  if (await maybeFinalizeLounge(c.env, lounge, now)) lounge = (await getLounge(c.env.DB, code))!

  const viewer = await playerFromRequest(c)
  const rounds = await loungeRounds(c.env, lounge.id)
  const deltas = await loungeDeltas(c.env, lounge)

  const creator = await c.env.DB.prepare('SELECT name FROM players WHERE id = ?')
    .bind(lounge.created_by)
    .first<{ name: string }>()

  const players = rounds
    .map((r) => {
      const complete = isRoundComplete(r, now)
      return {
        playerId: r.player_id,
        name: r.name,
        rating: r.rating,
        state: complete ? 'done' : 'playing',
        score: complete ? r.score : null,
        wordsFound: complete ? r.words_found : null,
        delta: deltas.get(r.player_id) ?? null,
      }
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  return c.json({
    ...publicLounge(lounge),
    createdByName: creator?.name ?? null,
    players,
    you: viewer ? await viewerState(c.env, lounge, rounds, viewer, now) : null,
  })
})

lounges.post('/api/lounges/:code/rounds', requireAuth, async (c) => {
  const code = normalizeCode(c.req.param('code'))
  if (!code) return c.json({ error: 'not_found' }, 404)
  const lounge = await getLounge(c.env.DB, code)
  if (!lounge) return c.json({ error: 'not_found' }, 404)
  const now = Date.now()
  if (await maybeFinalizeLounge(c.env, lounge, now)) lounge.status = 'finalized'
  const player = c.get('player')

  const existing = await getRound(c.env.DB, lounge.id, player.id)
  if (existing) return resumeOrConflict(c, lounge, existing, now)

  if (lounge.status === 'finalized') return c.json({ error: 'finalized' }, 410)
  if (
    lounge.mode === 'ranked' &&
    lounge.deadline_at !== null &&
    now + lounge.duration_s * 1000 + GRACE_MS > lounge.deadline_at
  ) {
    return c.json({ error: 'not_enough_time', deadlineAt: lounge.deadline_at }, 409)
  }

  try {
    await c.env.DB.prepare(
      'INSERT INTO rounds (id, lounge_id, player_id, started_at, duration_s, score) VALUES (?, ?, ?, ?, ?, 0)',
    )
      .bind(crypto.randomUUID(), lounge.id, player.id, now, lounge.duration_s)
      .run()
  } catch {
    // double-tap race on UNIQUE(lounge_id, player_id) — surface the winner
    const raced = await getRound(c.env.DB, lounge.id, player.id)
    if (raced) return resumeOrConflict(c, lounge, raced, now)
    return c.json({ error: 'try_again' }, 500)
  }
  return c.json(
    {
      board: boardTiles(lounge),
      words: await solutionWords(c.env, lounge.id),
      startedAt: now,
      endsAt: now + lounge.duration_s * 1000,
      found: [],
      totalScore: 0,
    },
    201,
  )
})

async function resumeOrConflict(
  c: Context<AppEnv>,
  lounge: LoungeRow,
  round: RoundRow,
  now: number,
) {
  if (!isRoundLive(round, now)) return c.json({ error: 'already_played' }, 409)
  const { results: found } = await c.env.DB.prepare(
    'SELECT word, score FROM found_words WHERE round_id = ? ORDER BY found_at',
  )
    .bind(round.id)
    .all<{ word: string; score: number }>()
  return c.json({
    board: boardTiles(lounge),
    words: await solutionWords(c.env, lounge.id),
    startedAt: round.started_at,
    endsAt: roundEndsAt(round),
    found,
    totalScore: round.score,
    resumed: true,
  })
}

lounges.post('/api/lounges/:code/words', requireAuth, async (c) => {
  const code = normalizeCode(c.req.param('code'))
  if (!code) return c.json({ error: 'not_found' }, 404)
  const body = await c.req.json().catch(() => null)
  const path = body?.path
  if (!Array.isArray(path) || path.length > 16) return c.json({ error: 'bad_path' }, 400)

  const lounge = await c.env.DB.prepare(
    'SELECT id, board, solutions, duration_s FROM lounges WHERE id = ?',
  )
    .bind(code)
    .first<{ id: string; board: string; solutions: string; duration_s: number }>()
  if (!lounge) return c.json({ error: 'not_found' }, 404)

  const player = c.get('player')
  const round = await getRound(c.env.DB, lounge.id, player.id)
  if (!round) return c.json({ error: 'no_round' }, 409)

  const now = Date.now()
  if (round.finished_at !== null || now > roundEndsAt(round) + GRACE_MS) {
    return c.json({ verdict: 'too_late', totalScore: round.score })
  }
  if (!isValidPath(path)) return c.json({ verdict: 'invalid', totalScore: round.score })

  const word = wordFromPath(boardTiles(lounge), path)
  const score = (JSON.parse(lounge.solutions) as Record<string, number>)[word]
  if (score === undefined) return c.json({ verdict: 'invalid', word, totalScore: round.score })

  const inserted = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO found_words (round_id, word, score, found_at) VALUES (?, ?, ?, ?)',
  )
    .bind(round.id, word, score, now)
    .run()
  if (inserted.meta.changes === 0) {
    return c.json({ verdict: 'dup', word, totalScore: round.score })
  }

  const updated = await c.env.DB.prepare(
    'UPDATE rounds SET score = (SELECT COALESCE(SUM(score), 0) FROM found_words WHERE round_id = ?) WHERE id = ? RETURNING score',
  )
    .bind(round.id, round.id)
    .first<{ score: number }>()
  return c.json({
    verdict: 'valid',
    word,
    score,
    totalScore: updated?.score ?? round.score + score,
  })
})

lounges.post('/api/lounges/:code/finish', requireAuth, async (c) => {
  const code = normalizeCode(c.req.param('code'))
  if (!code) return c.json({ error: 'not_found' }, 404)
  const lounge = await getLounge(c.env.DB, code)
  if (!lounge) return c.json({ error: 'not_found' }, 404)
  const player = c.get('player')
  const round = await getRound(c.env.DB, lounge.id, player.id)
  if (!round) return c.json({ error: 'no_round' }, 409)

  const finishedAt = Math.min(Date.now(), roundEndsAt(round))
  await c.env.DB.prepare('UPDATE rounds SET finished_at = ? WHERE id = ? AND finished_at IS NULL')
    .bind(finishedAt, round.id)
    .run()

  const fresh = await getRound(c.env.DB, lounge.id, player.id)
  const { results: found } = await c.env.DB.prepare(
    'SELECT word, score FROM found_words WHERE round_id = ? ORDER BY score DESC, word',
  )
    .bind(round.id)
    .all<{ word: string; score: number }>()
  return c.json({ score: fresh?.score ?? round.score, found })
})

lounges.get('/api/lounges/:code/results', async (c) => {
  const code = normalizeCode(c.req.param('code'))
  if (!code) return c.json({ error: 'not_found' }, 404)
  let lounge = await getLounge(c.env.DB, code)
  if (!lounge) return c.json({ error: 'not_found' }, 404)
  const now = Date.now()
  if (await maybeFinalizeLounge(c.env, lounge, now)) lounge = (await getLounge(c.env.DB, code))!

  const viewer = await playerFromRequest(c)
  const rounds = await loungeRounds(c.env, lounge.id)
  const deltas = await loungeDeltas(c.env, lounge)

  const completed = rounds
    .filter((r) => isRoundComplete(r, now))
    .sort((a, b) => b.score - a.score)
  // competition ranking: ties share a rank, next rank skips
  let rank = 0
  let lastScore = Number.NaN
  const standings = completed.map((r, i) => {
    if (r.score !== lastScore) {
      rank = i + 1
      lastScore = r.score
    }
    return {
      rank,
      playerId: r.player_id,
      name: r.name,
      rating: r.rating,
      score: r.score,
      wordsFound: r.words_found,
      delta: deltas.get(r.player_id) ?? null,
    }
  })
  const stillPlaying = rounds
    .filter((r) => !isRoundComplete(r, now))
    .map((r) => ({ playerId: r.player_id, name: r.name }))

  const viewerRound = viewer ? rounds.find((r) => r.player_id === viewer.id) : undefined
  const reveal =
    lounge.status === 'finalized' || (viewerRound !== undefined && isRoundComplete(viewerRound, now))

  const response: Record<string, unknown> = {
    ...publicLounge(lounge),
    reveal,
    standings,
    stillPlaying,
    you: viewer ? await viewerState(c.env, lounge, rounds, viewer, now) : null,
  }

  if (reveal) {
    const { results: allWords } = await c.env.DB.prepare(
      `SELECT r.player_id, f.word, f.score FROM found_words f
       JOIN rounds r ON r.id = f.round_id WHERE r.lounge_id = ?
       ORDER BY f.score DESC, f.word`,
    )
      .bind(lounge.id)
      .all<{ player_id: string; word: string; score: number }>()
    const wordsByPlayer: Record<string, Array<{ word: string; score: number }>> = {}
    const foundBy = new Map<string, string[]>()
    for (const row of allWords) {
      ;(wordsByPlayer[row.player_id] ??= []).push({ word: row.word, score: row.score })
      const list = foundBy.get(row.word) ?? []
      list.push(row.player_id)
      foundBy.set(row.word, list)
    }

    const solutionsRow = await c.env.DB.prepare('SELECT solutions FROM lounges WHERE id = ?')
      .bind(lounge.id)
      .first<{ solutions: string }>()
    const solutions = Object.entries(
      JSON.parse(solutionsRow?.solutions ?? '{}') as Record<string, number>,
    )
    solutions.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    response.words = wordsByPlayer
    response.topWords = solutions.slice(0, 15).map(([word, score]) => ({
      word,
      score,
      foundBy: foundBy.get(word) ?? [],
    }))
  }

  return c.json(response)
})
