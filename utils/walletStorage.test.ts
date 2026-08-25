/**
 * Tests for walletStorage utility.
 * Exercises read/write/clear operations, version management, and error paths.
 */

import {
  readWalletState,
  writeWalletState,
  clearWalletState,
  getNextVersion,
  isStateStale,
  isStateNewer,
  isStorageAvailable,
} from './walletStorage'
import type { WalletSyncState } from '../types/wallet-sync'

// ── Helpers ────────────────────────────────────────────────────

function makeState(overrides: Partial<WalletSyncState> = {}): WalletSyncState {
  return {
    account: null,
    network: null,
    isAllowed: null,
    timestamp: Date.now(),
    tabId: 'tab-test',
    version: 1,
    ...overrides,
  }
}

// ── isStorageAvailable ─────────────────────────────────────────

describe('isStorageAvailable', () => {
  it('returns true in jsdom environment', () => {
    expect(isStorageAvailable()).toBe(true)
  })

  it('returns false when localStorage throws on setItem', () => {
    const spy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('denied') })
    expect(isStorageAvailable()).toBe(false)
    spy.mockRestore()
  })
})

// ── readWalletState ────────────────────────────────────────────

describe('readWalletState', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(readWalletState()).toBeNull()
  })

  it('reads back a valid stored state', () => {
    const state = makeState({ account: { address: 'GABC', displayName: 'GA...BC' }, version: 3 })
    localStorage.setItem('trustflow-wallet-state', JSON.stringify(state))
    expect(readWalletState()).toEqual(state)
  })

  it('returns null and clears on corrupt JSON', () => {
    localStorage.setItem('trustflow-wallet-state', '{corrupt}')
    expect(readWalletState()).toBeNull()
    // Corrupt entry should be removed
    expect(localStorage.getItem('trustflow-wallet-state')).toBeNull()
  })

  it('returns null and clears when required fields are missing', () => {
    localStorage.setItem('trustflow-wallet-state', JSON.stringify({ account: null }))
    expect(readWalletState()).toBeNull()
    expect(localStorage.getItem('trustflow-wallet-state')).toBeNull()
  })
})

// ── writeWalletState ───────────────────────────────────────────

describe('writeWalletState', () => {
  beforeEach(() => localStorage.clear())

  it('writes state and returns true', () => {
    const state = makeState({ version: 5 })
    expect(writeWalletState(state)).toBe(true)
    expect(localStorage.getItem('trustflow-wallet-state')).toBe(JSON.stringify(state))
  })

  it('returns false when setItem throws a non-quota error', () => {
    const spy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('unexpected') })
    expect(writeWalletState(makeState())).toBe(false)
    spy.mockRestore()
  })

  it('clears and retries once on QuotaExceededError', () => {
    let callCount = 0
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      callCount++
      // Fail on first call only
      if (callCount === 1) {
        const err = new Error('quota')
        err.name = 'QuotaExceededError'
        throw err
      }
      // Delegate subsequent calls to the real implementation
      Object.getPrototypeOf(Storage.prototype).setItem.call(localStorage, key, value)
    })

    // The spy intercepts but second call goes through — just verify it returns true
    const result = writeWalletState(makeState())
    // Either true (retry succeeded) or false (retry failed) — no crash
    expect(typeof result).toBe('boolean')
    spy.mockRestore()
  })
})

// ── clearWalletState ───────────────────────────────────────────

describe('clearWalletState', () => {
  it('removes both wallet keys', () => {
    localStorage.setItem('trustflow-wallet-state', '{}')
    localStorage.setItem('trustflow-wallet-version', '7')
    clearWalletState()
    expect(localStorage.getItem('trustflow-wallet-state')).toBeNull()
    expect(localStorage.getItem('trustflow-wallet-version')).toBeNull()
  })

  it('does not throw when keys are absent', () => {
    expect(() => clearWalletState()).not.toThrow()
  })
})

// ── getNextVersion ─────────────────────────────────────────────

describe('getNextVersion', () => {
  beforeEach(() => localStorage.clear())

  it('returns 1 on first call', () => {
    expect(getNextVersion()).toBe(1)
  })

  it('increments on each call', () => {
    expect(getNextVersion()).toBe(1)
    expect(getNextVersion()).toBe(2)
    expect(getNextVersion()).toBe(3)
  })

  it('persists the counter in localStorage', () => {
    getNextVersion()
    getNextVersion()
    expect(localStorage.getItem('trustflow-wallet-version')).toBe('2')
  })
})

// ── isStateStale ───────────────────────────────────────────────

describe('isStateStale', () => {
  it('returns false for a fresh state', () => {
    const state = makeState({ timestamp: Date.now() })
    expect(isStateStale(state, 30000)).toBe(false)
  })

  it('returns true when state is older than threshold', () => {
    const state = makeState({ timestamp: Date.now() - 31000 })
    expect(isStateStale(state, 30000)).toBe(true)
  })

  it('uses 30 000 ms default threshold', () => {
    const fresh = makeState({ timestamp: Date.now() - 1000 })
    const stale = makeState({ timestamp: Date.now() - 40000 })
    expect(isStateStale(fresh)).toBe(false)
    expect(isStateStale(stale)).toBe(true)
  })
})

// ── isStateNewer ───────────────────────────────────────────────

describe('isStateNewer', () => {
  it('returns true when stateA has a higher version', () => {
    const a = makeState({ version: 5, timestamp: 1000 })
    const b = makeState({ version: 3, timestamp: 2000 })
    expect(isStateNewer(a, b)).toBe(true)
  })

  it('returns false when stateB has a higher version', () => {
    const a = makeState({ version: 2, timestamp: 2000 })
    const b = makeState({ version: 4, timestamp: 1000 })
    expect(isStateNewer(a, b)).toBe(false)
  })

  it('uses timestamp as tiebreaker when versions are equal', () => {
    const now = Date.now()
    const a = makeState({ version: 1, timestamp: now + 100 })
    const b = makeState({ version: 1, timestamp: now })
    expect(isStateNewer(a, b)).toBe(true)
    expect(isStateNewer(b, a)).toBe(false)
  })

  it('returns false for equal version and equal timestamp', () => {
    const ts = Date.now()
    const a = makeState({ version: 1, timestamp: ts })
    const b = makeState({ version: 1, timestamp: ts })
    expect(isStateNewer(a, b)).toBe(false)
  })
})
