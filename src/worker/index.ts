import { Hono } from 'hono'
import type { AppEnv } from './auth'
import { loungeShell } from './og'
import { players } from './routes/players'
import { lounges } from './routes/lounges'

const app = new Hono<AppEnv>()

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
  return c.json({ ok: row?.ok === 1 })
})

app.route('/', players)
app.route('/', lounges)

app.get('/l/:code', loungeShell)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal' }, 500)
})

export default app
