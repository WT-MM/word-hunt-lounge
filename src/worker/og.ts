import type { Context } from 'hono'
import { type AppEnv, normalizeCode } from './auth'
import { getLounge } from './db'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  )
}

/**
 * /l/:code — the SPA shell with lounge-aware Open Graph tags injected, so the
 * link unfurls in iMessage as a challenge card. All interpolations are
 * escaped (names are attacker-controlled), og:image must be absolute, and
 * the response is no-store because the title changes with lounge state.
 */
export async function loungeShell(c: Context<AppEnv>): Promise<Response> {
  const code = normalizeCode(c.req.param('code'))
  const now = Date.now()
  let title = 'Word Hunt Lounge'
  let description = 'One board, all your friends. Trace words, post your score.'

  const isGroup = new URL(c.req.url).pathname.startsWith('/g/')
  if (code && isGroup) {
    const group = await c.env.DB.prepare(
      `SELECT g.name,
              (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
       FROM groups g WHERE g.id = ?`,
    )
      .bind(code)
      .first<{ name: string; members: number }>()
    if (group) {
      title = `Join "${group.name}" on Word Hunt`
      description = `${group.members} ${group.members === 1 ? 'player' : 'players'} · tap to join the group and play every board.`
    }
  } else if (code) {
    const lounge = await getLounge(c.env.DB, code)
    if (lounge) {
      const creator = await c.env.DB.prepare('SELECT name FROM players WHERE id = ?')
        .bind(lounge.created_by)
        .first<{ name: string }>()
      const { results: done } = await c.env.DB.prepare(
        `SELECT p.name, r.score FROM rounds r JOIN players p ON p.id = r.player_id
         WHERE r.lounge_id = ? AND (r.finished_at IS NOT NULL OR r.started_at + r.duration_s * 1000 + 3000 < ?)
         ORDER BY r.score DESC LIMIT 50`,
      )
        .bind(lounge.id, now)
        .all<{ name: string; score: number }>()

      const ranked = lounge.mode === 'ranked' ? ' · ★ ranked' : ''
      if (lounge.status === 'finalized' && done.length > 0) {
        title = `Word Hunt — ${done[0].name} takes it with ${done[0].score.toLocaleString()}`
        description = `Final standings, ${done.length} played${ranked}.`
      } else if (done.length > 0) {
        title = `Word Hunt — ${done[0].name} leads with ${done[0].score.toLocaleString()}`
        description = `${done.length} played${ranked} · ${lounge.duration_s}s round. Beat them.`
      } else {
        title = `${creator?.name ?? 'Someone'} dealt you a Word Hunt board`
        description = `${lounge.word_count} words are hiding in there${ranked} · ${lounge.duration_s}s on the clock.`
      }
    }
  }

  const shell = await c.env.ASSETS.fetch(new URL('/', c.req.url).toString())
  const url = new URL(c.req.url)
  const og = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Word Hunt Lounge" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${url.origin}/og.png" />`,
    `<meta property="og:url" content="${escapeHtml(url.origin + url.pathname)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ')

  const html = (await shell.text())
    .replace('<!--OG-->', og)
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
