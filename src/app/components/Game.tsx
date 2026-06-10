import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { wordFromPath } from '../../shared/path'
import { MIN_WORD_LENGTH, wordScore } from '../../shared/score'
import { type RoundSession, api } from '../api'
import { hapticSuccess } from '../haptics'
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

/**
 * Isolated so the countdown re-renders only this banner — not the board —
 * while a trace is in progress.
 */
function Timer({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [left, setLeft] = useState(endsAt - Date.now())
  const expired = useRef(false)
  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = endsAt - Date.now()
      setLeft(remaining)
      if (remaining <= 0 && !expired.current) {
        expired.current = true
        clearInterval(tick)
        onExpire()
      }
    }, 250)
    return () => clearInterval(tick)
  }, [endsAt])

  const seconds = Math.max(0, Math.ceil(left / 1000))
  const low = left <= 10_000
  return (
    <div class="banner">
      <div class="banner-label">Time</div>
      <div class={`banner-value${low ? ' low' : ''}`}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </div>
    </div>
  )
}

export function Game({ code, session, onDone }: GameProps) {
  const [found, setFound] = useState(session.found.slice().reverse())
  const [totalScore, setTotalScore] = useState(session.totalScore)
  const [tracePath, setTracePath] = useState<number[]>([])
  const [flash, setFlash] = useState<Flash | null>(null)
  const [verdictWord, setVerdictWord] = useState<{ word: string; kind: Flash['kind'] } | null>(null)
  const [popups, setPopups] = useState<Popup[]>([])
  const finishing = useRef(false)
  const popupId = useRef(0)

  // verdicts are computed locally against the shipped solution set, so
  // feedback is instant; the server still validates every submission and
  // remains authoritative for the recorded score
  const solutions = useMemo(() => new Set(session.words), [session.words])
  const foundWords = useRef(new Set(session.found.map((f) => f.word)))

  const finish = async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      await api.finishRound(code)
    } catch {
      /* lapses server-side anyway */
    }
    onDone()
  }

  const submit = (path: number[]) => {
    const word = wordFromPath(session.board, path)
    const kind: Flash['kind'] =
      word.length >= MIN_WORD_LENGTH && solutions.has(word)
        ? foundWords.current.has(word)
          ? 'dup'
          : 'valid'
        : 'invalid'

    setFlash({ path, kind, key: Date.now() })
    setVerdictWord({ word, kind })
    setTimeout(() => setFlash((f) => (f?.path === path ? null : f)), 350)
    setTimeout(() => setVerdictWord((v) => (v?.word === word ? null : v)), 800)

    if (kind === 'valid') {
      hapticSuccess()
      const score = wordScore(word.length)
      foundWords.current.add(word)
      setFound((prev) => [{ word, score }, ...prev])
      setTotalScore((prev) => prev + score)
      const id = ++popupId.current
      setPopups((prev) => [...prev, { id, text: `+${score}` }])
      setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 900)
      // record in the background; the UI never waits on the network
      api.submitWord(code, path).catch(() => undefined)
    }
  }

  const liveWord = useMemo(
    () => (tracePath.length > 0 ? wordFromPath(session.board, tracePath) : null),
    [tracePath, session.board],
  )

  const shown = liveWord ?? verdictWord?.word ?? null
  const readoutClass = liveWord ? '' : verdictWord ? ` v-${verdictWord.kind}` : ''

  return (
    <div class="game fade-in">
      <div class="row space">
        <div class="banner">
          <div class="banner-label">Score</div>
          <div class="banner-value">{totalScore.toLocaleString()}</div>
        </div>
        <Timer endsAt={session.endsAt} onExpire={finish} />
      </div>

      <div class={`readout${readoutClass}`}>
        <span class={`word${shown ? ' show' : ''}`}>{shown}</span>
        {popups.map((p) => (
          <span key={p.id} class="pop">
            {p.text}
          </span>
        ))}
      </div>

      <Board
        tiles={session.board}
        disabled={false}
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

      <button class="btn btn-ghost" onClick={finish}>
        End round
      </button>
    </div>
  )
}
