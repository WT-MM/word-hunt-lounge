import type { Env } from './env'

/**
 * The binary trie is precompiled at build time and shipped as a static asset
 * (free-tier Workers get 10ms CPU/request — parsing the raw word list at
 * runtime is not an option). Fetching + viewing the buffer is wall time, not
 * CPU time; cached per isolate.
 */
let triePromise: Promise<Uint32Array> | null = null

export function loadTrie(env: Env, requestUrl: string): Promise<Uint32Array> {
  if (!triePromise) {
    triePromise = (async () => {
      const url = new URL('/dict/trie.bin', requestUrl).toString()
      const res = await env.ASSETS.fetch(url)
      if (!res.ok) throw new Error(`dictionary asset missing (${res.status})`)
      return new Uint32Array(await res.arrayBuffer())
    })().catch((err) => {
      triePromise = null // allow retry on transient failure
      throw err
    })
  }
  return triePromise
}
