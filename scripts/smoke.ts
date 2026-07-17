/**
 * End-to-end smoke test: drives the real API through a casual lounge and a
 * full ranked match (3 players, short window) including lazy finalization
 * and Elo application. Run with the dev server up:  npm run smoke
 * Point at production with:  SMOKE_URL=https://... npm run smoke
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileTrie } from '../src/shared/trie'
import { solveBoard, NEIGHBORS } from '../src/shared/solver'
import { eloDeltas } from '../src/shared/elo'
import { MIN_WORD_LENGTH, wordScore } from '../src/shared/score'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199'

let passed = 0
let failed = 0
function check(condition: unknown, label: string, detail?: unknown) {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  FAIL: ${label}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}

interface Identity {
  id: string
  token: string
  claimCode: string
  name: string
  rating: number
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; auth?: Identity } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth) headers.authorization = `Bearer ${opts.auth.id}.${opts.auth.token}`
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// --- local solver mirror, to pick real words and paths -----------------------
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dictWords = readFileSync(join(root, 'data', 'dictionary.txt'), 'utf8')
  .split('\n')
  .map((w) => w.trim())
  .filter((w) => w.length >= MIN_WORD_LENGTH && w.length <= 17 && /^[a-z]+$/.test(w))
const trie = compileTrie(dictWords)

function findPathForWord(tiles: string[], word: string): number[] | null {
  const dfs = (i: number, rest: string, path: number[]): number[] | null => {
    if (!rest.startsWith(tiles[i])) return null
    const remaining = rest.slice(tiles[i].length)
    const next = [...path, i]
    if (remaining === '') return next
    for (const n of NEIGHBORS[i]) {
      if (!next.includes(n)) {
        const found = dfs(n, remaining, next)
        if (found) return found
      }
    }
    return null
  }
  for (let i = 0; i < 16; i++) {
    const found = dfs(i, word, [])
    if (found) return found
  }
  return null
}

/** Cheapest-first list of (word, path) pairs actually on the board. */
function playableWords(tiles: string[]): Array<{ word: string; score: number; path: number[] }> {
  const out: Array<{ word: string; score: number; path: number[] }> = []
  const solutions = [...solveBoard(tiles, trie)].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  for (const [word, score] of solutions) {
    const path = findPathForWord(tiles, word)
    if (path) out.push({ word, score, path })
    if (out.length >= 8) break
  }
  return out
}

function gibberishPath(tiles: string[], solutions: Set<string>): number[] {
  for (let a = 0; a < 16; a++) {
    for (const b of NEIGHBORS[a]) {
      for (const c of NEIGHBORS[b]) {
        if (c === a) continue
        const word = tiles[a] + tiles[b] + tiles[c]
        if (!solutions.has(word)) return [a, b, c]
      }
    }
  }
  throw new Error('no gibberish path found (astonishing board)')
}

