import { describe, expect, it } from 'vitest'
import { switchHapticsSupportedFor } from '../src/app/switch-haptics'

describe('iOS switch haptic support', () => {
  it('enables the native switch path on iOS 18 and newer', () => {
    expect(
      switchHapticsSupportedFor(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
        'iPhone',
        5,
      ),
    ).toBe(true)
    expect(
      switchHapticsSupportedFor(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15',
        'iPhone',
        5,
      ),
    ).toBe(true)
  })

  it('does not install the gesture-stealing overlay before iOS 18', () => {
    expect(
      switchHapticsSupportedFor(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15',
        'iPhone',
        5,
      ),
    ).toBe(false)
  })

  it('recognizes iPad desktop mode but rejects non-iOS touch devices', () => {
    expect(
      switchHapticsSupportedFor(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.5 Mobile/15E148 Safari/604.1',
        'MacIntel',
        5,
      ),
    ).toBe(true)
    expect(
      switchHapticsSupportedFor(
        'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
        'Linux armv8l',
        5,
      ),
    ).toBe(false)
  })
})
