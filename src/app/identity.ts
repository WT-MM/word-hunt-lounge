export interface Identity {
  id: string
  token: string
  name: string
  claimCode: string
}

const KEY = 'whl.identity'
export const IDENTITY_CLEARED_EVENT = 'whl:identity-cleared'

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.id && parsed?.token) return parsed as Identity
  } catch {
    /* corrupted storage */
  }
  return null
}

export function saveIdentity(identity: Identity): void {
  localStorage.setItem(KEY, JSON.stringify(identity))
}

export function clearIdentity(): void {
  localStorage.removeItem(KEY)
  window.dispatchEvent(new Event(IDENTITY_CLEARED_EVENT))
}
