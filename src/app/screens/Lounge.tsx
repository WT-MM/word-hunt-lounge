import { useCallback, useEffect, useState } from 'preact/hooks'
import {
  ApiError,
  type LoungeView,
  type ResultsView,
  type RoundSession,
  api,
} from '../api'
import type { Identity } from '../identity'
import { Game } from '../components/Game'
import { Spinner, deltaChip, fmtCountdown, modeBadge, usePoll, useToast } from '../components/bits'

interface LoungeProps {
  code: string
  identity: Identity
  navigate: (path: string) => void
}

export function Lounge({ code, identity, navigate }: LoungeProps) {
  const [lounge, setLounge] = useState<LoungeView | null>(null)
  const [results, setResults] = useState<ResultsView | null>(null)
  const [session, setSession] = useState<RoundSession | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  const load = useCallback(async () => {
    try {
      const view = await api.getLounge(code)
      setLounge(view)
      if (view.you?.resume) setSession((s) => s ?? view.you!.resume!)
      if (view.you?.played || view.status === 'finalized') {
        const res = await api.getResults(code)
        setResults(res)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true)
    }
  }, [code])

  useEffect(() => {
    load()
  }, [load])

  // poll the lobby while the board is open and we're not mid-round
  usePoll(load, 5000, session === null && !missing && lounge?.status !== 'finalized')

  const play = async () => {
    if (busy) return
    setBusy(true)
    try {
      const round = await api.startRound(code)
      setSession(round)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'already_played') showToast('You already played this board')
        else if (err.code === 'not_enough_time') showToast('Not enough time left before the deadline')
        else if (err.status === 410) showToast('This board is finalized')
        else showToast('Could not start — try again')
        load()
      }
    } finally {
      setBusy(false)
    }
  }

  const onRoundDone = useCallback(() => {
    setSession(null)
    setResults(null)
    load()
  }, [load])

  const share = async () => {
    const url = `${location.origin}/l/${code}`
    const title = `Word Hunt Lounge — board ${code}`
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
    } catch {
      return // user cancelled the share sheet
    }
    await navigator.clipboard.writeText(url)
    showToast('Link copied — paste it in the chat')
  }

  const rematch = async () => {
    if (busy || !lounge) return
    setBusy(true)
    try {
      const next = await api.createLounge({
        mode: lounge.mode,
        durationS: lounge.durationS,
        ...(lounge.mode === 'ranked' && lounge.deadlineAt
          ? { rankedWindowH: Math.max(1, (lounge.deadlineAt - lounge.createdAt) / 3_600_000) }
          : {}),
        rematchOf: code,
      })
      navigate(`/l/${next.code}`)
    } catch {
      showToast('Could not deal a rematch')
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <div class="stack fade-in" style={{ marginTop: '14vh', textAlign: 'center' }}>
        <h2 class="display" style={{ fontSize: 26 }}>
          No such table.
        </h2>
        <p class="muted">This board doesn't exist — check the link.</p>
        <button class="btn btn-ghost" onClick={() => navigate('/')}>
          Back to the lounge
        </button>
      </div>
    )
  }

  if (!lounge) return <Spinner />

  // ── mid-round: the game takes the whole screen ──────────────────────────
  if (session) {
    return <Game code={code} session={session} onDone={onRoundDone} />
  }

  const you = lounge.you
  const deadlineMs = lounge.deadlineAt ? lounge.deadlineAt - Date.now() : null
  const playedCount = lounge.players.filter((p) => p.state === 'done').length
  const names: Record<string, string> = {}
  for (const p of lounge.players) names[p.playerId] = p.name

  return (
    <div class="stack fade-in">
      <header class="row space" style={{ marginTop: 6 }}>
        <button class="btn btn-ghost btn-small" onClick={() => navigate('/')}>
          ← Lounge
        </button>
        <div class="row" style={{ gap: 8 }}>
          {modeBadge(lounge.mode)}
          <span class="code-chip" style={{ padding: '5px 10px', fontSize: 12 }}>
            {lounge.code}
          </span>
        </div>
      </header>

      <div class="panel stack">
        <div>
          <p class="kicker" style={{ margin: 0 }}>
            {lounge.createdByName ? `${lounge.createdByName}'s table` : 'Open table'}
          </p>
          <h2 class="display" style={{ fontSize: 26, marginTop: 6 }}>
            {lounge.status === 'finalized'
              ? 'Final standings'
              : you?.played
                ? 'Waiting on the others…'
                : `${lounge.wordCount} words are hiding in this board.`}
          </h2>
          <p class="muted" style={{ margin: '6px 0 0' }}>
            {lounge.durationS}s round
            {lounge.status === 'finalized'
              ? ' · settled'
              : deadlineMs !== null
                ? ` · locks in ${fmtCountdown(deadlineMs)}`
                : ' · open table'}
            {playedCount > 0 && ` · ${playedCount} played`}
          </p>
        </div>

        {you && !you.played && lounge.status === 'open' && (
          <button class="btn btn-primary" disabled={busy || !you.canPlay} onClick={play}>
            {busy
              ? 'Shuffling…'
              : you.canPlay
                ? `Play this board — ${lounge.durationS}s`
                : you.reason === 'not_enough_time'
                  ? 'Too close to the deadline'
                  : 'Board closed'}
          </button>
        )}
        <button class="btn btn-ghost" onClick={share}>
          Share to the group chat
        </button>
      </div>

      {lounge.rematchCode && (
        <div class="panel row space fade-in">
          <span class="muted">A rematch was dealt →</span>
          <button class="btn btn-ghost btn-small" onClick={() => navigate(`/l/${lounge.rematchCode}`)}>
            Join {lounge.rematchCode}
          </button>
        </div>
      )}

      {lounge.players.length > 0 && (
        <div class="panel">
          <p class="kicker">Standings</p>
          <div class="standings">
            {lounge.players.map((p, i) => (
              <div
                key={p.playerId}
                class={`standing${p.playerId === identity.id ? ' me' : ''}`}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div class={`rank-chip${p.state === 'done' ? ` r${i + 1}` : ''}`}>
                  {p.state === 'done' ? i + 1 : '·'}
                </div>
                <div class="who">
                  <div class="name">{p.name}</div>
                  <div class="sub">
                    {p.state === 'playing' ? (
                      <>
                        <span class="playing-dot" />
                        playing now
                      </>
                    ) : (
                      <>
                        {p.wordsFound} words · {p.rating} elo {deltaChip(p.delta)}
                      </>
                    )}
                  </div>
                </div>
                {p.score !== null && <div class="pts">{p.score.toLocaleString()}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {results?.reveal && results.words && (
        <>
          <div class="panel">
            <p class="kicker">Best words on this board</p>
            <div class="wordcols">
              {results.topWords?.map((t) => (
                <div key={t.word} class="wordrow">
                  <span class="w">
                    {t.word}
                    <span class="finders">
                      {t.foundBy.length === 0
                        ? 'missed by everyone'
                        : t.foundBy.map((id) => names[id] ?? '?').join(', ')}
                    </span>
                  </span>
                  <span class="s mono-num">{t.score}</span>
                </div>
              ))}
            </div>
          </div>

          <div class="stack">
            {results.standings.map((s) => (
              <details key={s.playerId} class="player-words" open={s.playerId === identity.id}>
                <summary>
                  <span>
                    {s.name} — {s.wordsFound} words
                  </span>
                  <b class="mono-num">{s.score.toLocaleString()}</b>
                </summary>
                <div class="inner wordcols">
                  {(results.words![s.playerId] ?? []).map((w) => (
                    <div key={w.word} class="wordrow">
                      <span class="w">{w.word}</span>
                      <span class="s mono-num">{w.score}</span>
                    </div>
                  ))}
                  {(results.words![s.playerId] ?? []).length === 0 && (
                    <p class="muted" style={{ margin: '4px 0' }}>
                      Not a single word. Rough night.
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      )}

      {(you?.played || lounge.status === 'finalized') && !lounge.rematchCode && (
        <button class="btn btn-primary" disabled={busy} onClick={rematch}>
          {busy ? 'Dealing…' : 'Rematch — new board'}
        </button>
      )}
      {toast}
    </div>
  )
}
