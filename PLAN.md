# Word Hunt Lounge — Implementation Plan

A free-to-run, mobile-web Word Hunt (GamePigeon-style) that supports N players per board,
shared via iMessage links, with async play, ranked leaderboards, and Elo ratings.

> Rev 2 — amended after adversarial review. Key changes: build-time binary trie (Workers
> free tier has a **10ms CPU limit**, so no runtime dictionary parsing), relative Elo
> application, hashed tokens with PK lookup, finalization sweep, deadline-aware round
> starts, OG escaping, claim codes promoted to v1, iOS touch specifics.

## 1. Goals & constraints

- **G1**: One board, many players. Creator shares a link; anyone who opens it can play the
  same board once; results are ranked.
- **G2**: Async play (like GamePigeon): each player runs their own 80-second round whenever
  they open the link. No real-time sync needed.
- **G3**: Competitive mode with Elo ratings persisted per player.
- **G4**: $0 infrastructure (Cloudflare free tier), no Apple Developer account.
- **G5**: Feels native in iMessage via rich link previews (Open Graph title/description/image).
- **G6**: Reasonable anti-cheat: server-side validation of every word, board letters not
  revealed until a round starts, server-enforced time window.
- **Non-goals (v1)**: accounts/passwords, push notifications, live head-to-head mode,
  dynamic OG *images* (dynamic OG *text* only), native iMessage extension.

## 2. Product spec

### 2.1 Game rules (GamePigeon-style; exact parity not claimed)
- 4×4 letter grid. Trace words by dragging through adjacent tiles (8-directional),
  no tile reused within a word.
