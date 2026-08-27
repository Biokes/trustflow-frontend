/**
 * Types for the optimistic escrow state layer.
 *
 * The MilestoneStatus type is imported from the generated contract bindings
 * so that the optimistic layer stays in sync with the on-chain schema.
 */
import type { MilestoneStatus } from '../contracts-gen/escrow'

// ── Legal State Transitions ────────────────────────────────────

/**
 * All valid escrow state transitions that the optimistic layer will accept.
 * Any transition not represented here will be rejected at the type level.
 */
export type EscrowTransition =
  | { from: 'Pending';  to: 'Funded' }
  | { from: 'Funded';   to: 'Released' }
  | { from: 'Funded';   to: 'Disputed' }
  | { from: 'Funded';   to: 'Refunded' }
  | { from: 'Disputed'; to: 'Released' }
  | { from: 'Disputed'; to: 'Refunded' }

/**
 * A lookup table of valid next-statuses for each current status.
 */
export const VALID_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  Pending:   ['Funded'],
  Funded:    ['Released', 'Disputed', 'Refunded'],
  Completed: [],
  Released:  [],
  Disputed:  ['Released', 'Refunded'],
  Refunded:  [],
}

// ── Optimistic State ───────────────────────────────────────────

/**
 * Composite key used to track a single milestone in the optimistic store.
 * `gigId` is hex-encoded to avoid Buffer identity issues as map keys.
 */
export interface MilestoneKey {
  gigId: string
  milestoneIndex: number
}

/** Builds a deterministic string key from a MilestoneKey. */
export function milestoneKeyToString(key: MilestoneKey): string {
  return `${key.gigId}:${key.milestoneIndex}`
}

/**
 * The shape of an optimistic entry in the in-memory store.
 */
export interface OptimisticMilestoneState {
  /** Current status shown in the UI (the optimistic one). */
  status: MilestoneStatus
  /** The confirmed on-chain status before the optimistic update was applied. */
  previousStatus: MilestoneStatus
  /** True while the transaction is in-flight and unconfirmed. */
  isOptimistic: boolean
  /** Opaque identifier correlating this update with the Soroban transaction. */
  transactionId: string
  /** Timestamp (ms) when the optimistic update was applied, for staleness checks. */
  appliedAt: number
}

// ── Rollback Events ────────────────────────────────────────────

/**
 * Emitted when an optimistic update is rolled back due to a transaction
 * failure, timeout, or explicit cancellation.
 */
export interface RollbackEvent {
  key: MilestoneKey
  /** The status the milestone was restored to. */
  previousStatus: MilestoneStatus
  /** The status we optimistically tried to transition to. */
  attemptedStatus: MilestoneStatus
  /** Human-readable reason for the rollback. */
  reason: string
  /** Timestamp (ms) of the rollback. */
  rolledBackAt: number
}

/** Callback signature for rollback event subscribers. */
export type RollbackListener = (event: RollbackEvent) => void
