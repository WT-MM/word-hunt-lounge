import { useEffect, useState } from 'preact/hooks'
import { ApiError, type Profile, api } from '../api'
import { Spinner, deltaChip, modeBadge, useToast } from '../components/bits'

interface HomeProps {
  navigate: (path: string) => void
  onIdentityLost: () => void
}

export function Home({ navigate, onIdentityLost }: HomeProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual')
  const [durationS, setDurationS] = useState(80)
  const [windowH, setWindowH] = useState(24)
  const [busy, setBusy] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(() => {
    api.me().then(setProfile).catch((err) => {
      if (err instanceof ApiError && err.status === 401) onIdentityLost()
    })
  }, [])

  const create = async () => {
    if (busy) return
    setBusy(true)
    try {
      const lounge = await api.createLounge({
        mode,
        durationS,
        ...(mode === 'ranked' ? { rankedWindowH: windowH } : {}),
      })
      navigate(`/l/${lounge.code}`)
    } catch {
      showToast('Could not deal a board — try again')
      setBusy(false)
    }
  }

  return (
    <div class="stack fade-in">
      <header class="row space" style={{ marginTop: 6 }}>
        <h1 class="wordmark" style={{ fontSize: 30 }}>
          Word Hunt
          <em>Lounge</em>
        </h1>
        {profile && (
          <div class="medal">
            <span class="num mono-num">{profile.rating}</span>
            <span class="lbl">Elo</span>
          </div>
        )}
      </header>

      <div class="panel stack">
        <p class="kicker" style={{ margin: 0 }}>
          Deal a board
        </p>
        <div class="seg">
          <button class={mode === 'casual' ? 'on' : ''} onClick={() => setMode('casual')}>
            Casual
          </button>
          <button class={mode === 'ranked' ? 'on' : ''} onClick={() => setMode('ranked')}>
            ★ Ranked
          </button>
        </div>
        <div class="seg">
          {[60, 80, 120].map((d) => (
            <button key={d} class={durationS === d ? 'on' : ''} onClick={() => setDurationS(d)}>
              {d}s
            </button>
          ))}
        </div>
        {mode === 'ranked' && (
          <>
            <div class="seg fade-in">
              {[1, 6, 24].map((h) => (
                <button key={h} class={windowH === h ? 'on' : ''} onClick={() => setWindowH(h)}>
                  {h}h
                </button>
              ))}
            </div>
            <p class="muted" style={{ margin: 0 }}>
              Everyone in the thread has {windowH}h to play. Then standings lock and Elo
              settles up.
            </p>
          </>
        )}
        <button class="btn btn-primary" disabled={busy} onClick={create}>
          {busy ? 'Dealing…' : 'Deal board'}
        </button>
      </div>

      {!profile ? (
        <Spinner />
      ) : (
        <>
          {profile.recent.length > 0 && (
            <div class="panel">
              <p class="kicker">Recent boards</p>
              <div>
                {profile.recent.map((r) => (
                  <a key={r.code + r.started_at} class="recent-row" href={`/l/${r.code}`}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(`/l/${r.code}`)
                    }}
                  >
                    <span class="code">{r.code}</span>
                    <span class="row" style={{ gap: 8 }}>
                      {modeBadge(r.mode)}
                      <span class="pts mono-num" style={{ fontSize: 14 }}>
                        {r.score.toLocaleString()}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div class="panel stack">
            <div class="row space">
              <div>
                <p class="kicker" style={{ margin: 0 }}>
                  Membership
                </p>
                <p class="display" style={{ fontSize: 22, marginTop: 4 }}>
                  {profile.name}
                </p>
                <p class="muted" style={{ margin: '2px 0 0' }}>
                  {profile.gamesPlayed} ranked {profile.gamesPlayed === 1 ? 'game' : 'games'}
                  {profile.ratingEvents.length > 0 && (
                    <>
                      {' · last '}
                      {deltaChip(profile.ratingEvents[0].delta)}
                    </>
                  )}
                </p>
              </div>
              <button class="btn btn-ghost btn-small" onClick={() => setShowCode((s) => !s)}>
                {showCode ? 'Hide code' : 'Claim code'}
              </button>
            </div>
            {showCode && (
              <div class="fade-in stack">
                <div class="code-chip">{profile.claimCode}</div>
                <p class="muted" style={{ margin: 0 }}>
                  Restores your rating on a new device. Keep it private.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {toast}
    </div>
  )
}
