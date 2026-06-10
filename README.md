# Word Hunt Lounge

A GamePigeon-style Word Hunt you can send to a whole group chat, not just one
opponent. One board per lounge; everyone who opens the link plays the same
80-second round whenever they get to it; results come back ranked. Ranked mode
settles Elo when the lounge deadline passes.

Runs entirely on Cloudflare's free tier (Workers + D1 + static assets) — no
Apple Developer account needed. The "iMessage interface" is a rich link: the
lounge URL unfurls as a challenge card (dynamic Open Graph tags) and the game
is a mobile web app.

## How a match works

1. **Deal a board** (casual, or ranked with a 1/6/24h deadline) and share the
   link into the chat.
2. Friends open it, pick a name once (no accounts), and play the board —
   letters stay server-side until your round actually starts.
3. Every word is validated server-side: the client submits the **tile path**,
   the server derives the word, checks it against the board's precomputed
   solution set, and enforces the time window.
4. Standings update live. In ranked lounges, when the deadline passes the
   standings lock and Elo applies pairwise across all players
   (K=32 scaled by 1/(N−1), everyone starts at 1200).

Identity is a device token; the **claim code** shown at signup restores your
name/rating on a new device (iOS clears localStorage after ~7 days away —
screenshot the code).

## Development

```sh
npm install
npm run db:migrate:local   # apply schema to the local D1 (once)
npm run dev                # vite dev with the real Worker runtime + local D1
npm test                   # unit tests (board gen, solver, scoring, elo, paths)
npm run smoke              # full API e2e against the dev server (~60s)
npx tsx scripts/screenshots.ts   # headless-Chrome UI walkthrough (needs Chrome)
```

The dictionary (`data/dictionary.txt`, Collins Scrabble Words 2019 — the closest
known match to GamePigeon's unpublished list) is compiled at
build time into a flat binary trie (`public/dict/trie.bin`) by
`scripts/build-dict.ts` (runs automatically via predev/prebuild). This is
load-bearing: the Workers **free tier allows 10ms CPU per request**, so the
Worker must never parse the raw word list — it just fetches the binary asset
and walks it (~2ms to solve a board).

## Deploy (one-time setup)

```sh
npx wrangler login
npx wrangler d1 create word-hunt-lounge
# paste the printed database_id into wrangler.jsonc
npm run db:migrate:remote
npm run deploy
```

Then **verify in production** — local dev does not enforce the 10ms CPU
limit, so confirm board creation works on the real thing:

```sh
SMOKE_URL=https://word-hunt-lounge.<your-subdomain>.workers.dev npm run smoke
```

Optional: add a custom domain in the Cloudflare dashboard (Workers →
word-hunt-lounge → Domains & Routes).

## Architecture

| Piece | Choice |
|---|---|
| API + share pages | One Worker (Hono), `run_worker_first: ["/api/*", "/l/*"]` |
| Frontend | Preact + Vite SPA, served as static assets (~12 KB gz) |
| Data | D1 (SQLite): players, lounges, rounds, found_words, rating_events |
| Dictionary | binary trie asset, built from CSW19 at build time |
| Ranked finalization | lazy — any read of an expired lounge finalizes it, plus a sweep on `/api/me` and lounge creation; applied atomically in one self-guarded `batch()` |
| Live-ness | 5s polling (paused when the tab is hidden); no websockets needed for async play |

Notable invariants:

- Clients never send word strings, only tile paths; adjacency, reuse,
  dictionary membership, and timing are all enforced server-side.
- A ranked round can't start unless it can finish before the deadline, so
  finalization never races an in-flight round.
- Auth is `Bearer <playerId>.<token>` — primary-key lookup + SHA-256 hash
  compare (D1 bills rows *scanned*, so no token scans).
- Polled queries use explicit column lists and never ship the solutions blob.

## Project layout

```
data/dictionary.txt     committed source word list (CSW19)
scripts/build-dict.ts   word list -> public/dict/trie.bin (binary trie)
scripts/smoke.ts        API e2e: full ranked match incl. Elo settlement
scripts/screenshots.ts  headless-Chrome UI verification
migrations/             D1 schema
src/shared/             pure game logic (board, solver, scoring, elo) + tests in test/
src/worker/             Hono API, auth, finalization, OG injection
src/app/                Preact SPA (home / lounge / game / results)
```

## Costs

$0 on Cloudflare's free tier. The binding limits that matter: 100k
requests/day, 10ms CPU/request, 100k D1 row-writes/day (≈1,500 finished
games/day — a found word is one row). A friends group won't get near any of
these.
