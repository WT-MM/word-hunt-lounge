import type { Context, MiddlewareHandler } from 'hono'
import type { Env } from './env'
import type { PlayerRow } from './db'

export type AppEnv = { Bindings: Env; Variables: { player: PlayerRow } }

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789' // no lookalikes (I L O U 0 1)

export function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.toUpperCase().replace(/[^A-Z2-9]/g, '')
  return code.length >= 4 && code.length <= 12 ? code : null
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Display names are stored sanitized (control chars and HTML-significant
 * chars stripped) and additionally escaped wherever they are rendered.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw
    .replace(/[\u0000-\u001f\u007f<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
    .trim()
  return name.length > 0 ? name : null
}

/**
 * `Authorization: Bearer <playerId>.<token>` — primary-key lookup (D1 bills
 * rows scanned, so no token scans), then hash comparison.
 */
export async function playerFromRequest(c: Context<AppEnv>): Promise<PlayerRow | null> {
  const header = c.req.header('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const dot = header.indexOf('.', 7)
  if (dot < 0) return null
  const id = header.slice(7, dot)
  const token = header.slice(dot + 1)
  if (!id || !token) return null
  const row = await c.env.DB.prepare(
    'SELECT id, name, rating, games_played, claim_code, token_hash FROM players WHERE id = ?',
  )
    .bind(id)
    .first<PlayerRow & { token_hash: string }>()
  if (!row) return null
  if (row.token_hash !== (await sha256Hex(token))) return null
  const { token_hash: _discard, ...player } = row
  return player
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const player = await playerFromRequest(c)
  if (!player) return c.json({ error: 'unauthorized' }, 401)
  c.set('player', player)
  await next()
}
