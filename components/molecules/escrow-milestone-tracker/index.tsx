import { useCallback, useState } from 'react'
import type { MilestoneStatus } from '../../../shared/contracts-gen/escrow'
import type { RollbackEvent } from '../../../shared/optimistic/types'
import { EscrowStateBadge } from '../../atoms/escrow-state-badge'
import styles from './escrow-milestone-tracker.module.css'

// ── Types ──────────────────────────────────────────────────────

export interface TrackerMilestone {
  /** Milestone index (0-based). */
  index: number
  /** Display label, e.g. "Design mockups". */
  label: string
  /** Amount in human-readable units (e.g. XLM or USDC). */
  amount: string
  /** Token symbol for display. */
  token: string
  /** Current confirmed on-chain status. */
  status: MilestoneStatus
}

export interface EscrowMilestoneTrackerProps {
  /** Hex-encoded gig ID. */
  gigId: string
  /** Ordered list of milestones for this gig. */
  milestones: TrackerMilestone[]
  /** Called to get the effective (possibly optimistic) status for a milestone. */
  getEffectiveStatus?: (milestoneIndex: number) => MilestoneStatus
  /** Whether each milestone has an optimistic update pending. */
  isOptimistic?: (milestoneIndex: number) => boolean
  /** Called when the user clicks "Fund" on a milestone. */
  onFund?: (milestoneIndex: number) => void
  /** Called when the user clicks "Release" on a milestone. */
  onRelease?: (milestoneIndex: number) => void
  /** Called when the user clicks "Dispute" on a milestone. */
  onDispute?: (milestoneIndex: number) => void
  /** Called when the user clicks "Refund" on a milestone. */
  onRefund?: (milestoneIndex: number) => void
  /** Most recent rollback event, used to flash the affected milestone. */
  lastRollback?: RollbackEvent | null
}

// ── Helpers ────────────────────────────────────────────────────

function getStepCircleClass(status: MilestoneStatus, isOpt: boolean): string {
  const classes = [styles.stepCircle]
  switch (status) {
    case 'Funded':
      classes.push(styles.funded)
      break
    case 'Released':
    case 'Completed':
      classes.push(styles.released)
      break
    case 'Disputed':
      classes.push(styles.disputed)
      break
    case 'Refunded':
      classes.push(styles.refunded)
      break
  }
  if (isOpt) classes.push(styles.optimistic)
  return classes.join(' ')
}

function canFund(status: MilestoneStatus): boolean {
  return status === 'Pending'
}

function canRelease(status: MilestoneStatus): boolean {
  return status === 'Funded' || status === 'Disputed'
}

function canDispute(status: MilestoneStatus): boolean {
  return status === 'Funded'
}

function canRefund(status: MilestoneStatus): boolean {
  return status === 'Funded' || status === 'Disputed'
}

// ── Component ──────────────────────────────────────────────────

/**
 * Renders a milestone timeline with optimistic state badges and action buttons.
 * Each milestone shows its current (or optimistic) status and provides
 * contextual actions based on the allowed state transitions.
 */
export function EscrowMilestoneTracker({
  gigId,
  milestones,
  getEffectiveStatus,
  isOptimistic,
  onFund,
  onRelease,
  onDispute,
  onRefund,
  lastRollback,
}: EscrowMilestoneTrackerProps) {
  const [dismissedRollbacks, setDismissedRollbacks] = useState<Set<number>>(new Set())

  const dismissRollback = useCallback(
    (milestoneIndex: number) => {
      setDismissedRollbacks((prev) => {
        const next = new Set(prev)
        next.add(milestoneIndex)
        return next
      })
    },
    [],
  )

  if (milestones.length === 0) {
    return (
      <div className={styles.emptyState} data-testid="milestone-tracker-empty">
        No milestones configured for this escrow.
      </div>
    )
  }

  return (
    <div className={styles.tracker} data-testid="escrow-milestone-tracker" aria-label="Escrow milestone tracker">
      {milestones.map((milestone) => {
        const effectiveStatus = getEffectiveStatus
          ? getEffectiveStatus(milestone.index)
          : milestone.status
        const isOpt = isOptimistic ? isOptimistic(milestone.index) : false

        const hasRollback =
          lastRollback &&
          lastRollback.key.milestoneIndex === milestone.index &&
          lastRollback.key.gigId === gigId &&
          !dismissedRollbacks.has(milestone.index)

        return (
          <div
            key={milestone.index}
            className={styles.milestone}
            data-testid={`milestone-${milestone.index}`}
          >
            {/* Step circle */}
            <div
              className={getStepCircleClass(effectiveStatus, isOpt)}
              aria-hidden="true"
            >
              {milestone.index + 1}
            </div>

            {/* Content */}
            <div className={styles.content}>
              <div className={styles.header}>
                <span className={styles.label}>{milestone.label}</span>
                <EscrowStateBadge
                  status={effectiveStatus}
                  isOptimistic={isOpt}
                  showRollback={!!hasRollback}
                />
              </div>

              <span className={styles.amount}>
                {milestone.amount} {milestone.token}
              </span>

              {/* Action buttons — disabled when optimistic is in-flight */}
              <div className={styles.actions}>
                {canFund(effectiveStatus) && onFund && (
                  <button
                    className={`${styles.actionBtn} ${styles.fundBtn}`}
                    onClick={() => onFund(milestone.index)}
                    disabled={isOpt}
                    data-testid={`fund-milestone-${milestone.index}`}
                  >
                    {isOpt ? 'Funding…' : 'Fund'}
                  </button>
                )}
                {canRelease(effectiveStatus) && onRelease && (
                  <button
                    className={`${styles.actionBtn} ${styles.releaseBtn}`}
                    onClick={() => onRelease(milestone.index)}
                    disabled={isOpt}
                    data-testid={`release-milestone-${milestone.index}`}
                  >
                    {isOpt ? 'Releasing…' : 'Release'}
                  </button>
                )}
                {canDispute(effectiveStatus) && onDispute && (
                  <button
                    className={`${styles.actionBtn} ${styles.disputeBtn}`}
                    onClick={() => onDispute(milestone.index)}
                    disabled={isOpt}
                    data-testid={`dispute-milestone-${milestone.index}`}
                  >
                    Dispute
                  </button>
                )}
                {canRefund(effectiveStatus) && onRefund && (
                  <button
                    className={`${styles.actionBtn} ${styles.refundBtn}`}
                    onClick={() => onRefund(milestone.index)}
                    disabled={isOpt}
                    data-testid={`refund-milestone-${milestone.index}`}
                  >
                    Refund
                  </button>
                )}
              </div>

              {/* Rollback notice */}
              {hasRollback && lastRollback && (
                <div
                  className={styles.rollbackNotice}
                  role="alert"
                  data-testid={`rollback-notice-${milestone.index}`}
                >
                  <span className={styles.rollbackIcon} aria-hidden="true">⚠</span>
                  <span>
                    Transaction rolled back: {lastRollback.reason}.
                    Status restored to <strong>{lastRollback.previousStatus}</strong>.
                  </span>
                  <button
                    onClick={() => dismissRollback(milestone.index)}
                    aria-label="Dismiss rollback notice"
                    style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', fontSize: '1rem', color: 'inherit' }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
