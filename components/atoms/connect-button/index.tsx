import { useState } from 'react'
import { setAllowed } from '@stellar/freighter-api'
import styles from './style.module.css'

export interface ConnectButtonProps {
  label: string
  isHigher?: boolean
  /** Called after a successful setAllowed + wallet connection is detected */
  onConnect?: () => void
  /**
   * When true, renders the button in a disabled loading state without
   * starting the Freighter flow. Use this when another tab is already
   * in the middle of a connection attempt (pass `isBusy` from useWallet).
   */
  isConnecting?: boolean
  /**
   * Disables the button entirely. Takes precedence over isConnecting.
   * Useful when the parent knows a connection already exists but the
   * component tree hasn't unmounted yet.
   */
  disabled?: boolean
}

/**
 * Renders a "Connect Wallet" button that triggers the Freighter permission flow.
 *
 * - Shows a loading spinner while the connection is in progress
 * - Accepts `isConnecting` to reflect a connection attempt started by another
 *   tab, preventing duplicate Freighter permission popups
 * - Displays inline error text if the connection fails
 * - Fires `onConnect` so parents can refresh state after a successful connect
 */
export function ConnectButton({
  label,
  isHigher,
  onConnect,
  isConnecting = false,
  disabled = false,
}: ConnectButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Either this instance is loading, or a cross-tab connection is in progress
  const isAnyLoading = loading || isConnecting
  const isDisabled   = disabled || isAnyLoading

  async function handleClick() {
    if (isDisabled) return
    setLoading(true)
    setError(null)
    try {
      await setAllowed()
      onConnect?.()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Label shown inside the button
  const buttonLabel = loading
    ? 'Connecting…'
    : isConnecting
      ? 'Connecting in another tab…'
      : label

  return (
    <div className={styles.wrapper}>
      <button
        className={`${styles.button} ${isAnyLoading ? styles.loading : ''}`}
        style={{ height: isHigher ? 50 : 38, minWidth: isHigher ? 240 : undefined }}
        onClick={handleClick}
        disabled={isDisabled}
        aria-busy={isAnyLoading}
        aria-disabled={isDisabled}
      >
        {isAnyLoading ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : null}
        <span>{buttonLabel}</span>
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
