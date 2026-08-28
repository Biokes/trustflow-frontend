/**
 * Tests for the optimistic escrow state store.
 */
import {
  applyOptimisticUpdate,
  confirmUpdate,
  rollbackUpdate,
  getOptimisticState,
  getEffectiveStatus,
  getPendingTransitions,
  clearAll,
  subscribe,
  getSnapshot,
  getServerSnapshot,
  onRollback,
} from './escrow-state'
import type { MilestoneKey } from './types'
import type { RollbackEvent } from './types'

beforeEach(() => {
  clearAll()
})

const key: MilestoneKey = { gigId: 'abc123', milestoneIndex: 0 }
const key2: MilestoneKey = { gigId: 'abc123', milestoneIndex: 1 }

describe('applyOptimisticUpdate', () => {
  it('applies a valid transition and stores optimistic state', () => {
    applyOptimisticUpdate(key, 'Pending', 'Funded')

    const state = getOptimisticState(key)
    expect(state).not.toBeNull()
    expect(state!.status).toBe('Funded')
    expect(state!.previousStatus).toBe('Pending')
    expect(state!.isOptimistic).toBe(true)
    expect(state!.transactionId).toBeTruthy()
  })

  it('throws on an invalid transition', () => {
    expect(() => applyOptimisticUpdate(key, 'Pending', 'Released')).toThrow(
      /Invalid escrow transition/,
    )
  })

  it('throws when transitioning from a terminal state', () => {
    expect(() => applyOptimisticUpdate(key, 'Released', 'Funded')).toThrow(
      /Invalid escrow transition/,
    )
  })

  it('uses a provided transactionId', () => {
    applyOptimisticUpdate(key, 'Pending', 'Funded', 'tx-custom-id')

    const state = getOptimisticState(key)
    expect(state!.transactionId).toBe('tx-custom-id')
  })

  it('increments the snapshot version', () => {
    const v0 = getSnapshot().version
    applyOptimisticUpdate(key, 'Pending', 'Funded')
    expect(getSnapshot().version).toBeGreaterThan(v0)
  })
})

describe('confirmUpdate', () => {
  it('clears the optimistic flag but keeps the entry', () => {
    applyOptimisticUpdate(key, 'Funded', 'Released')
    confirmUpdate(key)

    const state = getOptimisticState(key)
    expect(state).not.toBeNull()
    expect(state!.isOptimistic).toBe(false)
    expect(state!.status).toBe('Released')
  })

  it('does nothing if the key does not exist', () => {
    // Should not throw
    confirmUpdate({ gigId: 'nonexistent', milestoneIndex: 99 })
  })
})

describe('rollbackUpdate', () => {
  it('removes the entry from the store', () => {
    applyOptimisticUpdate(key, 'Funded', 'Released')
    rollbackUpdate(key, 'test failure')

    const state = getOptimisticState(key)
    expect(state).toBeNull()
  })

  it('emits a RollbackEvent to registered listeners', () => {
    const events: RollbackEvent[] = []
    const unsub = onRollback((event) => events.push(event))

    applyOptimisticUpdate(key, 'Funded', 'Released')
    rollbackUpdate(key, 'tx rejected')

    expect(events).toHaveLength(1)
    expect(events[0].previousStatus).toBe('Funded')
    expect(events[0].attemptedStatus).toBe('Released')
    expect(events[0].reason).toBe('tx rejected')
    expect(events[0].key).toEqual(key)

    unsub()
  })

  it('does nothing if the key does not exist', () => {
    // Should not throw
    rollbackUpdate({ gigId: 'nonexistent', milestoneIndex: 99 }, 'noop')
  })
})

describe('getEffectiveStatus', () => {
  it('returns on-chain status when no optimistic update exists', () => {
    expect(getEffectiveStatus(key, 'Pending')).toBe('Pending')
  })

  it('returns optimistic status when an update exists', () => {
    applyOptimisticUpdate(key, 'Pending', 'Funded')
    expect(getEffectiveStatus(key, 'Pending')).toBe('Funded')
  })
})

describe('getPendingTransitions', () => {
  it('returns only in-flight optimistic entries', () => {
    applyOptimisticUpdate(key, 'Pending', 'Funded')
    applyOptimisticUpdate(key2, 'Funded', 'Released')
    confirmUpdate(key)

    const pending = getPendingTransitions()
    expect(pending).toHaveLength(1)
    expect(pending[0].state.status).toBe('Released')
  })
})

describe('subscribe / getSnapshot', () => {
  it('notifies listeners on mutations', () => {
    const listener = jest.fn()
    const unsub = subscribe(listener)

    applyOptimisticUpdate(key, 'Pending', 'Funded')
    expect(listener).toHaveBeenCalledTimes(1)

    confirmUpdate(key)
    expect(listener).toHaveBeenCalledTimes(2)

    unsub()
  })

  it('unsubscribed listener is not called', () => {
    const listener = jest.fn()
    const unsub = subscribe(listener)
    unsub()

    applyOptimisticUpdate(key, 'Pending', 'Funded')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('getServerSnapshot', () => {
  it('returns an empty snapshot', () => {
    const snap = getServerSnapshot()
    expect(snap.version).toBe(0)
    expect(snap.entries.size).toBe(0)
  })
})

describe('multiple concurrent transitions', () => {
  it('tracks independent milestones separately', () => {
    applyOptimisticUpdate(key, 'Pending', 'Funded')
    applyOptimisticUpdate(key2, 'Funded', 'Released')

    expect(getOptimisticState(key)!.status).toBe('Funded')
    expect(getOptimisticState(key2)!.status).toBe('Released')

    rollbackUpdate(key, 'failed')
    expect(getOptimisticState(key)).toBeNull()
    expect(getOptimisticState(key2)!.status).toBe('Released')
  })
})

describe('clearAll', () => {
  it('empties the store', () => {
    applyOptimisticUpdate(key, 'Pending', 'Funded')
    applyOptimisticUpdate(key2, 'Funded', 'Released')
    clearAll()

    expect(getOptimisticState(key)).toBeNull()
    expect(getOptimisticState(key2)).toBeNull()
    expect(getPendingTransitions()).toHaveLength(0)
  })
})
