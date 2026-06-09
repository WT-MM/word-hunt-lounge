import { useState } from 'preact/hooks'
import { ApiError, api } from '../api'
import { type Identity, saveIdentity } from '../identity'

interface NameGateProps {
  onReady: (identity: Identity) => void
}

/**
 * First-run gate: pick a name, or restore your stats with a backup code.
 * After creating, the backup code is shown ONCE prominently — iOS evicts
 * localStorage after ~7 days away, so this is the recovery path.
 */
export function NameGate({ onReady }: NameGateProps) {
  const [mode, setMode] = useState<'new' | 'claim'>('new')
  const [name, setName] = useState('')
  const [claimCode, setClaimCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Identity | null>(null)

  const join = async () => {
    if (busy || name.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      const player = await api.createPlayer(name.trim())
      const identity: Identity = {
        id: player.id,
        token: player.token,
        name: player.name,
        claimCode: player.claimCode,
      }
      saveIdentity(identity)
      setCreated(identity)
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_name'
          ? 'Try a different name.'
          : 'Something went wrong — try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const claim = async () => {
    if (busy || claimCode.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      const player = await api.claim(claimCode)
      const identity: Identity = {
        id: player.id,
        token: player.token,
        name: player.name,
        claimCode: player.claimCode,
      }
      saveIdentity(identity)
      onReady(identity)
    } catch {
      setError('No player found for that code.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div class="stack fade-in" style={{ marginTop: '8vh' }}>
        <h1 class="display" style={{ fontSize: 28 }}>
          You're in, {created.name}.
        </h1>
        <div class="panel stack">
          <p class="muted" style={{ margin: 0 }}>
            This backup code restores your name and rating if you switch phones or Safari
            forgets you. Screenshot it.
          </p>
          <div class="code-chip">{created.claimCode}</div>
        </div>
        <button class="btn btn-primary" onClick={() => onReady(created)}>
          Let's play
        </button>
      </div>
    )
  }

  return (
    <div class="stack fade-in" style={{ marginTop: '8vh' }}>
      <h1 class="wordmark" style={{ fontSize: 44 }}>
        Word Hunt
        <em>Lounge</em>
      </h1>
      <p class="muted">One board, the whole group chat. Highest score wins.</p>

      <div class="seg">
        <button class={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
          New player
        </button>
        <button class={mode === 'claim' ? 'on' : ''} onClick={() => setMode('claim')}>
          I have a code
        </button>
      </div>

      {mode === 'new' ? (
        <div class="stack">
          <input
            class="input"
            placeholder="Your name"
            maxLength={20}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button class="btn btn-primary" disabled={busy || name.trim().length === 0} onClick={join}>
            Let's go
          </button>
        </div>
      ) : (
        <div class="stack">
          <input
            class="input"
            placeholder="Backup code"
            autocapitalize="characters"
            value={claimCode}
            onInput={(e) => setClaimCode((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && claim()}
          />
          <button
            class="btn btn-primary"
            disabled={busy || claimCode.trim().length === 0}
            onClick={claim}
          >
            Restore my stats
          </button>
        </div>
      )}
      {error && (
        <p class="muted" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
