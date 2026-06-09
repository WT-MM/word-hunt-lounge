/** Submission latency grace beyond a round's end (server-enforced). */
export const GRACE_MS = 3000

export const DEFAULT_DURATION_S = 80
/** UI offers 60/80/120; the API range is loose so tests can run short rounds. */
export const MIN_DURATION_S = 5
export const MAX_DURATION_S = 300

export const DEFAULT_RANKED_WINDOW_H = 24
/** UI offers 1/6/24; the API range is loose so tests can run short windows. */
export const MIN_RANKED_WINDOW_H = 0.005
export const MAX_RANKED_WINDOW_H = 168

/** A ranked lounge with fewer completed rounds finalizes without rating changes. */
export const MIN_PLAYERS_TO_RATE = 2
