/**
 * Compiles data/enable1.txt into public/dict/trie.bin (flat binary trie).
 * Runs at build time (predev/prebuild) because the Workers free tier allows
 * only 10ms CPU per request — runtime dictionary parsing is banned (PLAN §3).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileTrie } from '../src/shared/trie'
import { MIN_WORD_LENGTH } from '../src/shared/score'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'data', 'enable1.txt')
const target = join(root, 'public', 'dict', 'trie.bin')

// 16 tiles, one of which may be 'qu' → longest traceable word is 17 letters.
const MAX_WORD_LENGTH = 17

const started = performance.now()
const words = readFileSync(source, 'utf8')
  .split('\n')
  .map((w) => w.trim())
  .filter((w) => w.length >= MIN_WORD_LENGTH && w.length <= MAX_WORD_LENGTH && /^[a-z]+$/.test(w))

const trie = compileTrie(words)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, Buffer.from(trie.buffer, trie.byteOffset, trie.byteLength))

console.log(
  `build-dict: ${words.length} words -> ${trie.length} entries ` +
    `(${(trie.byteLength / 1024 / 1024).toFixed(2)} MB) in ${(performance.now() - started).toFixed(0)}ms`,
)
