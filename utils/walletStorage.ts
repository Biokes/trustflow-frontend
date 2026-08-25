/**
 * localStorage utility for persisting wallet sync state across sessions.
 *
 * Provides type-safe read/write operations with error handling for:
 * - Storage quota exceeded
 * - JSON parse errors
 * - Missing localStorage support
 */

import type { WalletSyncState } from '../types/wallet-sync'

/** Default localStorage key for wallet state */
const WALLET_STATE_KEY = 'trustflow-wallet-state'

/** Default localStorage key for wallet version counter */
const WALLET_VERSION_KEY = 'trustflow-wallet-version'

/**
 * Check if localStorage is available in this environment.
 * Returns false in SSR contexts or when localStorage is disabled.
 */
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

/**
 * Read the current wallet state from localStorage.
 *
 * @returns The stored wallet state, or null if not found or invalid
 */
export function readWalletState(): WalletSyncState | null {
  if (!isStorageAvailable()) {
    return null
  }

  try {
    const raw = localStorage.getItem(WALLET_STATE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as WalletSyncState

    // Validate that required fields exist
    if (
      typeof parsed.timestamp !== 'number' ||
      typeof parsed.tabId !== 'string' ||
      typeof parsed.version !== 'number'
    ) {
      clearWalletState()
      return null
    }

    return parsed
  } catch {
    // Clear corrupt data silently
    clearWalletState()
    return null
  }
}

/**
 * Write the current wallet state to localStorage.
 *
 * @param state - The wallet state to persist
 * @returns true if successful, false if storage failed
 */
export function writeWalletState(state: WalletSyncState): boolean {
  if (!isStorageAvailable()) {
    return false
  }

  try {
    const serialized = JSON.stringify(state)
    localStorage.setItem(WALLET_STATE_KEY, serialized)
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      // Try to clear and retry once
      clearWalletState()
      try {
        localStorage.setItem(WALLET_STATE_KEY, JSON.stringify(state))
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

/**
 * Clear all wallet-related data from localStorage.
 * Call this on explicit disconnect or when corrupt data is detected.
 */
export function clearWalletState(): void {
  if (!isStorageAvailable()) {
    return
  }

  try {
    localStorage.removeItem(WALLET_STATE_KEY)
    localStorage.removeItem(WALLET_VERSION_KEY)
  } catch {
    // Nothing to do if removal fails
  }
}

/**
 * Get the next version number for state updates.
 * Increments and persists the version counter.
 *
 * @returns The next version number (1-based)
 */
export function getNextVersion(): number {
  if (!isStorageAvailable()) {
    return Date.now()
  }

  try {
    const current = localStorage.getItem(WALLET_VERSION_KEY)
    const nextVersion = current ? parseInt(current, 10) + 1 : 1
    localStorage.setItem(WALLET_VERSION_KEY, nextVersion.toString())
    return nextVersion
  } catch {
    return Date.now()
  }
}

/**
 * Check if a wallet state is stale based on timestamp.
 *
 * @param state - The wallet state to check
 * @param thresholdMs - Age threshold in milliseconds (default: 30000ms = 30s)
 * @returns true if the state is older than the threshold
 */
export function isStateStale(
  state: WalletSyncState,
  thresholdMs: number = 30000
): boolean {
  const now = Date.now()
  const age = now - state.timestamp
  return age > thresholdMs
}

/**
 * Check if state A should take precedence over state B.
 * Uses version number first, then timestamp as tiebreaker.
 *
 * @param stateA - First state to compare
 * @param stateB - Second state to compare
 * @returns true if stateA is newer than stateB
 */
export function isStateNewer(
  stateA: WalletSyncState,
  stateB: WalletSyncState
): boolean {
  if (stateA.version !== stateB.version) {
    return stateA.version > stateB.version
  }
  return stateA.timestamp > stateB.timestamp
}