// -----------------------------------------------------------------------------
async function main() {
  console.log(`smoke: ${BASE}`)

  const health = await api('/api/health')
  check(health.status === 200 && health.json?.ok === true, 'health', health)

  // players
  const mk = async (name: string): Promise<Identity> => {
    const res = await api('/api/players', { body: { name } })
    check(res.status === 200 && res.json.token && res.json.claimCode, `create player ${name}`, res)
    check(res.json.rating === 1200, 'starts at 1200', res.json.rating)
    return res.json
  }
  const ada = await mk('Ada')
  const bo = await mk('Bo')
  const cy = await mk('Cy')

  const badName = await api('/api/players', { body: { name: '<<<>>>' } })
  check(badName.status === 400, 'all-HTML name rejected', badName)
  const evil = await api('/api/players', { body: { name: 'Eve<script>alert(1)' } })
  check(evil.status === 200 && !/[<>&"']/.test(evil.json.name), 'name sanitized', evil.json.name)

  const noAuth = await api('/api/me')
  check(noAuth.status === 401, 'me requires auth', noAuth.status)
  const badTok = await api('/api/me', { auth: { ...ada, token: 'f'.repeat(64) } })
  check(badTok.status === 401, 'wrong token rejected', badTok.status)

  // ---------------- casual lounge ----------------
  console.log('casual lounge…')
  const created = await api('/api/lounges', { body: { durationS: 6 }, auth: ada })
  check(created.status === 201 && created.json.mode === 'casual', 'create casual lounge', created)
  check(created.json.wordCount >= 80, 'board quality gate', created.json.wordCount)
  const code1 = created.json.code

  // A player who neither created nor played a board must not be able to
  // attach an arbitrary rematch link to it.
  const hijack = await api('/api/lounges', {
    body: { mode: 'casual', durationS: 5, rematchOf: code1 },
    auth: evil.json,
  })
  check(hijack.status === 201, 'unrelated player can still create their own board', hijack.status)
  const beforePlay = await api(`/api/lounges/${code1}`)
  check(beforePlay.json.rematchCode === null, 'unrelated player cannot hijack rematch link', beforePlay.json.rematchCode)

  let view = await api(`/api/lounges/${code1}`, { auth: ada })
  check(view.status === 200 && view.json.players.length === 0, 'fresh lounge empty', view.json)
  check(!('board' in view.json), 'board not leaked pre-round', Object.keys(view.json))
  check(view.json.you?.canPlay === true, 'creator can play', view.json.you)
  check(view.json.createdByName === 'Ada', 'creator name shown', view.json.createdByName)

  const lcLookup = await api(`/api/lounges/${code1.toLowerCase()}`)
  check(lcLookup.status === 200, 'code lookup is case-insensitive', lcLookup.status)

  const adaRound = await api(`/api/lounges/${code1}/rounds`, { method: 'POST', body: {}, auth: ada })
  check(adaRound.status === 201 && adaRound.json.board?.length === 16, 'round starts with board', adaRound)
  const tiles: string[] = adaRound.json.board
  check(
    Array.isArray(adaRound.json.words) && adaRound.json.words.length === created.json.wordCount,
    'solutions ship with round start',
    adaRound.json.words?.length,
  )
  const words = playableWords(tiles)
  check(words.length >= 3, 'enough playable words for the test', words.length)
  const solutionSet = new Set(solveBoard(tiles, trie).keys())

  const w0 = await api(`/api/lounges/${code1}/words`, { body: { path: words[0].path }, auth: ada })
  check(w0.json.verdict === 'valid' && w0.json.word === words[0].word, 'valid word accepted', w0.json)
  check(w0.json.score === wordScore(words[0].word.length), 'scored per table', w0.json)
  const dup = await api(`/api/lounges/${code1}/words`, { body: { path: words[0].path }, auth: ada })
  check(dup.json.verdict === 'dup', 'duplicate flagged', dup.json)
  const nonAdj = await api(`/api/lounges/${code1}/words`, { body: { path: [0, 2, 10] }, auth: ada })
  check(nonAdj.json.verdict === 'invalid', 'non-adjacent path rejected', nonAdj.json)
  const gib = await api(`/api/lounges/${code1}/words`, {
    body: { path: gibberishPath(tiles, solutionSet) },
    auth: ada,
  })
  check(gib.json.verdict === 'invalid', 'gibberish rejected', gib.json)
  const w1 = await api(`/api/lounges/${code1}/words`, { body: { path: words[1].path }, auth: ada })
  check(w1.json.verdict === 'valid' && w1.json.totalScore === words[0].score + words[1].score, 'total accumulates', w1.json)

  const fin = await api(`/api/lounges/${code1}/finish`, { method: 'POST', body: {}, auth: ada })
  check(fin.status === 200 && fin.json.score === words[0].score + words[1].score, 'finish reports score', fin.json)
  const again = await api(`/api/lounges/${code1}/rounds`, { method: 'POST', body: {}, auth: ada })
  check(again.status === 409 && again.json.error === 'already_played', 'second round blocked', again)

  // results gating
  const anonResults = await api(`/api/lounges/${code1}/results`)
  check(anonResults.json.reveal === false && !('words' in anonResults.json), 'words hidden from non-players', anonResults.json.reveal)
  check(anonResults.json.standings[0]?.score === fin.json.score, 'standings public', anonResults.json.standings)
  const adaResults = await api(`/api/lounges/${code1}/results`, { auth: ada })
  check(adaResults.json.reveal === true && adaResults.json.words[ada.id]?.length === 2, 'players see words', adaResults.json.reveal)
  check(Array.isArray(adaResults.json.topWords) && adaResults.json.topWords.length > 0, 'top words listed', adaResults.json.topWords?.length)

  // Bo plays but never finishes: round must lapse into a completed state
  const boRound = await api(`/api/lounges/${code1}/rounds`, { method: 'POST', body: {}, auth: bo })
  check(boRound.status === 201, 'bo starts', boRound.status)
  const boWord = await api(`/api/lounges/${code1}/words`, { body: { path: words[2].path }, auth: bo })
  check(boWord.json.verdict === 'valid', 'bo scores', boWord.json)

  view = await api(`/api/lounges/${code1}`)
  const boEntry = view.json.players.find((p: any) => p.playerId === bo.id)
  check(boEntry?.state === 'playing' && boEntry.score === null, 'in-progress score hidden', boEntry)

  // resume payload while live
  const boResume = await api(`/api/lounges/${code1}/rounds`, { method: 'POST', body: {}, auth: bo })
  check(boResume.status === 200 && boResume.json.resumed === true && boResume.json.found.length === 1, 'live round resumes', boResume.json)

  console.log('waiting for bo round to lapse…')
  await sleep(6500 + 3000) // duration + grace
  view = await api(`/api/lounges/${code1}`)
  const boDone = view.json.players.find((p: any) => p.playerId === bo.id)
  check(boDone?.state === 'done' && boDone.score === words[2].score, 'closed-tab round lapses to done', boDone)
  const late = await api(`/api/lounges/${code1}/words`, { body: { path: words[3].path }, auth: bo })
  check(late.json.verdict === 'too_late', 'late submission rejected', late.json)

  // ---------------- ranked lounge ----------------
  console.log('ranked lounge…')
  const windowH = 35 / 3600 // 35s: three sequential rounds must fit the deadline check even on a slow machine
  const ranked = await api('/api/lounges', {
    body: { mode: 'ranked', durationS: 5, rankedWindowH: windowH, rematchOf: code1 },
    auth: ada,
  })
  check(ranked.status === 201 && ranked.json.mode === 'ranked' && ranked.json.deadlineAt, 'create ranked lounge', ranked.json)
  const code2 = ranked.json.code
  const deadline = ranked.json.deadlineAt

  const oldLounge = await api(`/api/lounges/${code1}`)
  check(oldLounge.json.rematchCode === code2, 'rematch back-link set', oldLounge.json.rematchCode)

  // three players play to a forced strict ranking: ada 2 words, bo 1, cy 0
  const play = async (who: Identity, wordCount: number) => {
    const start = await api(`/api/lounges/${code2}/rounds`, { method: 'POST', body: {}, auth: who })
    check(start.status === 201, `${who.name} starts ranked`, start)
    const rankedWords = playableWords(start.json.board)
    for (let i = 0; i < wordCount; i++) {
      const res = await api(`/api/lounges/${code2}/words`, { body: { path: rankedWords[i].path }, auth: who })
      check(res.json.verdict === 'valid', `${who.name} word ${i}`, res.json)
    }
    const done = await api(`/api/lounges/${code2}/finish`, { method: 'POST', body: {}, auth: who })
    check(done.status === 200, `${who.name} finishes`, done.status)
    return done.json.score as number
  }
  const sAda = await play(ada, 2)
  const sBo = await play(bo, 1)
  const sCy = await play(cy, 0)
  check(sAda > sBo && sBo > sCy, 'strict score order', { sAda, sBo, sCy })

  // wait out the deadline, then sweep via /api/me
  const remaining = deadline - Date.now()
  console.log(`waiting ${Math.max(0, remaining)}ms for ranked deadline…`)
  if (remaining > 0) await sleep(remaining + 1000)

  const eve = await mk('Eve')
  const tooSlow = await api(`/api/lounges/${code2}/rounds`, { method: 'POST', body: {}, auth: eve })
  check(tooSlow.status === 410, 'post-deadline start gets 410', tooSlow.status)

  const meAda = await api('/api/me', { auth: ada })
  check(meAda.status === 200, 'me ok', meAda.status)
  const expected = eloDeltas([
    { id: ada.id, rating: 1200, score: sAda },
    { id: bo.id, rating: 1200, score: sBo },
    { id: cy.id, rating: 1200, score: sCy },
  ])
  check(meAda.json.rating === 1200 + expected.get(ada.id)!, 'ada elo applied', {
    got: meAda.json.rating,
    want: 1200 + expected.get(ada.id)!,
  })
  check(meAda.json.gamesPlayed === 1, 'ranked game counted (casual not)', meAda.json.gamesPlayed)
  check(meAda.json.ratingEvents.length === 1 && meAda.json.ratingEvents[0].code === code2, 'rating event recorded', meAda.json.ratingEvents)
  check(meAda.json.recent.length === 2, 'recent lounges listed', meAda.json.recent.length)
  // ada beat both bo and cy on this 3-player board → pairwise 2W/0L
  check(meAda.json.wins === 2 && meAda.json.losses === 0, 'pairwise W/L: winner 2-0', {
    w: meAda.json.wins,
    l: meAda.json.losses,
  })

  const meCy = await api('/api/me', { auth: cy })
  check(meCy.json.rating === 1200 + expected.get(cy.id)!, 'cy elo applied', {
    got: meCy.json.rating,
    want: 1200 + expected.get(cy.id)!,
  })
  // cy lost to both → 0W/2L
  check(meCy.json.wins === 0 && meCy.json.losses === 2, 'pairwise W/L: last 0-2', {
    w: meCy.json.wins,
    l: meCy.json.losses,
  })

  const finalView = await api(`/api/lounges/${code2}/results`)
  check(finalView.json.status === 'finalized', 'lounge finalized', finalView.json.status)
  check(finalView.json.reveal === true, 'finalized reveals words to everyone', finalView.json.reveal)
  const standings = finalView.json.standings
  check(standings.length === 3 && standings[0].playerId === ada.id && standings[0].rank === 1, 'standings ranked', standings)
  check(standings[0].delta === expected.get(ada.id), 'delta shown in standings', standings[0])

  // double-finalization guard: a second sweep/read must not re-apply
  await api('/api/me', { auth: ada })
  const meAda2 = await api('/api/me', { auth: ada })
  check(meAda2.json.rating === meAda.json.rating, 'no double elo application', meAda2.json.rating)

  // claim flow
  const claimed = await api('/api/players/claim', { body: { claimCode: bo.claimCode } })
  check(claimed.status === 200 && claimed.json.id === bo.id, 'claim restores identity', claimed.json.id)
  const oldToken = await api('/api/me', { auth: bo })
  check(oldToken.status === 401, 'old token rotated out', oldToken.status)
  const newBo = { ...bo, token: claimed.json.token }
  const meBo = await api('/api/me', { auth: newBo })
  check(meBo.status === 200 && meBo.json.rating === 1200 + expected.get(bo.id)!, 'claimed identity keeps rating', meBo.json.rating)

  const badClaim = await api('/api/players/claim', { body: { claimCode: 'XXXX9999' } })
  check(badClaim.status === 404, 'unknown claim code 404s', badClaim.status)

  // share shell
  const shell = await fetch(`${BASE}/l/${code2}`)
  check(shell.status === 200 && (shell.headers.get('content-type') ?? '').includes('text/html'), 'lounge link serves HTML', shell.status)

  // ---------------- groups ----------------
  console.log('groups…')
  const grp = await api('/api/groups', { body: { name: 'Test Crew' }, auth: ada })
  check(grp.status === 201 && grp.json.code && grp.json.name === 'Test Crew', 'create group', grp.json)
  const gcode = grp.json.code

  const joined = await api('/api/groups/join', { body: { code: gcode }, auth: newBo })
  check(joined.status === 200 && joined.json.code === gcode, 'join group', joined.json)
  const cyNew = { ...cy } // cy not a member yet

  const adaGroups = await api('/api/groups', { auth: ada })
  check(adaGroups.json.groups.some((g: any) => g.code === gcode && g.member_count === 2), 'group lists members', adaGroups.json.groups)

  // non-member can't read detail or post a board
  const cyView = await api(`/api/groups/${gcode}`, { auth: cyNew })
  check(cyView.status === 403, 'non-member blocked from group detail', cyView.status)
  const cyBoard = await api('/api/lounges', { body: { groupId: gcode }, auth: cyNew })
  check(cyBoard.status === 403, 'non-member cannot post group board', cyBoard.status)

  // member posts a board into the group
  const gboard = await api('/api/lounges', { body: { mode: 'casual', durationS: 80, groupId: gcode }, auth: ada })
  check(gboard.status === 201, 'member posts group board', gboard.status)
  const gview = await api(`/api/groups/${gcode}`, { auth: newBo })
  check(gview.status === 200 && gview.json.boards.some((b: any) => b.code === gboard.json.code), 'group board visible to members', gview.json.boards?.length)
  const gloungeView = await api(`/api/lounges/${gboard.json.code}`, { auth: newBo })
  check(gloungeView.json.groupCode === gcode, 'lounge carries its group code', gloungeView.json.groupCode)

  const badGroup = await api(`/api/groups/ZZZZZ`, { auth: ada })
  check(badGroup.status === 404, 'unknown group 404s', badGroup.status)

  // group ladder starts fresh & separate: only a casual group board exists so
  // far, so group rating is the default 1200 / 0 games, even though ada's
  // GLOBAL rating already moved from the earlier ranked board
  const lb = await api(`/api/groups/${gcode}`, { auth: ada })
  const adaMember0 = lb.json.members.find((m: any) => m.playerId === ada.id)
  check(adaMember0?.games_played === 0 && adaMember0?.rating === 1200, 'group ladder starts at 1200/0', adaMember0)
  check(adaMember0?.globalRating === meAda.json.rating, 'group view also carries global rating', {
    g: adaMember0?.globalRating,
    glob: meAda.json.rating,
  })

  // a ranked board posted to the group moves BOTH ladders
  const grWindowH = 22 / 3600
  const grBoard = await api('/api/lounges', {
    body: { mode: 'ranked', durationS: 5, rankedWindowH: grWindowH, groupId: gcode },
    auth: ada,
  })
  check(grBoard.status === 201, 'create ranked group board', grBoard.status)
  const grCode = grBoard.json.code
  const playGroup = async (who: Identity, n: number) => {
    const start = await api(`/api/lounges/${grCode}/rounds`, { method: 'POST', body: {}, auth: who })
    const ws = playableWords(start.json.board)
    for (let i = 0; i < n; i++) {
      await api(`/api/lounges/${grCode}/words`, { body: { path: ws[i].path }, auth: who })
    }
    await api(`/api/lounges/${grCode}/finish`, { method: 'POST', body: {}, auth: who })
  }
  await playGroup(ada, 2) // ada wins the group board
  await playGroup(newBo, 1) // bo second
  const globalWinsBefore = meAda.json.wins

  const grRemaining = grBoard.json.deadlineAt - Date.now()
  console.log(`waiting ${Math.max(0, grRemaining)}ms for group board deadline…`)
  if (grRemaining > 0) await sleep(grRemaining + 1000)
  await api('/api/me', { auth: ada }) // sweep finalizes the expired group board

  const lb2 = await api(`/api/groups/${gcode}`, { auth: ada })
  const adaM = lb2.json.members.find((m: any) => m.playerId === ada.id)
  const boM = lb2.json.members.find((m: any) => m.playerId === bo.id)
  check(adaM?.games_played === 1 && adaM?.wins === 1 && adaM?.losses === 0, 'group ladder: ada 1 game, 1-0 here', adaM)
  check(boM?.games_played === 1 && boM?.wins === 0 && boM?.losses === 1, 'group ladder: bo 0-1 here', boM)
  check(adaM?.rating > 1200 && boM?.rating < 1200, 'group elo diverged from start', { ada: adaM?.rating, bo: boM?.rating })
  check(lb2.json.members[0].playerId === ada.id, 'group leaderboard sorts by group elo', lb2.json.members.map((m: any) => m.rating))

  // the same board also counted globally (separate, larger tally)
  const meAdaFinal = await api('/api/me', { auth: ada })
  check(meAdaFinal.json.wins === globalWinsBefore + 1, 'global ladder also incremented by the group board', {
    before: globalWinsBefore,
    after: meAdaFinal.json.wins,
  })
  check(adaM?.wins !== meAdaFinal.json.wins, 'group record is distinct from global record', {
    group: adaM?.wins,
    global: meAdaFinal.json.wins,
  })

  // all-words list present once revealed (ada's finalized ranked board)
  const fullWords = await api(`/api/lounges/${code2}/results`, { auth: ada })
  check(Array.isArray(fullWords.json.allWords) && fullWords.json.allWords.length >= fullWords.json.topWords.length, 'results expose full word list', fullWords.json.allWords?.length)

  console.log(`\nsmoke: ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('smoke crashed:', err)
  process.exit(1)
})
