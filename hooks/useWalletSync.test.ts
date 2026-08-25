/**
 * Tests for useWalletSync hook.
 *
 * Verifies that the hook correctly subscribes/unsubscribes to cross-tab events,
 * broadcasts state, and loads persisted state.
 */

import { renderHook, act } from '@testing-library/react'
import { useWalletSync } from './useWalletSync'
import { destroyWalletSyncManager, getWalletSyncManager } from '../utils/walletSyncManager'
import { WalletSyncMessageType } from '../types/wallet-sync'
import type { WalletSyncState } from '../types/wallet-sync'

// ── BroadcastChannel mock (same as walletSyncManager.test.ts) ──

class MockBroadcastChannel {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private static instances: MockBroadcastChannel[] = []

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown) {
    MockBroadcastChannel.instances.forEach((inst) => {
      if (inst !== this && inst.name === this.name && inst.onmessage) {
        inst.onmessage({ data } as MessageEvent)
      }
    })
  }

  close() {
    MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter(
      (i) => i !== this
    )
  }

  static reset() {
    MockBroadcastChannel.instances = []
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: MockBroadcastChannel,
    writable: true,
    configurable: true,
  })
})

beforeEach(() => {
  MockBroadcastChannel.reset()
  destroyWalletSyncManager()
  localStorage.clear()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  destroyWalletSyncManager()
})

// ── Helpers ────────────────────────────────────────────────────

function makeState(overrides: Partial<WalletSyncState> = {}): WalletSyncState {
  return {
    account: null,
    network: null,
    isAllowed: null,
    timestamp: Date.now(),
    tabId: 'tab-external',
    version: 1,
    ...overrides,
  }
}

// ── enabled flag ───────────────────────────────────────────────

describe('useWalletSync — enabled flag', () => {
  it('does not call onStateReceived when enabled=false', () => {
    const onStateReceived = jest.fn()
    renderHook(() => useWalletSync({ enabled: false, onStateReceived }))

    const mgr = getWalletSyncManager()
    mgr.initialize()

    // Simulate an incoming message
    act(() => {
      ;(mgr as any).listeners.forEach((l: (s: WalletSyncState) => void) =>
        l(makeState())
      )
    })

    expect(onStateReceived).not.toHaveBeenCalled()
  })
})

// ── onStateReceived ────────────────────────────────────────────

describe('useWalletSync — onStateReceived', () => {
  it('calls onStateReceived when another manager broadcasts a state update', () => {
    const onStateReceived = jest.fn()

    // Hook initializes its own manager
    renderHook(() => useWalletSync({ onStateReceived }))

    // A second "other tab" manager that sends a message
    const otherMgr = new MockBroadcastChannel('trustflow-wallet-sync')

    const incomingState = makeState({
      account: { address: 'GABC', displayName: 'GA...BC' },
      version: 5,
    })

    const message = {
      type: WalletSyncMessageType.STATE_UPDATE,
      state: incomingState,
      senderId: 'other-tab-id',
      timestamp: Date.now(),
    }

    act(() => {
      // Push the message into every registered channel listener
      ;(MockBroadcastChannel as any).instances.forEach((inst: MockBroadcastChannel) => {
        if (inst !== otherMgr && inst.onmessage) {
          inst.onmessage({ data: message } as MessageEvent)
        }
      })
    })

    expect(onStateReceived).toHaveBeenCalledWith(incomingState)
  })

  it('uses the latest onStateReceived without re-subscribing', () => {
    const first  = jest.fn()
    const second = jest.fn()

    const { rerender } = renderHook(
      ({ cb }) => useWalletSync({ onStateReceived: cb }),
      { initialProps: { cb: first } }
    )

    // Swap the callback
    rerender({ cb: second })

    const state = makeState()

    act(() => {
      ;(MockBroadcastChannel as any).instances.forEach((inst: MockBroadcastChannel) => {
        if (inst.onmessage) {
          inst.onmessage({
            data: {
              type: WalletSyncMessageType.STATE_UPDATE,
              state,
              senderId: 'other-tab',
              timestamp: Date.now(),
            },
          } as MessageEvent)
        }
      })
    })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(state)
  })
})

