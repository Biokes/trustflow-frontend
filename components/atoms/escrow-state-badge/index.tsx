import { useEffect, useState } from 'react'
import type { MilestoneStatus } from '../../../shared/contracts-gen/escrow'
import styles from './escrow-state-badge.module.css'

export interface EscrowStateBadgeProps {
  /** The current (or optimistic) milestone status. */
  status: MilestoneStatus
  /** Whether this status is an unconfirmed optimistic update. */
  isOptimistic?: boolean
  /** If true, play the rollback flash animation (automatically clears after animation ends). */
  showRollback?: boolean
  /** Optional extra CSS class names. */
  className?: string
}

/**
 * Displays the current escrow milestone status as a color-coded badge.
 *
 * - Pulses when `isOptimistic` is true (pending on-chain confirmation)
 * - Flashes/shakes when `showRollback` fires (transaction was rejected)
 */
export function EscrowStateBadge({
  status,
  isOptimistic = false,
  showRollback = false,
  className,
}: EscrowStateBadgeProps) {
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (showRollback) {
      setFlashing(true)
      const timer = setTimeout(() => setFlashing(false), 600)
      return () => clearTimeout(timer)
    }
  }, [showRollback])

  const classes = [
    styles.badge,
    styles[status],
    isOptimistic ? styles.optimistic : '',
    flashing ? styles.rollbackFlash : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} data-testid={`escrow-badge-${status.toLowerCase()}`}>
      {isOptimistic && <span className={styles.pulseDot} aria-hidden="true" />}
      {status}
      {isOptimistic && <span className="sr-only"> (pending confirmation)</span>}
    </span>
  )
}
