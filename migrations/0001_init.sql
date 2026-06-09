-- Word Hunt Lounge initial schema. Timestamps are ms since epoch.

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  claim_code TEXT NOT NULL UNIQUE,
  rating INTEGER NOT NULL DEFAULT 1200,
  games_played INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE lounges (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('casual', 'ranked')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finalized')),
  board TEXT NOT NULL,            -- 16 tiles space-joined; 'qu' is one tile
  seed INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  solutions TEXT NOT NULL,        -- JSON {word: score}; never selected by polling queries
  word_count INTEGER NOT NULL,    -- solutions size, denormalized for polling reads
  deadline_at INTEGER,            -- NULL for casual
  rematch_code TEXT,
  created_by TEXT NOT NULL REFERENCES players(id),
  created_at INTEGER NOT NULL,
  finalized_at INTEGER
);
CREATE INDEX idx_lounges_sweep ON lounges(status, deadline_at);

CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  lounge_id TEXT NOT NULL REFERENCES lounges(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  started_at INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  finished_at INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  UNIQUE (lounge_id, player_id)
);
CREATE INDEX idx_rounds_player ON rounds(player_id);

CREATE TABLE found_words (
  round_id TEXT NOT NULL REFERENCES rounds(id),
  word TEXT NOT NULL,
  score INTEGER NOT NULL,
  found_at INTEGER NOT NULL,
  UNIQUE (round_id, word)
);

CREATE TABLE rating_events (
  id TEXT PRIMARY KEY,
  lounge_id TEXT NOT NULL REFERENCES lounges(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  delta INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_player ON rating_events(player_id);
CREATE INDEX idx_events_lounge ON rating_events(lounge_id);
