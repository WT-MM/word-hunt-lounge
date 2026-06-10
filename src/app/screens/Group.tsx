import { useCallback, useEffect, useState } from 'preact/hooks'
import { ApiError, type GroupView, api } from '../api'
import type { Identity } from '../identity'
import { Spinner, fmtCountdown, modeBadge, usePoll, useToast } from '../components/bits'

interface GroupProps {
  code: string
  identity: Identity
  navigate: (path: string) => void
}

export function Group({ code, identity, navigate }: GroupProps) {
  const [group, setGroup] = useState<GroupView | null>(null)
  const [error, setError] = useState<'not_found' | 'not_member' | null>(null)
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual')
  const [durationS, setDurationS] = useState(80)
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  const load = useCallback(async () => {
    try {
      setGroup(await api.getGroup(code))
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) setError('not_found')
        else if (err.code === 'not_member') setError('not_member')
      }
    }
  }, [code])

  useEffect(() => {
    load()
  }, [load])
  usePoll(load, 6000, !error)

  const join = async () => {
    try {
      await api.joinGroup(code)
      setError(null)
      load()
    } catch {
      showToast('Could not join — check the code')
    }
  }

  const newBoard = async () => {
    if (busy) return
    setBusy(true)
    try {
      const lounge = await api.createLounge({
        mode,
        durationS,
        ...(mode === 'ranked' ? { rankedWindowH: 24 } : {}),
        groupId: code,
      })
      navigate(`/l/${lounge.code}`)
    } catch {
      showToast('Could not create a board')
      setBusy(false)
    }
  }

  const share = async () => {
    const url = `${location.origin}/g/${code}`
    const title = group ? `Join "${group.name}" on Word Hunt Lounge` : 'Join my Word Hunt group'
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
    } catch {
      return
    }
    await navigator.clipboard.writeText(url)
    showToast('Invite link copied')
  }

  if (error === 'not_found') {
    return (
      <div class="stack fade-in" style={{ marginTop: '14vh', textAlign: 'center' }}>
        <h2 class="display" style={{ fontSize: 26 }}>
          No such group.
        </h2>
        <button class="btn btn-ghost" onClick={() => navigate('/')}>
          Back home
        </button>
      </div>
    )
  }

  if (error === 'not_member') {
    return (
      <div class="stack fade-in" style={{ marginTop: '12vh', textAlign: 'center' }}>
        <p class="kicker">You're invited</p>
        <h2 class="display" style={{ fontSize: 28 }}>
          Join group {code}?
        </h2>
        <p class="muted">Members share boards and a leaderboard.</p>
        <button class="btn btn-primary" onClick={join}>
          Join group
        </button>
        <button class="btn btn-ghost" onClick={() => navigate('/')}>
          Not now
        </button>
        {toast}
      </div>
    )
  }

  if (!group) return <Spinner />

  return (
    <div class="stack fade-in">
      <header class="row space" style={{ marginTop: 6 }}>
        <button class="btn btn-ghost btn-small" onClick={() => navigate('/')}>
          ← Home
        </button>
        <span class="code-chip" style={{ padding: '5px 10px', fontSize: 12 }}>
          {group.code}
        </span>
      </header>

      <div class="panel stack">
        <div>
          <p class="kicker" style={{ margin: 0 }}>
            Group
          </p>
          <h2 class="display" style={{ fontSize: 28, marginTop: 4 }}>
            {group.name}
          </h2>
        </div>
        <button class="btn btn-ghost" onClick={share}>
          Invite to group
        </button>
      </div>

      <div class="panel">
        <p class="kicker">
          Members · ranked by elo
        </p>
        <div class="standings">
          {group.members.map((m, i) => (
            <div
              key={m.playerId}
              class={`standing${m.playerId === identity.id ? ' me' : ''}`}
            >
              <div class={`rank-chip${i < 3 ? ` r${i + 1}` : ''}`}>{i + 1}</div>
              <div class="who">
                <div class="name">{m.name}</div>
                <div class="sub">
                  {m.games_played === 0
                    ? 'no ranked games yet'
                    : `${m.wins}W–${m.losses}L${m.ties ? `–${m.ties}T` : ''}`}
                </div>
              </div>
              <div class="pts">{m.rating}</div>
            </div>
          ))}
        </div>
      </div>

      <div class="panel stack">
        <p class="kicker" style={{ margin: 0 }}>
          New board
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
        <button class="btn btn-primary" disabled={busy} onClick={newBoard}>
          {busy ? 'Creating…' : 'Create board for the group'}
        </button>
      </div>

      <div class="panel">
        <p class="kicker">Boards</p>
        {group.boards.length === 0 ? (
          <p class="muted">No boards yet. Create the first one above.</p>
        ) : (
          <div class="standings">
            {group.boards.map((b) => (
              <button
                key={b.code}
                class="standing"
                style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }}
                onClick={() => navigate(`/l/${b.code}`)}
              >
                <div class="who">
                  <div class="name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {modeBadge(b.mode)}
                    <span>{b.createdByName ?? 'Someone'}'s board</span>
                  </div>
                  <div class="sub">
                    {b.status === 'finalized'
                      ? 'settled'
                      : b.deadlineAt
                        ? `ends in ${fmtCountdown(b.deadlineAt - Date.now())}`
                        : `${b.durationS}s`}
                    {' · '}
                    {b.playedCount} played
                    {b.leader && ` · top ${b.leader.name} ${b.leader.score.toLocaleString()}`}
                  </div>
                </div>
                <div class="pts" style={{ fontSize: 14 }}>
                  {b.youPlayed ? (b.yourScore ?? 0).toLocaleString() : b.status === 'finalized' ? '—' : 'Play'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {toast}
    </div>
  )
}
