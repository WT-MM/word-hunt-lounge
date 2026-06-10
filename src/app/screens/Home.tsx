import { useEffect, useState } from 'preact/hooks'
import { ApiError, type GroupSummary, type Profile, api } from '../api'
import { Spinner, deltaChip, modeBadge, useToast } from '../components/bits'

interface HomeProps {
  navigate: (path: string) => void
  onIdentityLost: () => void
}

export function Home({ navigate, onIdentityLost }: HomeProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual')
  const [durationS, setDurationS] = useState(80)
  const [windowH, setWindowH] = useState(24)
  const [busy, setBusy] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [toast, showToast] = useToast()

  useEffect(() => {
    api.me().then(setProfile).catch((err) => {
      if (err instanceof ApiError && err.status === 401) onIdentityLost()
    })
    api.myGroups().then((r) => setGroups(r.groups)).catch(() => setGroups([]))
  }, [])

  const createGroup = async () => {
    const name = groupName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const g = await api.createGroup(name)
      navigate(`/g/${g.code}`)
    } catch {
      showToast('Could not create group')
      setBusy(false)
    }
  }

  const joinGroup = async () => {
    const code = joinCode.trim()
    if (!code || busy) return
    setBusy(true)
    try {
      const g = await api.joinGroup(code)
      navigate(`/g/${g.code}`)
    } catch {
      showToast('No group found for that code')
      setBusy(false)
    }
  }

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
      showToast('Could not create a board — try again')
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
          New game
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
          {[40, 60, 80].map((d) => (
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
              Everyone has {windowH}h to play. Then standings lock and Elo updates.
            </p>
          </>
        )}
        <button class="btn btn-primary" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create board'}
        </button>
      </div>

      <div class="panel stack">
        <p class="kicker" style={{ margin: 0 }}>
          Groups
        </p>
        <p class="muted" style={{ margin: 0 }}>
          Make a group, share one invite link, and everyone plays every board you post — no
          re-sharing each round.
        </p>
        {groups && groups.length > 0 && (
          <div>
            {groups.map((g) => (
              <a
                key={g.code}
                class="recent-row"
                href={`/g/${g.code}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(`/g/${g.code}`)
                }}
              >
                <span class="code" style={{ letterSpacing: 0 }}>
                  {g.name}
                </span>
                <span class="muted" style={{ fontSize: 12 }}>
                  {g.member_count} {g.member_count === 1 ? 'member' : 'members'} · {g.board_count}{' '}
                  {g.board_count === 1 ? 'board' : 'boards'}
                </span>
              </a>
            ))}
          </div>
        )}
        <div class="row" style={{ gap: 8 }}>
          <input
            class="input"
            placeholder="New group name"
            maxLength={20}
            value={groupName}
            onInput={(e) => setGroupName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && createGroup()}
          />
          <button class="btn btn-primary btn-small" disabled={busy || !groupName.trim()} onClick={createGroup}>
            Create
          </button>
        </div>
        <div class="row" style={{ gap: 8 }}>
          <input
            class="input"
            placeholder="Join code"
            autocapitalize="characters"
            value={joinCode}
            onInput={(e) => setJoinCode((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGroup()}
          />
          <button class="btn btn-ghost btn-small" disabled={busy || !joinCode.trim()} onClick={joinGroup}>
            Join
          </button>
        </div>
      </div>

      {!profile ? (
        <Spinner />
      ) : (
        <>
          {profile.recent.length > 0 && (
            <div class="panel">
              <p class="kicker">Recent games</p>
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
                  You
                </p>
                <p class="display" style={{ fontSize: 22, marginTop: 4 }}>
                  {profile.name}
                </p>
                <p class="muted" style={{ margin: '2px 0 0' }}>
                  {profile.rating} elo
                  {profile.gamesPlayed > 0 && (
                    <>
                      {' · '}
                      {profile.wins}W–{profile.losses}L{profile.ties ? `–${profile.ties}T` : ''}
                    </>
                  )}
                  {profile.ratingEvents.length > 0 && (
                    <>
                      {' · last '}
                      {deltaChip(profile.ratingEvents[0].delta)}
                    </>
                  )}
                </p>
              </div>
              <button class="btn btn-ghost btn-small" onClick={() => setShowCode((s) => !s)}>
                {showCode ? 'Hide code' : 'Backup code'}
              </button>
            </div>
            {showCode && (
              <div class="fade-in stack">
                <div class="code-chip">{profile.claimCode}</div>
                <p class="muted" style={{ margin: 0 }}>
                  Restores your name and rating on a new device. Keep it private.
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
