import { type Identity, clearIdentity, loadIdentity } from './identity'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(`${status} ${code}`)
    this.status = status
    this.code = code
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (opts.auth !== false) {
    const identity = loadIdentity()
    if (identity) headers.authorization = `Bearer ${identity.id}.${identity.token}`
  }
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    // a 401 with a stored identity means the token is stale (DB reset, claim
    // elsewhere) — drop it so the name gate reappears
    if (res.status === 401 && loadIdentity()) clearIdentity()
    throw new ApiError(res.status, (json as { error?: string }).error ?? 'request_failed')
  }
  return json as T
}

// ---- payload types (mirror the worker responses) ----------------------------

export interface Profile {
  id: string
  name: string
  rating: number
  gamesPlayed: number
  claimCode: string
  recent: Array<{
    code: string
    score: number
    started_at: number
    finished_at: number | null
    duration_s: number
    mode: 'casual' | 'ranked'
    status: 'open' | 'finalized'
    created_at: number
  }>
  ratingEvents: Array<{ code: string; delta: number; created_at: number }>
}

export interface LoungePlayer {
  playerId: string
  name: string
  rating: number
  state: 'done' | 'playing'
  score: number | null
  wordsFound: number | null
  delta: number | null
}

export interface RoundSession {
  board: string[]
  /** all solution words on this board — verdicts are computed locally */
  words: string[]
  startedAt: number
  endsAt: number
  found: Array<{ word: string; score: number }>
  totalScore: number
  resumed?: boolean
}

export interface LoungeView {
  code: string
  mode: 'casual' | 'ranked'
  status: 'open' | 'finalized'
  durationS: number
  wordCount: number
  deadlineAt: number | null
  rematchCode: string | null
  createdAt: number
  finalizedAt: number | null
  groupCode: string | null
  createdByName: string | null
  players: LoungePlayer[]
  you: {
    playerId: string
    played: boolean
    canPlay: boolean
    reason: string | null
    resume?: RoundSession
  } | null
}

export interface ResultsView extends Omit<LoungeView, 'players' | 'createdByName'> {
  reveal: boolean
  standings: Array<{
    rank: number
    playerId: string
    name: string
    rating: number
    score: number
    wordsFound: number
    delta: number | null
  }>
  stillPlaying: Array<{ playerId: string; name: string }>
  words?: Record<string, Array<{ word: string; score: number }>>
  topWords?: Array<{ word: string; score: number; foundBy: string[] }>
  allWords?: Array<{ word: string; score: number; foundBy: string[] }>
}

export interface GroupSummary {
  code: string
  name: string
  member_count: number
  board_count: number
  last_board_at: number | null
}

export interface GroupBoard {
  code: string
  mode: 'casual' | 'ranked'
  status: 'open' | 'finalized'
  durationS: number
  wordCount: number
  deadlineAt: number | null
  createdByName: string | null
  createdAt: number
  playedCount: number
  leader: { name: string; score: number } | null
  youPlayed: boolean
  yourScore: number | null
}

export interface GroupView {
  code: string
  name: string
  members: Array<{ playerId: string; name: string; rating: number }>
  boards: GroupBoard[]
}

export interface WordVerdict {
  verdict: 'valid' | 'dup' | 'invalid' | 'too_late'
  word?: string
  score?: number
  totalScore: number
}

// ---- endpoints ---------------------------------------------------------------

export const api = {
  createPlayer: (name: string) =>
    request<Identity & { rating: number }>('/api/players', { body: { name }, auth: false }),
  claim: (claimCode: string) =>
    request<Identity & { rating: number; gamesPlayed: number }>('/api/players/claim', {
      body: { claimCode },
      auth: false,
    }),
  me: () => request<Profile>('/api/me'),
  rename: (name: string) => request<{ name: string }>('/api/me', { method: 'PATCH', body: { name } }),
  createLounge: (body: {
    mode: 'casual' | 'ranked'
    durationS?: number
    rankedWindowH?: number
    rematchOf?: string
    groupId?: string
  }) => request<{ code: string }>('/api/lounges', { body }),
  createGroup: (name: string) => request<{ code: string; name: string }>('/api/groups', { body: { name } }),
  joinGroup: (code: string) =>
    request<{ code: string; name: string }>('/api/groups/join', { body: { code } }),
  myGroups: () => request<{ groups: GroupSummary[] }>('/api/groups'),
  getGroup: (code: string) => request<GroupView>(`/api/groups/${code}`),
  getLounge: (code: string) => request<LoungeView>(`/api/lounges/${code}`),
  startRound: (code: string) =>
    request<RoundSession>(`/api/lounges/${code}/rounds`, { method: 'POST', body: {} }),
  submitWord: (code: string, path: number[]) =>
    request<WordVerdict>(`/api/lounges/${code}/words`, { body: { path } }),
  finishRound: (code: string) =>
    request<{ score: number; found: Array<{ word: string; score: number }> }>(
      `/api/lounges/${code}/finish`,
      { method: 'POST', body: {} },
    ),
  getResults: (code: string) => request<ResultsView>(`/api/lounges/${code}/results`),
}
