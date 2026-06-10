import { Hono } from 'hono'
import { type AppEnv, cleanName, normalizeCode, randomCode, requireAuth } from '../auth'
import { isGroupMember } from '../db'
import { isRoundComplete, type RoundRow } from '../db'

export const groups = new Hono<AppEnv>()

interface GroupRow {
  id: string
  name: string
  created_by: string
  created_at: number
}

groups.post('/api/groups', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = cleanName(body?.name)
  if (!name) return c.json({ error: 'invalid_name' }, 400)
  const player = c.get('player')
  const now = Date.now()

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode(5)
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          'INSERT INTO groups (id, name, created_by, created_at) VALUES (?, ?, ?, ?)',
        ).bind(code, name, player.id, now),
        c.env.DB.prepare(
          'INSERT INTO group_members (group_id, player_id, joined_at) VALUES (?, ?, ?)',
        ).bind(code, player.id, now),
      ])
      return c.json({ code, name }, 201)
    } catch {
      // group-code collision — retry
    }
  }
  return c.json({ error: 'try_again' }, 500)
})

groups.post('/api/groups/join', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const code = normalizeCode(body?.code)
  if (!code) return c.json({ error: 'invalid_code' }, 400)
  const group = await c.env.DB.prepare('SELECT id, name FROM groups WHERE id = ?')
    .bind(code)
    .first<{ id: string; name: string }>()
  if (!group) return c.json({ error: 'not_found' }, 404)
  const player = c.get('player')
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, player_id, joined_at) VALUES (?, ?, ?)',
  )
    .bind(group.id, player.id, Date.now())
    .run()
  return c.json({ code: group.id, name: group.name })
})

/** Groups the caller belongs to, with board + member counts. */
groups.get('/api/groups', requireAuth, async (c) => {
  const player = c.get('player')
  const { results } = await c.env.DB.prepare(
    `SELECT g.id AS code, g.name,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
            (SELECT COUNT(*) FROM lounges l WHERE l.group_id = g.id) AS board_count,
            (SELECT MAX(l.created_at) FROM lounges l WHERE l.group_id = g.id) AS last_board_at
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.player_id = ?
     ORDER BY COALESCE(last_board_at, g.created_at) DESC`,
  )
    .bind(player.id)
    .all()
  return c.json({ groups: results })
})

/** Group detail: members + boards with the caller's play state. */
groups.get('/api/groups/:code', requireAuth, async (c) => {
  const code = normalizeCode(c.req.param('code'))
  if (!code) return c.json({ error: 'not_found' }, 404)
  const group = await c.env.DB.prepare('SELECT id, name, created_at FROM groups WHERE id = ?')
    .bind(code)
    .first<GroupRow>()
  if (!group) return c.json({ error: 'not_found' }, 404)
  const player = c.get('player')
  if (!(await isGroupMember(c.env.DB, group.id, player.id))) {
    return c.json({ error: 'not_member' }, 403)
  }
  const now = Date.now()

  const { results: members } = await c.env.DB.prepare(
    `SELECT p.id AS playerId, p.name, p.rating, p.wins, p.losses, p.ties, p.games_played
     FROM group_members m JOIN players p ON p.id = m.player_id
     WHERE m.group_id = ?
     ORDER BY p.rating DESC, p.wins DESC, m.joined_at`,
  )
    .bind(group.id)
    .all()

  // boards in the group, newest first, with aggregate play info
  const { results: lounges } = await c.env.DB.prepare(
    `SELECT id AS code, mode, status, duration_s, word_count, deadline_at, created_by, created_at
     FROM lounges WHERE group_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(group.id)
    .all<{
      code: string
      mode: string
      status: string
      duration_s: number
      word_count: number
      deadline_at: number | null
      created_by: string
      created_at: number
    }>()

  // one query for every round in these boards, folded in app code
  const codes = lounges.map((l) => l.code)
  const roundsByLounge = new Map<string, RoundRow[]>()
  if (codes.length > 0) {
    const placeholders = codes.map(() => '?').join(',')
    const { results: rounds } = await c.env.DB.prepare(
      `SELECT id, lounge_id, player_id, started_at, duration_s, finished_at, score
       FROM rounds WHERE lounge_id IN (${placeholders})`,
    )
      .bind(...codes)
      .all<RoundRow>()
    for (const r of rounds) {
      const list = roundsByLounge.get(r.lounge_id) ?? []
      list.push(r)
      roundsByLounge.set(r.lounge_id, list)
    }
  }

  const nameById = new Map((members as Array<{ playerId: string; name: string }>).map((m) => [m.playerId, m.name]))
  const boards = lounges.map((l) => {
    const rounds = roundsByLounge.get(l.code) ?? []
    const done = rounds.filter((r) => isRoundComplete(r, now))
    const mine = rounds.find((r) => r.player_id === player.id)
    const top = done.slice().sort((a, b) => b.score - a.score)[0]
    return {
      code: l.code,
      mode: l.mode,
      status: l.status,
      durationS: l.duration_s,
      wordCount: l.word_count,
      deadlineAt: l.deadline_at,
      createdByName: nameById.get(l.created_by) ?? null,
      createdAt: l.created_at,
      playedCount: done.length,
      leader: top ? { name: nameById.get(top.player_id) ?? '?', score: top.score } : null,
      youPlayed: mine ? isRoundComplete(mine, now) : false,
      yourScore: mine && isRoundComplete(mine, now) ? mine.score : null,
    }
  })

  return c.json({ code: group.id, name: group.name, members, boards })
})
