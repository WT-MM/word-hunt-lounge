-- Groups: a join-by-code space where members share boards. A lounge may
-- belong to a group (visible/playable by all members) or stand alone
-- (the original share-a-link flow). Timestamps are ms since epoch.

CREATE TABLE groups (
  id TEXT PRIMARY KEY,            -- short join code, also the URL slug
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES players(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  joined_at INTEGER NOT NULL,
  UNIQUE (group_id, player_id)
);
CREATE INDEX idx_group_members_player ON group_members(player_id);

ALTER TABLE lounges ADD COLUMN group_id TEXT REFERENCES groups(id);
CREATE INDEX idx_lounges_group ON lounges(group_id, created_at);
