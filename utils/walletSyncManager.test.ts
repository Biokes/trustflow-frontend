/**
 * Tests for WalletSyncManager and singleton helpers.
 *
 * BroadcastChannel is not available in jsdom, so we provide a minimal mock
 * and verify the manager falls back to localStorage storage events when the
 * constructor throws.
 */

import {
  WalletSyncManager,
  getWalletSyncManager,
  destroyWalletSyncManager,
} from './walletSyncManager'
import { WalletSyncMessageType } from '../types/wallet-sync'
import type { WalletSyncMessage, WalletSyncState } from '../types/wallet-sync'

// ── BroadcastChannel mock ──────────────────────────────────────

class MockBroadcastChannel {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private static instances: MockBroadcastChannel[] = []

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown) {
    // Deliver to all other instances with the same channel name
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

// ── Helpers ────────────────────────────────────────────────────

function makeState(overrides: Partial<WalletSyncState> = {}): WalletSyncState {
  return {
    account: null,
    network: null,
    isAllowed: null,
    timestamp: Date.now(),
    tabId: 'tab-a',
    version: 1,
    ...overrides,
  }
}

// ── Setup / teardown ───────────────────────────────────────────

beforeAll(() => {
  // Install the mock globally before any test runs
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

// ── generateTabId ──────────────────────────────────────────────

describe('WalletSyncManager tab ID', () => {
  it('each instance gets a unique tab ID', () => {
    const a = new WalletSyncManager()
    const b = new WalletSyncManager()
    expect(a.getTabId()).not.toBe(b.getTabId())
    a.destroy()
    b.destroy()
  })
})

// ── initialize ────────────────────────────────────────────────

describe('WalletSyncManager.initialize', () => {
  it('is idempotent — calling twice does not throw', () => {
    const mgr = new WalletSyncManager()
    expect(() => {
      mgr.initialize()
      mgr.initialize()
    }).not.toThrow()
    mgr.destroy()
  })
})

// ── broadcastState ─────────────────────────────────────────────

describe('WalletSyncManager.broadcastState', () => {
  it('delivers STATE_UPDATE to a second manager after debounce', () => {
    const sender   = new WalletSyncManager({ broadcastDebounceMs: 50 })
    const receiver = new WalletSyncManager({ broadcastDebounceMs: 50 })
    sender.initialize()
    receiver.initialize()

    const received: WalletSyncState[] = []
    receiver.onStateUpdate((s) => received.push(s))

    const state = makeState({ tabId: sender.getTabId(), version: 2 })
    sender.broadcastState(state, false)

    // Nothing yet — still within debounce window
    expect(received).toHaveLength(0)

    jest.advanceTimersByTime(100)

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(state)

    sender.destroy()
    receiver.destroy()
  })

  it('delivers immediately when immediate=true', () => {
    const sender   = new WalletSyncManager()
    const receiver = new WalletSyncManager()
    sender.initialize()
    receiver.initialize()

    const received: WalletSyncState[] = []
    receiver.onStateUpdate((s) => received.push(s))

    sender.broadcastState(makeState({ tabId: sender.getTabId() }), true)

    expect(received).toHaveLength(1)

    sender.destroy()
    receiver.destroy()
  })

  it('does not deliver own messages back to sender', () => {
    const mgr = new WalletSyncManager()
    mgr.initialize()

    const received: WalletSyncState[] = []
    mgr.onStateUpdate((s) => received.push(s))

    mgr.broadcastState(makeState({ tabId: mgr.getTabId() }), true)

    // Message has the same senderId as this manager — must be ignored
    expect(received).toHaveLength(0)

    mgr.destroy()
  })

  it('debounces rapid consecutive calls and sends only the last state', () => {
    const sender   = new WalletSyncManager({ broadcastDebounceMs: 100 })
    const receiver = new WalletSyncManager({ broadcastDebounceMs: 100 })
    sender.initialize()
    receiver.initialize()

    const received: WalletSyncState[] = []
    receiver.onStateUpdate((s) => received.push(s))

    sender.broadcastState(makeState({ version: 1 }), false)
    sender.broadcastState(makeState({ version: 2 }), false)
    sender.broadcastState(makeState({ version: 3 }), false)

    jest.advanceTimersByTime(200)

    // Only the last state should arrive
    expect(received).toHaveLength(1)
    expect(received[0].version).toBe(3)

    sender.destroy()
    receiver.destroy()
  })
})

// ── broadcastDisconnect ────────────────────────────────────────

describe('WalletSyncManager.broadcastDisconnect', () => {
  it('fires disconnect listeners on all receiving managers', () => {
    const sender    = new WalletSyncManager()
    const receiver1 = new WalletSyncManager()
    const receiver2 = new WalletSyncManager()
    sender.initialize()
    receiver1.initialize()
    receiver2.initialize()

    const calls: string[] = []
    receiver1.onDisconnect(() => calls.push('r1'))
    receiver2.onDisconnect(() => calls.push('r2'))

    sender.broadcastDisconnect()

    expect(calls).toContain('r1')
    expect(calls).toContain('r2')

    sender.destroy()
    receiver1.destroy()
    receiver2.destroy()
  })

  it('does not fire disconnect on the sending manager itself', () => {
    const mgr = new WalletSyncManager()
    mgr.initialize()

    let called = false
    mgr.onDisconnect(() => { called = true })
    mgr.broadcastDisconnect()

    expect(called).toBe(false)
    mgr.destroy()
  })
})

// ── onStateUpdate / onDisconnect unsubscribe ───────────────────

describe('WalletSyncManager listener cleanup', () => {
  it('unsubscribes state listener when returned function is called', () => {
    const sender   = new WalletSyncManager()
    const receiver = new WalletSyncManager()
    sender.initialize()
    receiver.initialize()

    const received: WalletSyncState[] = []
    const unsub = receiver.onStateUpdate((s) => received.push(s))
    unsub()

    sender.broadcastState(makeState(), true)
    expect(received).toHaveLength(0)

    sender.destroy()
    receiver.destroy()
  })

  it('unsubscribes disconnect listener when returned function is called', () => {
    const sender   = new WalletSyncManager()
    const receiver = new WalletSyncManager()
    sender.initialize()
    receiver.initialize()

    let called = false
    const unsub = receiver.onDisconnect(() => { called = true })
    unsub()

    sender.broadcastDisconnect()
    expect(called).toBe(false)

    sender.destroy()
    receiver.destroy()
  })
})

// ── loadPersistedState ─────────────────────────────────────────

describe('WalletSyncManager.loadPersistedState', () => {
  it('returns null when nothing is stored', () => {
    const mgr = new WalletSyncManager()
    mgr.initialize()
    expect(mgr.loadPersistedState()).toBeNull()
    mgr.destroy()
  })

  it('returns previously broadcast state from localStorage', () => {
    const sender   = new WalletSyncManager()
    const receiver = new WalletSyncManager()
    sender.initialize()
    receiver.initialize()

    const state = makeState({ account: { address: 'GABC', displayName: 'GA...BC' }, version: 7 })
    sender.broadcastState(state, true)

    expect(receiver.loadPersistedState()).toEqual(state)

    sender.destroy()
    receiver.destroy()
  })
})

// ── singleton helpers ──────────────────────────────────────────

describe('getWalletSyncManager / destroyWalletSyncManager', () => {
  it('returns the same instance on every call', () => {
    const a = getWalletSyncManager()
    const b = getWalletSyncManager()
    expect(a).toBe(b)
  })

  it('creates a fresh instance after destroy', () => {
    const a = getWalletSyncManager()
    destroyWalletSyncManager()
    const b = getWalletSyncManager()
    expect(a).not.toBe(b)
  })
})

// ── destroy ────────────────────────────────────────────────────

describe('WalletSyncManager.destroy', () => {
  it('clears all listeners so no callbacks fire after destroy', () => {
    const sender   = new WalletSyncManager()
    const receiver = new WalletSyncManager()
    sender.initialize()
    receiver.initialize()

    let stateCallCount = 0
    let disconnectCallCount = 0
    receiver.onStateUpdate(() => { stateCallCount++ })
    receiver.onDisconnect(() => { disconnectCallCount++ })

    receiver.destroy()

    sender.broadcastState(makeState(), true)
    sender.broadcastDisconnect()

    expect(stateCallCount).toBe(0)
    expect(disconnectCallCount).toBe(0)

    sender.destroy()
  })
})

// ── localStorage fallback ──────────────────────────────────────

describe('WalletSyncManager localStorage fallback', () => {
  it('falls back gracefully when BroadcastChannel constructor throws', () => {
    // Temporarily break BroadcastChannel
    const origBC = (globalThis as any).BroadcastChannel
    ;(globalThis as any).BroadcastChannel = class {
      constructor() { throw new Error('not supported') }
    }

    const mgr = new WalletSyncManager()
    expect(() => mgr.initialize()).not.toThrow()

    mgr.destroy()
    ;(globalThis as any).BroadcastChannel = origBC
  })
})
