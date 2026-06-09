/**
 * Flat binary trie. One uint32 per entry (an entry = one child edge/node):
 *   bits 0-4   letter index (0=a .. 25=z)
 *   bit  5     terminal (a word ends here)
 *   bit  6     last sibling in its group
 *   bits 7-31  first-child group start + 1 (0 = no children)
 * Children of a node are contiguous ("group"); the root's group starts at 0.
 *
 * Built once at build time (scripts/build-dict.ts) and shipped as a static
 * asset; the Worker free tier has a 10ms CPU limit, so runtime parsing of the
 * raw word list is not an option. Loading is just `new Uint32Array(buffer)`.
 */

const TERMINAL = 1 << 5
const LAST_SIBLING = 1 << 6
const CHILD_SHIFT = 7

interface BuildNode {
  children: Map<number, BuildNode>
  terminal: boolean
}

function newNode(): BuildNode {
  return { children: new Map(), terminal: false }
}

/** Build + serialize. Words must be lowercase a-z; others are skipped. */
export function compileTrie(words: Iterable<string>): Uint32Array {
  const root = newNode()
  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) continue
    let node = root
    for (let i = 0; i < word.length; i++) {
      const letter = word.charCodeAt(i) - 97
      let child = node.children.get(letter)
      if (!child) {
        child = newNode()
        node.children.set(letter, child)
      }
      node = child
    }
    node.terminal = true
  }

  // Breadth-first layout: append each node's child group, patching the
  // parent entry's child pointer once the group's position is known.
  const entries: number[] = []
  const queue: Array<{ node: BuildNode; parentEntry: number }> = [
    { node: root, parentEntry: -1 },
  ]
  for (let head = 0; head < queue.length; head++) {
    const { node, parentEntry } = queue[head]
    if (node.children.size === 0) continue
    const groupStart = entries.length
    if (parentEntry >= 0) entries[parentEntry] |= (groupStart + 1) << CHILD_SHIFT
    const letters = [...node.children.keys()].sort((a, b) => a - b)
    for (let i = 0; i < letters.length; i++) {
      const child = node.children.get(letters[i])!
      let entry = letters[i]
      if (child.terminal) entry |= TERMINAL
      if (i === letters.length - 1) entry |= LAST_SIBLING
      const entryIndex = entries.length
      entries.push(entry)
      queue.push({ node: child, parentEntry: entryIndex })
    }
  }
  if (entries.length >= 1 << (32 - CHILD_SHIFT)) {
    throw new Error(`trie too large: ${entries.length} entries`)
  }
  return Uint32Array.from(entries)
}

/** Entry index of `letter` in the group starting at `groupStart`, or -1. */
export function findChild(trie: Uint32Array, groupStart: number, letter: number): number {
  if (groupStart < 0 || groupStart >= trie.length) return -1
  for (let i = groupStart; ; i++) {
    const entry = trie[i]
    if ((entry & 31) === letter) return i
    if (entry & LAST_SIBLING) return -1
  }
}

export function isTerminal(entry: number): boolean {
  return (entry & TERMINAL) !== 0
}

/** Group start of an entry's children, or -1 if it has none. */
export function childGroup(entry: number): number {
  return (entry >>> CHILD_SHIFT) - 1
}

/** Membership test (for tests and tooling; the solver walks the trie itself). */
export function trieHas(trie: Uint32Array, word: string): boolean {
  let group = 0
  let entry = 0
  for (let i = 0; i < word.length; i++) {
    const index = findChild(trie, group, word.charCodeAt(i) - 97)
    if (index < 0) return false
    entry = trie[index]
    group = childGroup(entry)
  }
  return word.length > 0 && isTerminal(entry)
}
