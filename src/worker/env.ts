import type { D1Database, Fetcher } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}
