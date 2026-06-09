/** GamePigeon Word Hunt scoring. Length counts letters, so a Qu tile adds 2. */
const TABLE = [0, 0, 0, 100, 400, 800, 1400, 1800, 2200]

export const MIN_WORD_LENGTH = 3

export function wordScore(length: number): number {
  if (length < MIN_WORD_LENGTH) return 0
  if (length < TABLE.length) return TABLE[length]
  return TABLE[TABLE.length - 1] + (length - (TABLE.length - 1)) * 400
}
