import { Hono } from 'hono'
import { STARTING_RATING } from '../../shared/elo'
import {
  type AppEnv,
  cleanName,
  normalizeCode,
  randomCode,
  randomToken,
  requireAuth,
  sha256Hex,
} from '../auth'
import { sweepExpiredLounges } from '../finalize'

export const players = new Hono<AppEnv>()

players.post('/api/players', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = cleanName(body?.name)
  if (!name) return c.json({ error: 'invalid_name' }, 400)

  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const now = Date.now()

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID()
    const claimCode = randomCode(8)
    try {
      await c.env.DB.prepare(
        'INSERT INTO players (id, name, token_hash, claim_code, rating, games_played, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      )
        .bind(id, name, tokenHash, claimCode, STARTING_RATING, now)
        .run()
      return c.json({ id, token, claimCode, name, rating: STARTING_RATING, gamesPlayed: 0 })
    } catch {
      // claim-code collision (UNIQUE) — extremely unlikely; retry
    }
  }
  return c.json({ error: 'try_again' }, 500)
})

players.post('/api/players/claim', async (c) => {
  const body = await c.req.json().catch(() => null)
  const code = normalizeCode(body?.claimCode)
  if (!code) return c.json({ error: 'invalid_code' }, 400)

  const row = await c.env.DB.prepare(
    'SELECT id, name, rating, games_played, claim_code FROM players WHERE claim_code = ?',
  )
    .bind(code)
    .first<{ id: string; name: string; rating: number; games_played: number; claim_code: string }>()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const token = randomToken()
  await c.env.DB.prepare('UPDATE players SET token_hash = ? WHERE id = ?')
    .bind(await sha256Hex(token), row.id)
    .run()
  return c.json({
    id: row.id,
    token,
    claimCode: row.claim_code,
    name: row.name,
    rating: row.rating,
    gamesPlayed: row.games_played,
  })
})

players.get('/api/me', requireAuth, async (c) => {
  const now = Date.now()
  await sweepExpiredLounges(c.env, now)
  const player = c.get('player')

  // Re-read after the sweep so a just-finalized match is reflected.
  const fresh = await c.env.DB.prepare(
    'SELECT name, rating, games_played, wins, losses, ties FROM players WHERE id = ?',
  )
    .bind(player.id)
    .first<{
      name: string
      rating: number
      games_played: number
      wins: number
      losses: number
      ties: number
    }>()

  const { results: recent } = await c.env.DB.prepare(
    `SELECT r.lounge_id AS code, r.score, r.started_at, r.finished_at, r.duration_s,
            l.mode, l.status, l.created_at
     FROM rounds r JOIN lounges l ON l.id = r.lounge_id
     WHERE r.player_id = ?
     ORDER BY r.started_at DESC LIMIT 10`,
  )
    .bind(player.id)
    .all()

  const { results: ratingEvents } = await c.env.DB.prepare(
    `SELECT lounge_id AS code, delta, created_at FROM rating_events
     WHERE player_id = ? ORDER BY created_at DESC LIMIT 10`,
  )
    .bind(player.id)
    .all()

  return c.json({
    id: player.id,
    name: fresh?.name ?? player.name,
    rating: fresh?.rating ?? player.rating,
    gamesPlayed: fresh?.games_played ?? player.games_played,
    wins: fresh?.wins ?? 0,
    losses: fresh?.losses ?? 0,
    ties: fresh?.ties ?? 0,
    claimCode: player.claim_code,
    recent,
    ratingEvents,
  })
})

players.patch('/api/me', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = cleanName(body?.name)
  if (!name) return c.json({ error: 'invalid_name' }, 400)
  const player = c.get('player')
  await c.env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, player.id).run()
  return c.json({ id: player.id, name })
})
