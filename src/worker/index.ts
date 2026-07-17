import { Hono } from 'hono'
import type { AppEnv } from './auth'
import { loungeShell } from './og'
import { players } from './routes/players'
import { lounges } from './routes/lounges'
import { groups } from './routes/groups'

const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
  )
})

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
  return c.json({ ok: row?.ok === 1 })
})

app.route('/', players)
app.route('/', lounges)
app.route('/', groups)

app.get('/l/:code', loungeShell)
app.get('/g/:code', loungeShell)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal' }, 500)
})

export default app
