import { useState, useRef, useEffect } from 'react'
import { setAllowed } from '@stellar/freighter-api'

interface WalletButtonProps {
  address: string
  /** The Stellar network name, e.g. "Test SDF Network ; September 2015" */
  network?: string | null
  /** Called when the user clicks "Disconnect" in the dropdown */
  onDisconnect: () => void
  /** Label for the switch-account menu item */
  switchAccountLabel?: string
  /** Label for the disconnect menu item */
  disconnectLabel?: string
  /**
   * When true, renders a small sync badge on the connection indicator
   * to signal that this account's state is shared with other tabs.
   */
  syncedAcrossTabs?: boolean
  /**
   * When set, displays a brief account-switch notice inside the dropdown.
   * Should be a short address string; the parent clears it after showing.
   */
  previousAddress?: string | null
  /** Callback so the parent can clear the previousAddress notice */
  onDismissSwitchNotice?: () => void
}

/**
 * Shows the connected wallet address and a dropdown with:
 * - Current network indicator
 * - Optional account-switch notice when active account changed in another tab
 * - Optional sync badge when state is shared across browser tabs
 * - Switch account (re-opens Freighter permission popup)
 * - Disconnect (clears local connection state and broadcasts to other tabs)
 *
 * Clicking outside closes the dropdown.
 */
export function WalletButton({
  address,
  network,
  onDisconnect,
  switchAccountLabel = 'Switch account',
  disconnectLabel = 'Disconnect',
  syncedAcrossTabs = false,
  previousAddress = null,
  onDismissSwitchNotice,
}: WalletButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Auto-open the dropdown briefly when an account switch notice arrives
  // so the user sees the change without having to click.
  useEffect(() => {
    if (previousAddress) {
      setOpen(true)
    }
  }, [previousAddress])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        // Dismiss the switch notice when the user clicks away
        if (previousAddress) {
          onDismissSwitchNotice?.()
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [previousAddress, onDismissSwitchNotice])

  const displayName = `${address.slice(0, 4)}...${address.slice(-4)}`
  const networkLabel = deriveNetworkLabel(network)

  function handleSwap() {
    setOpen(false)
    onDismissSwitchNotice?.()
    // Re-invoking setAllowed opens the Freighter permission popup so the user
    // can approve a different profile without disconnecting first.
    void setAllowed()
  }

  function handleDisconnect() {
    setOpen(false)
    onDismissSwitchNotice?.()
    onDisconnect()
  }

  function handleToggle() {
    setOpen((v) => !v)
    // Dismiss notice when user manually opens/closes the dropdown
    if (open && previousAddress) {
      onDismissSwitchNotice?.()
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        {/* Connection indicator — with optional sync pulse ring */}
        <span className="relative flex items-center justify-center w-2 h-2" aria-hidden="true">
          <span className="w-2 h-2 rounded-full bg-green-500 block" title="Connected" />
          {syncedAcrossTabs && (
            <span
              className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60"
              title="Synced across tabs"
            />
          )}
        </span>

        {displayName}

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 z-50"
        >
          {/* Account-switch notice */}
          {previousAddress && (
            <div
              role="status"
              aria-live="polite"
              className="mx-2 mb-1 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700"
            >
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Account switched
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                {previousAddress.slice(0, 6)}…{previousAddress.slice(-4)}
                {' '}→{' '}
                {address.slice(0, 6)}…{address.slice(-4)}
              </p>
            </div>
          )}

          {/* Network badge */}
          {networkLabel && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {networkLabel}
                  </span>
                </div>
                {/* Sync indicator */}
                {syncedAcrossTabs && (
                  <span
                    className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1"
                    title="State is synced across all open tabs"
                  >
                    {/* Two-arrows sync icon */}
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Synced
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            role="menuitem"
            onClick={handleSwap}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {switchAccountLabel}
          </button>

          <button
            role="menuitem"
            onClick={handleDisconnect}
            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {disconnectLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

/** Derive a short display label from the network passphrase or name. */
function deriveNetworkLabel(
  network: string | null | undefined,
): string | null {
  if (!network) return null
  if (network.includes('Test')) return 'Testnet'
  if (network.includes('Future')) return 'Futurenet'
  if (network.includes('Public')) return 'Mainnet'
  // Fallback: return the first segment
  return network.split(';')[0]?.trim() || network
}
