-- Pairwise win/loss/tie records. Each finalized ranked board contributes one
-- comparison per pair of participants; a player's tallies sum their results
-- across all such pairs (matching the pairwise Elo model).

ALTER TABLE players ADD COLUMN wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN losses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN ties INTEGER NOT NULL DEFAULT 0;
