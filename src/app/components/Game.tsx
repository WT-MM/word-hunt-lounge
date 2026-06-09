import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { wordFromPath } from '../../shared/path'
import { type RoundSession, api } from '../api'
import { Board, type Flash } from './Board'

interface GameProps {
  code: string
  session: RoundSession
  onDone: () => void
}

interface Popup {
  id: number
  text: string
}

export function Game({ code, session, onDone }: GameProps) {
  const [found, setFound] = useState(session.found.slice().reverse())
  const [totalScore, setTotalScore] = useState(session.totalScore)
  const [tracePath, setTracePath] = useState<number[]>([])
  const [flash, setFlash] = useState<Flash | null>(null)
  const [verdictWord, setVerdictWord] = useState<{ word: string; kind: Flash['kind'] } | null>(null)
  const [popups, setPopups] = useState<Popup[]>([])
  const [remainingMs, setRemainingMs] = useState(session.endsAt - Date.now())
  const finishing = useRef(false)
  const popupId = useRef(0)

  const durationMs = session.endsAt - session.startedAt

  useEffect(() => {
    const tick = setInterval(() => {
      const left = session.endsAt - Date.now()
      setRemainingMs(left)
      if (left <= 0 && !finishing.current) {
        finishing.current = true
        clearInterval(tick)
        api.finishRound(code).catch(() => undefined).then(onDone)
      }
    }, 150)
    return () => clearInterval(tick)
  }, [code, session.endsAt])

  const submit = async (path: number[]) => {
    const word = wordFromPath(session.board, path)
    try {
      const res = await api.submitWord(code, path)
      if (res.verdict === 'too_late') return
      const kind: Flash['kind'] = res.verdict === 'valid' ? 'valid' : res.verdict === 'dup' ? 'dup' : 'invalid'
      setFlash({ path, kind, key: Date.now() })
      setVerdictWord({ word, kind })
      setTimeout(() => setFlash((f) => (f?.path === path ? null : f)), 380)
      setTimeout(() => setVerdictWord((v) => (v?.word === word ? null : v)), 900)
      if (res.verdict === 'valid' && res.word && res.score) {
        setFound((prev) => [{ word: res.word!, score: res.score! }, ...prev])
        setTotalScore((prev) => Math.max(prev, res.totalScore))
        const id = ++popupId.current
        setPopups((prev) => [...prev, { id, text: `+${res.score}` }])
        setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 900)
      }
    } catch {
      /* network hiccup — the word is simply lost; the round continues */
    }
  }

  const endEarly = async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      await api.finishRound(code)
    } catch {
      /* lapses server-side anyway */
    }
    onDone()
  }

  const liveWord = useMemo(
    () => (tracePath.length > 0 ? wordFromPath(session.board, tracePath) : null),
    [tracePath, session.board],
  )

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const low = remainingMs <= 10_000
  const readoutClass = liveWord ? '' : verdictWord ? ` v-${verdictWord.kind}` : ''

  return (
    <div class="game fade-in">
      <div class="row space">
        <span class={`timer-num mono-num${low ? ' low' : ''}`}>
          0:{String(seconds).padStart(2, '0')}
        </span>
        <span class="game-score">{totalScore.toLocaleString()}</span>
      </div>
      <div class="timer-track">
        <div
          class={`timer-fill${low ? ' low' : ''}`}
          style={{ width: `${Math.max(0, (remainingMs / durationMs) * 100)}%` }}
        />
      </div>

      <div class={`readout${readoutClass}`}>
        <span class="word">{liveWord ?? verdictWord?.word ?? ''}</span>
        {popups.map((p) => (
          <span key={p.id} class="pop">
            {p.text}
          </span>
        ))}
      </div>

      <Board
        tiles={session.board}
        disabled={remainingMs <= 0}
        flash={flash}
        onTrace={setTracePath}
        onSubmit={submit}
      />

      <div class="found-strip">
        {found.map((f) => (
          <span key={f.word} class="found-chip">
            {f.word}
            <b>{f.score}</b>
          </span>
        ))}
      </div>

      <button class="btn btn-ghost" onClick={endEarly}>
        End round
      </button>
    </div>
  )
}
