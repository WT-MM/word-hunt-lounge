import { describe, expect, it } from 'vitest'
import { compileTrie, trieHas } from '../src/shared/trie'

describe('compileTrie / trieHas', () => {
  const words = ['cat', 'cats', 'catalog', 'dog', 'do', 'a', 'zymurgy']
  const trie = compileTrie(words)

  it('contains every inserted word', () => {
    for (const word of words) expect(trieHas(trie, word), word).toBe(true)
  })

  it('rejects prefixes that are not words', () => {
    expect(trieHas(trie, 'ca')).toBe(false)
    expect(trieHas(trie, 'catalo')).toBe(false)
    expect(trieHas(trie, 'zymurg')).toBe(false)
  })

  it('rejects non-members and extensions', () => {
    expect(trieHas(trie, 'cab')).toBe(false)
    expect(trieHas(trie, 'catss')).toBe(false)
    expect(trieHas(trie, 'dogs')).toBe(false)
    expect(trieHas(trie, '')).toBe(false)
  })

  it('skips words with characters outside a-z', () => {
    const t = compileTrie(['fine', 'BAD', 'hy-phen', 'café'])
    expect(trieHas(t, 'fine')).toBe(true)
    expect(trieHas(t, 'bad')).toBe(false)
  })

  it('survives a serialize round-trip through raw bytes', () => {
    const bytes = new Uint8Array(trie.buffer.slice(0))
    const revived = new Uint32Array(bytes.buffer)
    expect(trieHas(revived, 'catalog')).toBe(true)
    expect(trieHas(revived, 'catal')).toBe(false)
  })
})