// ── onDisconnectReceived ───────────────────────────────────────

describe('useWalletSync — onDisconnectReceived', () => {
  it('calls onDisconnectReceived when another manager broadcasts disconnect', () => {
    const onDisconnectReceived = jest.fn()
    renderHook(() => useWalletSync({ onDisconnectReceived }))

    act(() => {
      ;(MockBroadcastChannel as any).instances.forEach((inst: MockBroadcastChannel) => {
        if (inst.onmessage) {
          inst.onmessage({
            data: {
              type: WalletSyncMessageType.DISCONNECT,
              senderId: 'other-tab',
              timestamp: Date.now(),
            },
          } as MessageEvent)
        }
      })
    })

    expect(onDisconnectReceived).toHaveBeenCalled()
  })
})

// ── broadcastState ─────────────────────────────────────────────

describe('useWalletSync — broadcastState', () => {
  it('broadcasts account + network + isAllowed to the sync manager', () => {
    const { result } = renderHook(() => useWalletSync({}))

    const mgr  = getWalletSyncManager()
    const spy  = jest.spyOn(mgr, 'broadcastState')

    const account = { address: 'GABC', displayName: 'GA...BC' }
    const network = {
      network: 'Testnet',
      networkUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    }

    act(() => {
      result.current.broadcastState(account, network, true)
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ account, network, isAllowed: true }),
      false
    )
  })

  it('does nothing when enabled=false', () => {
    const { result } = renderHook(() => useWalletSync({ enabled: false }))
    const mgr = getWalletSyncManager()
    const spy = jest.spyOn(mgr, 'broadcastState')

    act(() => {
      result.current.broadcastState(null, null, null)
    })

    expect(spy).not.toHaveBeenCalled()
  })
})

// ── broadcastDisconnect ────────────────────────────────────────

describe('useWalletSync — broadcastDisconnect', () => {
  it('calls broadcastDisconnect on the sync manager', () => {
    const { result } = renderHook(() => useWalletSync({}))
    const mgr = getWalletSyncManager()
    const spy = jest.spyOn(mgr, 'broadcastDisconnect')

    act(() => {
      result.current.broadcastDisconnect()
    })

    expect(spy).toHaveBeenCalled()
  })
})

// ── loadPersistedState ─────────────────────────────────────────

describe('useWalletSync — loadPersistedState', () => {
  it('returns null when nothing is stored', () => {
    const { result } = renderHook(() => useWalletSync({}))
    expect(result.current.loadPersistedState()).toBeNull()
  })

  it('returns state that was previously written to localStorage', () => {
    const state = makeState({ account: { address: 'GABC', displayName: 'GA...BC' } })
    localStorage.setItem('trustflow-wallet-state', JSON.stringify(state))

    const { result } = renderHook(() => useWalletSync({}))
    expect(result.current.loadPersistedState()).toEqual(state)
  })
})

// ── getTabId ───────────────────────────────────────────────────

describe('useWalletSync — getTabId', () => {
  it('returns a non-empty string', () => {
    const { result } = renderHook(() => useWalletSync({}))
    expect(typeof result.current.getTabId()).toBe('string')
    expect(result.current.getTabId().length).toBeGreaterThan(0)
  })
})

// ── cleanup ────────────────────────────────────────────────────

describe('useWalletSync — cleanup', () => {
  it('removes subscriptions on unmount so callbacks are no longer called', () => {
    const onStateReceived = jest.fn()
    const { unmount } = renderHook(() => useWalletSync({ onStateReceived }))

    unmount()

    act(() => {
      ;(MockBroadcastChannel as any).instances.forEach((inst: MockBroadcastChannel) => {
        if (inst.onmessage) {
          inst.onmessage({
            data: {
              type: WalletSyncMessageType.STATE_UPDATE,
              state: makeState(),
              senderId: 'other-tab',
              timestamp: Date.now(),
            },
          } as MessageEvent)
        }
      })
    })

    expect(onStateReceived).not.toHaveBeenCalled()
  })
})
