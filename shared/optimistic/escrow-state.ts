/**
 * Optimistic escrow state store.
 *
 * Framework-agnostic, singleton-pattern store that tracks in-flight
 * milestone state transitions. Designed for React's `useSyncExternalStore`
 * but usable from any subscriber model.
 *
 * Follows the same module-level cache/pub-sub pattern as
 * shared/contract-events/store.ts.
 */
import type { MilestoneStatus } from '../contracts-gen/escrow'
import type {
  MilestoneKey,
  OptimisticMilestoneState,
  RollbackEvent,
  RollbackListener,
} from './types'
import { milestoneKeyToString, VALID_TRANSITIONS } from './types'

// ── Internal State ─────────────────────────────────────────────

/** In-memory map of milestone key → optimistic state. */
const store = new Map<string, OptimisticMilestoneState>()

/** Monotonically-increasing version counter; changes on every mutation so React can re-render. */
let version = 0

/** Subscribed React listeners (from useSyncExternalStore). */
const listeners = new Set<() => void>()

/** Rollback event subscribers (for toast notifications, analytics, etc.). */
const rollbackListeners = new Set<RollbackListener>()

// ── Snapshot ───────────────────────────────────────────────────

export interface OptimisticEscrowSnapshot {
  /** Monotonic version — changes every time the store is mutated. */
  version: number
  /** All currently tracked optimistic states, keyed by `gigId:milestoneIndex`. */
  entries: ReadonlyMap<string, OptimisticMilestoneState>
}

function buildSnapshot(): OptimisticEscrowSnapshot {
  return { version, entries: store }
}

let cachedSnapshot: OptimisticEscrowSnapshot = buildSnapshot()

function invalidate(): void {
  version += 1
  cachedSnapshot = buildSnapshot()
  for (const listener of listeners) listener()
}

// ── Public API — useSyncExternalStore ──────────────────────────

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getSnapshot(): OptimisticEscrowSnapshot {
  return cachedSnapshot
}

export function getServerSnapshot(): OptimisticEscrowSnapshot {
  return { version: 0, entries: new Map() }
}

// ── Public API — Rollback Listeners ────────────────────────────

export function onRollback(listener: RollbackListener): () => void {
  rollbackListeners.add(listener)
  return () => { rollbackListeners.delete(listener) }
}

// ── Public API — Mutations ─────────────────────────────────────

/**
 * Immediately applies an optimistic status change for a milestone.
 * Validates against the legal transition table and throws if invalid.
 *
 * @returns The transactionId assigned to this optimistic update.
 */
export function applyOptimisticUpdate(
  key: MilestoneKey,
  currentStatus: MilestoneStatus,
  nextStatus: MilestoneStatus,
  transactionId?: string,
): string {
  const validNext = VALID_TRANSITIONS[currentStatus]
  if (!validNext.includes(nextStatus)) {
    throw new Error(
      `Invalid escrow transition: ${currentStatus} → ${nextStatus}. ` +
      `Valid transitions from ${currentStatus}: ${validNext.join(', ') || 'none'}`
    )
  }

  const txId = transactionId ?? `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const storeKey = milestoneKeyToString(key)

  store.set(storeKey, {
    status: nextStatus,
    previousStatus: currentStatus,
    isOptimistic: true,
    transactionId: txId,
    appliedAt: Date.now(),
  })

  invalidate()
  return txId
}

/**
 * Confirms an optimistic update after the on-chain transaction succeeds.
 * Removes the optimistic flag so the UI no longer shows a pending indicator.
 */
export function confirmUpdate(key: MilestoneKey): void {
  const storeKey = milestoneKeyToString(key)
  const entry = store.get(storeKey)
  if (!entry) return

  store.set(storeKey, {
    ...entry,
    isOptimistic: false,
  })

  invalidate()
}

/**
 * Rolls back an optimistic update, restoring the previous status.
 * Emits a RollbackEvent to all registered rollback listeners.
 */
export function rollbackUpdate(key: MilestoneKey, reason: string): void {
  const storeKey = milestoneKeyToString(key)
  const entry = store.get(storeKey)
  if (!entry) return

  const rollbackEvent: RollbackEvent = {
    key,
    previousStatus: entry.previousStatus,
    attemptedStatus: entry.status,
    reason,
    rolledBackAt: Date.now(),
  }

  store.delete(storeKey)
  invalidate()

  for (const listener of rollbackListeners) {
    try { listener(rollbackEvent) } catch { /* swallow subscriber errors */ }
  }
}

/**
 * Returns the optimistic state for a specific milestone, or `null` if
 * no optimistic update is in flight.
 */
export function getOptimisticState(key: MilestoneKey): OptimisticMilestoneState | null {
  return store.get(milestoneKeyToString(key)) ?? null
}

/**
 * Returns the effective status for a milestone — the optimistic status
 * if one exists, otherwise the provided on-chain status.
 */
export function getEffectiveStatus(
  key: MilestoneKey,
  onChainStatus: MilestoneStatus,
): MilestoneStatus {
  const optimistic = store.get(milestoneKeyToString(key))
  return optimistic ? optimistic.status : onChainStatus
}

/**
 * Returns all currently pending (in-flight) optimistic entries.
 */
export function getPendingTransitions(): ReadonlyArray<{
  key: string
  state: OptimisticMilestoneState
}> {
  const pending: { key: string; state: OptimisticMilestoneState }[] = []
  for (const [key, state] of store) {
    if (state.isOptimistic) {
      pending.push({ key, state })
    }
  }
  return pending
}

/**
 * Clears all optimistic state. Useful for testing or hard resets.
 */
export function clearAll(): void {
  store.clear()
  invalidate()
}
