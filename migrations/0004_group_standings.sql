-- Per-group Elo ladder. A ranked board that belongs to a group updates BOTH
-- the player's global stats (players.rating/wins/...) and a separate standing
-- scoped to that group, computed among the board's participants who are group
-- members. Each group is its own league; players start at 1200 per group.

CREATE TABLE group_standings (
  group_id TEXT NOT NULL REFERENCES groups(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  rating INTEGER NOT NULL DEFAULT 1200,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, player_id)
);
