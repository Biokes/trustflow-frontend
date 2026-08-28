/**
 * React hook that wraps useEscrowContract with optimistic UI updates.
 *
 * Provides the same deposit/release/refund API as useEscrowContract, but
 * instantly reflects state changes in the UI and automatically rolls back
 * if the on-chain transaction fails.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useEscrowContract } from './useEscrowContract'
import type { MilestoneStatus } from '../shared/contracts-gen/escrow'
import type { MilestoneKey, RollbackEvent, OptimisticMilestoneState } from '../shared/optimistic/types'
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  applyOptimisticUpdate,
  confirmUpdate,
  rollbackUpdate,
  getOptimisticState,
  getEffectiveStatus,
  getPendingTransitions,
  onRollback,
  type OptimisticEscrowSnapshot,
} from '../shared/optimistic/escrow-state'

export type { RollbackEvent, OptimisticMilestoneState }

/** Encode a Buffer gigId to a stable hex string for use as a map key. */
function gigIdToHex(gigId: Buffer): string {
  return Buffer.from(gigId).toString('hex')
}

export interface UseOptimisticEscrowOptions {
  /** Called when a rollback occurs; useful for triggering toast notifications. */
  onRollback?: (event: RollbackEvent) => void
}

export interface UseOptimisticEscrowResult {
  /** Deposit funds into a milestone with optimistic update. */
  deposit: (
    gigId: Buffer,
    milestoneIndex: number,
    token: string,
    amount: bigint,
    currentStatus: MilestoneStatus,
  ) => Promise<void>

  /** Release escrowed funds with optimistic update. */
  release: (
    gigId: Buffer,
    milestoneIndex: number,
    currentStatus: MilestoneStatus,
  ) => Promise<void>

  /** Refund escrowed funds with optimistic update. */
  refund: (
    gigId: Buffer,
    milestoneIndex: number,
    currentStatus: MilestoneStatus,
  ) => Promise<void>

  /** Get the effective status for a milestone (optimistic if pending, on-chain otherwise). */
  getStatus: (gigId: Buffer, milestoneIndex: number, onChainStatus: MilestoneStatus) => MilestoneStatus

  /** Check if a specific milestone has an unconfirmed optimistic update. */
  isOptimistic: (gigId: Buffer, milestoneIndex: number) => boolean

  /** All currently in-flight optimistic transitions. */
  pendingTransitions: ReadonlyArray<{ key: string; state: OptimisticMilestoneState }>

  /** Store snapshot version for fine-grained re-render control. */
  snapshot: OptimisticEscrowSnapshot

  /** Whether the underlying escrow contract is configured and ready. */
  isReady: boolean

  /** Last error from the underlying contract call. */
  error: string | null

  /** Clear the last error. */
  clearError: () => void
}

export function useOptimisticEscrow(
  options: UseOptimisticEscrowOptions = {},
): UseOptimisticEscrowResult {
  const escrow = useEscrowContract()

  // Subscribe to the optimistic store for re-renders
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Register the rollback callback
  useEffect(() => {
    if (!options.onRollback) return
    return onRollback(options.onRollback)
  }, [options.onRollback])

  const deposit = useCallback(
    async (
      gigId: Buffer,
      milestoneIndex: number,
      token: string,
      amount: bigint,
      currentStatus: MilestoneStatus,
    ) => {
      const key: MilestoneKey = { gigId: gigIdToHex(gigId), milestoneIndex }

      // Apply optimistic update: Pending → Funded
      applyOptimisticUpdate(key, currentStatus, 'Funded')

      try {
        await escrow.deposit(gigId, milestoneIndex, token, amount)
        confirmUpdate(key)
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Deposit transaction failed'
        rollbackUpdate(key, reason)
        throw err
      }
    },
    [escrow],
  )

  const release = useCallback(
    async (
      gigId: Buffer,
      milestoneIndex: number,
      currentStatus: MilestoneStatus,
    ) => {
      const key: MilestoneKey = { gigId: gigIdToHex(gigId), milestoneIndex }

      // Apply optimistic update: Funded/Disputed → Released
      applyOptimisticUpdate(key, currentStatus, 'Released')

      try {
        await escrow.release(gigId, milestoneIndex)
        confirmUpdate(key)
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Release transaction failed'
        rollbackUpdate(key, reason)
        throw err
      }
    },
    [escrow],
  )

  const refund = useCallback(
    async (
      gigId: Buffer,
      milestoneIndex: number,
      currentStatus: MilestoneStatus,
    ) => {
      const key: MilestoneKey = { gigId: gigIdToHex(gigId), milestoneIndex }

      // Apply optimistic update: Funded/Disputed → Refunded
      applyOptimisticUpdate(key, currentStatus, 'Refunded')

      try {
        await escrow.refund(gigId, milestoneIndex)
        confirmUpdate(key)
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Refund transaction failed'
        rollbackUpdate(key, reason)
        throw err
      }
    },
    [escrow],
  )

  const getStatus = useCallback(
    (gigId: Buffer, milestoneIndex: number, onChainStatus: MilestoneStatus): MilestoneStatus => {
      const key: MilestoneKey = { gigId: gigIdToHex(gigId), milestoneIndex }
      return getEffectiveStatus(key, onChainStatus)
    },
    [],
  )

  const isOptimisticFn = useCallback(
    (gigId: Buffer, milestoneIndex: number): boolean => {
      const key: MilestoneKey = { gigId: gigIdToHex(gigId), milestoneIndex }
      const state = getOptimisticState(key)
      return state?.isOptimistic ?? false
    },
    [],
  )

  return {
    deposit,
    release,
    refund,
    getStatus,
    isOptimistic: isOptimisticFn,
    pendingTransitions: getPendingTransitions(),
    snapshot,
    isReady: escrow.isReady,
    error: escrow.error,
    clearError: escrow.clearError,
  }
}
