/**
 * Tests for the useOptimisticEscrow hook.
 *
 * These tests verify that the hook correctly applies optimistic updates,
 * confirms them on success, and rolls back on failure.
 */
import { renderHook, act } from '@testing-library/react'
import { useOptimisticEscrow } from './useOptimisticEscrow'
import { clearAll, getOptimisticState } from '../shared/optimistic/escrow-state'
import type { MilestoneKey } from '../shared/optimistic/types'

// ── Mock the underlying escrow contract ────────────────────────

const mockDeposit = jest.fn<Promise<void>, [Buffer, number, string, bigint]>()
const mockRelease = jest.fn<Promise<void>, [Buffer, number]>()
const mockRefund = jest.fn<Promise<void>, [Buffer, number]>()
const mockGetBalance = jest.fn<Promise<bigint>, [Buffer, number]>()
const mockGetMilestones = jest.fn()
const mockClearError = jest.fn()

jest.mock('./useEscrowContract', () => ({
  useEscrowContract: () => ({
    deposit: mockDeposit,
    release: mockRelease,
    refund: mockRefund,
    getBalance: mockGetBalance,
    getMilestones: mockGetMilestones,
    isReady: true,
    error: null,
    clearError: mockClearError,
  }),
}))

// ── Helpers ────────────────────────────────────────────────────

const TEST_GIG_ID = Buffer.from('deadbeef', 'hex')
const TEST_GIG_HEX = 'deadbeef'

function makeKey(milestoneIndex: number): MilestoneKey {
  return { gigId: TEST_GIG_HEX, milestoneIndex }
}

// ── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  clearAll()
  jest.clearAllMocks()
})

describe('useOptimisticEscrow', () => {
  describe('deposit', () => {
    it('applies optimistic update before contract call and confirms on success', async () => {
      mockDeposit.mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useOptimisticEscrow())

      await act(async () => {
        await result.current.deposit(TEST_GIG_ID, 0, 'USDC', 1000n, 'Pending')
      })

      // After success, the optimistic entry should be confirmed (isOptimistic = false)
      const state = getOptimisticState(makeKey(0))
      expect(state).not.toBeNull()
      expect(state!.isOptimistic).toBe(false)
      expect(state!.status).toBe('Funded')
    })

    it('rolls back on deposit failure', async () => {
      mockDeposit.mockRejectedValueOnce(new Error('Insufficient balance'))

      const onRollbackFn = jest.fn()
      const { result } = renderHook(() => useOptimisticEscrow({ onRollback: onRollbackFn }))

      await expect(
        act(async () => {
          await result.current.deposit(TEST_GIG_ID, 0, 'USDC', 1000n, 'Pending')
        }),
      ).rejects.toThrow('Insufficient balance')

      // State should be rolled back
      const state = getOptimisticState(makeKey(0))
      expect(state).toBeNull()
    })
  })

  describe('release', () => {
    it('applies optimistic Released status and confirms on success', async () => {
      mockRelease.mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useOptimisticEscrow())

      await act(async () => {
        await result.current.release(TEST_GIG_ID, 0, 'Funded')
      })

      const state = getOptimisticState(makeKey(0))
      expect(state!.status).toBe('Released')
      expect(state!.isOptimistic).toBe(false)
    })

    it('rolls back on release failure', async () => {
      mockRelease.mockRejectedValueOnce(new Error('Not authorized'))

      const { result } = renderHook(() => useOptimisticEscrow())

      await expect(
        act(async () => {
          await result.current.release(TEST_GIG_ID, 0, 'Funded')
        }),
      ).rejects.toThrow('Not authorized')

      expect(getOptimisticState(makeKey(0))).toBeNull()
    })
  })

  describe('refund', () => {
    it('applies optimistic Refunded status and confirms on success', async () => {
      mockRefund.mockResolvedValueOnce(undefined)

      const { result } = renderHook(() => useOptimisticEscrow())

      await act(async () => {
        await result.current.refund(TEST_GIG_ID, 0, 'Funded')
      })

      const state = getOptimisticState(makeKey(0))
      expect(state!.status).toBe('Refunded')
      expect(state!.isOptimistic).toBe(false)
    })

    it('rolls back on refund failure', async () => {
      mockRefund.mockRejectedValueOnce(new Error('Transaction failed'))

      const { result } = renderHook(() => useOptimisticEscrow())

      await expect(
        act(async () => {
          await result.current.refund(TEST_GIG_ID, 0, 'Funded')
        }),
      ).rejects.toThrow('Transaction failed')

      expect(getOptimisticState(makeKey(0))).toBeNull()
    })
  })

  describe('getStatus', () => {
    it('returns on-chain status when no optimistic update exists', () => {
      const { result } = renderHook(() => useOptimisticEscrow())
      expect(result.current.getStatus(TEST_GIG_ID, 0, 'Pending')).toBe('Pending')
    })

    it('returns optimistic status when an update exists', () => {
      const { result } = renderHook(() => useOptimisticEscrow())

      // Manually apply an optimistic update via the store
      act(() => {
        const { applyOptimisticUpdate } = require('../shared/optimistic/escrow-state')
        applyOptimisticUpdate(makeKey(0), 'Pending', 'Funded')
      })

      expect(result.current.getStatus(TEST_GIG_ID, 0, 'Pending')).toBe('Funded')
    })
  })

  describe('isOptimistic', () => {
    it('returns false when no optimistic update exists', () => {
      const { result } = renderHook(() => useOptimisticEscrow())
      expect(result.current.isOptimistic(TEST_GIG_ID, 0)).toBe(false)
    })
  })
})