- Words must be ≥ 3 letters and in the dictionary (ENABLE list — close to but not
  identical to GamePigeon's proprietary dictionary).
- **Qu digraph**: boards roll classic Boggle dice; the Q face is a single "Qu" tile
  contributing two letters (counts as 2 toward word length/scoring). GamePigeon appears
  to have no Q at all; classic-Boggle Qu is the better design (single Q is a dead tile).
- Round length: 80 seconds (creator-configurable: 60/80/120 in UI; API accepts 5–300 for
  testability).
- Scoring (verified GamePigeon table): 3 letters = 100, 4 = 400, 5 = 800, 6 = 1400,
  7 = 1800, 8 = 2200, then +400 per additional letter.
- Duplicate words (same player) score once. Different players may score the same word.

### 2.2 Modes
- **Casual** (default): lounge stays open indefinitely; leaderboard accumulates; no rating
  changes.
- **Ranked**: lounge has a deadline (1h / 6h / 24h in UI, default 24h; API accepts
  0.01–168h for testability). **A round may only start if it can finish before the
  deadline** (`now + duration + grace ≤ deadline`, else 409) — no rounds in flight at
  finalization. At the deadline the lounge finalizes: standings lock and Elo applies to
  all completed rounds. Requires ≥ 2 completed rounds to rate; otherwise finalizes with
  no rating change. After finalization, late visitors view results but can't play.
- **Finalization triggers** (no cron): lazily on any lounge read (`GET /lounges/:code`,
  `/results`, `POST /rounds`), **plus a global sweep** on `GET /api/me` and
  `POST /api/lounges` (`status='open' AND deadline_at < now LIMIT 5`, served by an index
  on `(status, deadline_at)`) so ratings are never stale when displayed or when a new
  ranked match starts.

### 2.3 Player identity (no accounts)
- First visit: player picks a display name → server issues `{playerId, token, claimCode}`;
  client stores all in localStorage; requests send `Authorization: Bearer <id>.<token>`.
- Server stores only a **SHA-256 hash of the token** and looks players up **by primary
  key** (D1 bills rows *scanned* — a token full-scan would burn the read budget).
- **Claim code (v1, not stretch)**: iOS ITP evicts localStorage after ~7 days of not
  visiting, so identity loss is routine, not rare. The claim code (shown at creation and
  on the profile) restores name/rating on a new device and rotates the token. Stored
  plaintext for re-display — acceptable recovery-secret tradeoff at friends scale.
- Display names: trimmed, length-capped (20), control chars stripped on write;
  HTML-escaped at every render point (see OG injection).

### 2.4 Spoiler & fairness rules
- Lounge page shows who has played and their **scores**, but the **board letters** are only
  returned when a player starts their round (POST), and each player gets exactly one round.
- Other players' **word lists** are revealed only after the viewer has completed their own
  round, or the lounge is finalized (ranked).
- Server validates each submission: path adjacency + no-repeat, word derived server-side
  from the submitted tile path (client never sends the word string), membership in the
  board's precomputed solution set, and timestamp within
  `[startedAt, startedAt + duration + 3s grace]`.
- Rounds are never "stuck": a round with `finished_at IS NULL` whose window has lapsed is
  **treated as complete with its current score by all readers** (standings, results,
  finalization) — computed, not swept, to save row-writes.

### 2.5 Screens
1. **Home `/`**: name entry / claim-code restore (first run), create lounge (mode,
   duration, ranked window), your rating + games played, recent lounges, claim code.
2. **Lounge `/l/:code`**: standings so far, play state, Play button (or deadline countdown),
   share button (Web Share API → iMessage), polls every 5s (paused on `visibilitychange`).
3. **Game** (in-lounge state, not a separate route): grid, drag tracing with an SVG path
   overlay, current-word readout, verdict feedback (valid = green + score popup,
   duplicate = yellow, invalid = gray), found-word list, score, countdown.
   **iOS touch requirements** (must-have, not polish): `touch-action: none` on the board
   (else iOS fires `pointercancel` and kills every trace), geometry-based tile hit
   detection from board rect (not event targets — `setPointerCapture` retargets events),
   hit zone ≈ 40% of tile radius so diagonal drags don't clip orthogonal neighbors,
   `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none`.
4. **Results**: ranked standings, per-player word lists, top board words ("what you
   missed"), Elo deltas (ranked), Rematch (new lounge, back-linked via `rematch_code` so
   pollers can hop over), Share.

## 3. Architecture

| Layer | Choice | Why |
|---|---|---|
| Hosting/API | Cloudflare Worker (single) | free tier: 100k req/day, **10ms CPU/request** |
| DB | Cloudflare D1 (SQLite) | free: 500 MB/db (5 GB/account), 5M row-reads/day, 100k row-writes/day |
| Static assets | Workers Static Assets | same deploy, free, serves SPA + binary trie |
| API framework | Hono | tiny, idiomatic on Workers |
| Frontend | Preact + TypeScript + Vite | ~4 screens; tiny bundle; custom pointer-event game UI |
| Dev integration | @cloudflare/vite-plugin (GA, v1+) | runs the real Worker (workerd) inside `vite dev` |
| Dictionary | ENABLE list (public domain, 172,819 words) | standard for word games; pinned in repo |
| Tests | Vitest + scripted API smoke test | pure-logic unit tests; curl-level e2e |

- **Single deploy unit**: Vite builds the SPA to assets; the Worker handles `/api/*` and
  `/l/*` via `run_worker_first: ["/api/*", "/l/*"]`; everything else is static.
- **Dictionary is precompiled at build time** (`scripts/build-dict.ts`): trie serialized
  to a flat `Uint32Array` (`public/dict/trie.bin`, ~1.5 MB; gitignored, rebuilt by
  pre-build hook from `data/enable1.txt` which is committed). Runtime cost is
  `ASSETS.fetch → arrayBuffer()` — wall time, near-zero CPU — cached in a module global.
  **Runtime dictionary parsing is banned**: measured ~85ms CPU ≈ 8.5× the free-tier
  limit, and local dev does NOT enforce the limit, so this failure mode is invisible
  until deploy. Board solving itself measures ~2ms CPU.
- **Binary trie format**: one uint32 per node-entry — bits 0–4 letter, bit 5 terminal,
  bit 6 last-sibling, bits 7–31 first-child index + 1 (0 = leaf). Children of a node are
  contiguous; root group starts at 0.
- **No Durable Objects / websockets**: async play means polling (5s) is enough.
- **Finalization atomicity**: deltas are computed from a pre-read snapshot but applied
  **relatively** in a single `batch()` (transactional, verified): every statement is
  self-guarded with `… AND (SELECT status FROM lounges WHERE id=?)='open'`, with the
  status flip as the last statement. Concurrent finalizers serialize on SQLite's single
  writer; the loser's entire batch no-ops. No stuck intermediate states, no lost updates
  for players shared across concurrently-finalizing lounges
  (`rating = MAX(100, rating + ?)`).

## 4. Game logic (shared `src/shared/`, pure TS, fully unit-tested)

- **`rng.ts`**: seeded mulberry32 PRNG; board reproducible from stored seed.
- **`board.ts`**: roll the 16 standard Boggle dice (Fisher-Yates positions + seeded face
  picks); `q` face → `qu` tile. Quality gate: ≥ 80 solution words and ≥ 1 word of 6+
  letters; **max 3 attempts** (CPU budget), keep the best attempt if none pass.
- **`trie.ts`**: build (Node-side) + binary serialize/deserialize per the format above.
- **`solver.ts`**: DFS over 16 tiles walking the binary trie directly (multi-char tiles
  supported); returns `{word → score}` map. Typical boards: 200–600 words, ~2ms.
- **`path.ts`**: validate path indices (range, no repeats, 8-adjacency) and derive the
  word from tiles — handles `Qu` naturally.
- **`score.ts`**: the scoring table above (length includes both Qu letters).
- **`elo.ts`**: N-player pairwise Elo: for each pair, `E = 1/(1+10^((Rj−Ri)/400))`,
  `S ∈ {1, 0.5, 0}` by score comparison; `ΔRi = round(Σ_j (K/(N−1))·(S−E))`, `K = 32`,
  start 1200, floor 100 (applied at UPDATE time via `MAX(100, rating + δ)`).

## 5. Data model (D1)

```sql
players(id TEXT PK, name TEXT, token_hash TEXT, claim_code TEXT UNIQUE,
        rating INTEGER DEFAULT 1200, games_played INTEGER DEFAULT 0, created_at INTEGER)
lounges(id TEXT PK,            -- 6-char code, also the URL slug
        mode TEXT,             -- 'casual' | 'ranked'
        status TEXT,           -- 'open' | 'finalized'
        board TEXT,            -- 16 tiles space-joined ('qu' is one tile)
        seed INTEGER, duration_s INTEGER,
        solutions TEXT,        -- JSON {word: score}; NEVER selected by polling queries
        deadline_at INTEGER,   -- NULL for casual
        rematch_code TEXT,     -- back-link to successor lounge
        created_by TEXT, created_at INTEGER, finalized_at INTEGER)
rounds(id TEXT PK, lounge_id, player_id, started_at INTEGER, duration_s INTEGER,
       finished_at INTEGER, score INTEGER DEFAULT 0,
       UNIQUE(lounge_id, player_id))
found_words(round_id, word TEXT, score INTEGER, found_at INTEGER,
            UNIQUE(round_id, word))   -- INSERT OR IGNORE; meta.changes=0 → 'dup'
rating_events(id TEXT PK, lounge_id, player_id, delta INTEGER, created_at INTEGER)
-- rating_after intentionally dropped (relative updates); derive from history if needed
CREATE INDEX idx_lounges_sweep ON lounges(status, deadline_at);
CREATE INDEX idx_rounds_player ON rounds(player_id);
CREATE INDEX idx_events_player ON rating_events(player_id);
```

All queries use **explicit column lists** — `GET /lounges/:code` is polled every 5s and
must never ship the `solutions` blob (~10–25 KB).

## 6. API (Hono, JSON; 🔐 = `Authorization: Bearer <id>.<token>`, PK lookup + hash compare)

| Endpoint | Notes |
|---|---|
| `POST /api/players {name}` | → `{id, token, claimCode, name, rating}` |
| `POST /api/players/claim {claimCode}` | restore identity; rotates token |
| `GET /api/me` 🔐 | profile, rating, recent lounges; **runs finalization sweep** |
| `PATCH /api/me {name}` 🔐 | rename (same sanitation) |
| `POST /api/lounges {mode, durationS, rankedWindowH, rematchOf?}` 🔐 | creates board+solutions; **runs sweep**; sets `rematch_code` on predecessor |
| `GET /api/lounges/:code` | public state (optional auth for viewer state); lazy finalization; no board/words per §2.4 |
| `POST /api/lounges/:code/rounds` 🔐 | finalize-check first → `{board, startedAt, endsAt}`; 409 already-played / not-enough-time-before-deadline; 410 finalized |
| `POST /api/lounges/:code/words {path:[int]}` 🔐 | → `{verdict: valid\|dup\|invalid\|too_late, word?, score?, totalScore}`; `INSERT OR IGNORE`, `meta.changes=0` → dup |
| `POST /api/lounges/:code/finish` 🔐 | idempotent (`WHERE finished_at IS NULL`); lapsed rounds auto-complete computed-side |
| `GET /api/lounges/:code/results` | standings always; word lists/missed words gated per §2.4; Elo deltas if finalized |

- `/l/:code` (HTML): Worker fetches `/` from assets (not `/index.html` — avoids the
  auto-redirect), replaces an `<!--OG-->` placeholder with **HTML-escaped** tags:
  `og:title` = "Word Hunt — N played · top: NAME SCORE" (or "NAME challenged you!"),
  `og:description`, **absolute** `og:image` URL. Response: `Cache-Control: no-store`,
  asset ETag stripped (OG text changes with lounge state).

## 7. Project structure

```
word-hunt-lounge/
├── PLAN.md / README.md
├── package.json          # single package
├── wrangler.jsonc        # worker + assets (SPA fallback, run_worker_first) + D1 binding
├── vite.config.ts        # @cloudflare/vite-plugin + @preact/preset-vite
├── migrations/0001_init.sql
├── data/enable1.txt      # committed source dictionary (NOT served)
├── scripts/build-dict.ts # tsx; data/enable1.txt → public/dict/trie.bin (gitignored)
├── scripts/smoke.mjs     # e2e: 3 players, ranked match, finalization, Elo deltas
├── public/dict/trie.bin  # generated, gitignored
├── index.html            # contains <!--OG--> placeholder
├── src/
│   ├── shared/           # rng, board, trie, solver, path, score, elo (pure, tested)
│   ├── worker/           # index.ts (Hono), routes/, db.ts, auth.ts, finalize.ts, og.ts
│   └── app/              # Preact SPA: screens/, components/, api.ts, identity.ts
└── test/                 # vitest unit tests for src/shared (+ finalize math)
```

## 8. Build order

1. **Scaffold**: package.json, wrangler.jsonc, Vite + plugins, Hono hello-world, D1
   migration applied locally, vitest config. Verify `vite dev` serves Worker + SPA + D1
   (curl against the dev server from a background process).
2. **Dictionary pipeline + shared logic** (tests green before API work): build-dict
   script → trie.bin; rng, score, trie, solver, board, path, elo. Unit tests include
   trie serialize/deserialize round-trip and a hand-checked fixture board.
3. **API**: players/claim, lounges, rounds, words, finish, results, finalization +
   sweep. Smoke-test with curl against the dev server.
4. **Frontend** (with the frontend-design skill): identity bootstrap, home, lounge, game
   screen (pointer events per §2.5), results. Mobile-first.
5. **Share layer**: OG injection, Web Share API, rematch linking.
6. **Verify e2e**: `scripts/smoke.mjs` runs a full ranked match (short window) against
   the dev server; `vite build`; README with deploy steps. **Post-deploy** (needs user's
   Cloudflare login): re-run smoke against the deployed URL — the 10ms CPU limit is NOT
   enforced locally, so lounge creation must be verified in production.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **10ms CPU/request (free tier)** — would kill runtime dict parsing (~85ms) | build-time binary trie; runtime = fetch + DFS (~2ms); cap board regen at 3; verify post-deploy (limit invisible in dev) |
| Free-tier script size (3 MB gzip) | dictionary lives in assets, not the bundle |
| D1 row-read billing = rows *scanned* | PK lookups only (id+token auth); explicit columns; indexes per §5 |
| 100k row-writes/day | per-word INSERTs ≈ ~1,500 full games/day — fine at friends scale; no sweep-writes for lapsed rounds (computed) |
| Double/concurrent finalization | self-guarded single `batch()` per §3; relative rating updates |
| Ranked lounge never revisited after deadline | global sweep on `/api/me` + lounge creation |
| Stored XSS via names in OG HTML | sanitize on write, escape on render |
| iOS localStorage eviction (~7 days, ITP) | claim codes in v1 |
| iOS gesture hijacking breaks tracing | `touch-action: none`, geometry hit detection, 40% hit zones (§2.5) |
| Client clock ≠ server clock | all timing server-side; client countdown cosmetic; 3s grace |
| Cheating via solver scripts | server validation stops casual cheating; full prevention out of scope for any web game |
| `@cloudflare/vite-plugin` friction | GA + `run_worker_first` support fixed in current versions (pin it); fallback `wrangler dev` + `vite build --watch` |

## 10. Stretch (post-v1)

Dynamic OG images (workers-og) · live mode via Durable Objects · push notifications
(PWA) · season resets · per-IP throttle on player creation · native iMessage extension
wrapper.
