/**
 * React hook for cross-tab wallet synchronization.
 *
 * Provides a React-friendly interface to the WalletSyncManager,
 * handling subscription lifecycle and state updates.
 */

import { useEffect, useRef, useCallback } from 'react'
import type { WalletSyncState, WalletSyncConfig } from '../types/wallet-sync'
import { getWalletSyncManager } from '../utils/walletSyncManager'
import { getNextVersion } from '../utils/walletStorage'
import type { AccountInfo, NetworkInfo } from './useWallet'

export interface UseWalletSyncOptions {
  /** Whether to enable cross-tab sync (default: true) */
  enabled?: boolean
  /** Configuration for the sync manager */
  config?: WalletSyncConfig
  /** Callback when state update is received from another tab */
  onStateReceived?: (state: WalletSyncState) => void
  /** Callback when disconnect event is received from another tab */
  onDisconnectReceived?: () => void
}

export interface UseWalletSyncResult {
  /** Broadcast the current wallet state to other tabs */
  broadcastState: (
    account: AccountInfo | null,
    network: NetworkInfo | null,
    isAllowed: boolean | null
  ) => void
  /** Broadcast a disconnect event to other tabs (immediate, not debounced) */
  broadcastDisconnect: () => void
  /** Load the last persisted state from localStorage */
  loadPersistedState: () => WalletSyncState | null
  /** Get the unique tab ID */
  getTabId: () => string
}

/**
 * Hook for managing cross-tab wallet state synchronization.
 *
 * Automatically subscribes to state updates from other tabs and provides
 * methods to broadcast local state changes.
 *
 * Internally delegates to a singleton WalletSyncManager so multiple
 * component instances that call this hook are safe — they each add a
 * separate listener to the same underlying BroadcastChannel rather than
 * opening duplicate channels. However, only one call site per application
 * is needed for the sync to work; additional calls simply increase the
 * listener count with no other side-effects. For large applications
 * consider wrapping this in a React context/provider so the hook is
 * called once at the root.
 *
 * @param options - Configuration options
 * @returns Methods for broadcasting state and loading persisted data
 *
 * @example
 * ```tsx
 * const { broadcastState, loadPersistedState } = useWalletSync({
 *   onStateReceived: (state) => {
 *     setAccount(state.account)
 *     setNetwork(state.network)
 *   },
 *   onDisconnectReceived: () => {
 *     disconnect()
 *   }
 * })
 * ```
 */
export function useWalletSync(options: UseWalletSyncOptions = {}): UseWalletSyncResult {
  const {
    enabled = true,
    config,
    onStateReceived,
    onDisconnectReceived,
  } = options

  // Store callbacks in refs to avoid recreating subscriptions on every render
  const onStateReceivedRef = useRef(onStateReceived)
  const onDisconnectReceivedRef = useRef(onDisconnectReceived)

  // Update refs when callbacks change
  useEffect(() => {
    onStateReceivedRef.current = onStateReceived
  }, [onStateReceived])

  useEffect(() => {
    onDisconnectReceivedRef.current = onDisconnectReceived
  }, [onDisconnectReceived])

  // Initialize the sync manager and set up subscriptions
  useEffect(() => {
    if (!enabled) {
      return
    }

    const syncManager = getWalletSyncManager(config)
    syncManager.initialize()

    // Subscribe to state updates
    const unsubscribeState = syncManager.onStateUpdate((state) => {
      if (onStateReceivedRef.current) {
        onStateReceivedRef.current(state)
      }
    })

    // Subscribe to disconnect events
    const unsubscribeDisconnect = syncManager.onDisconnect(() => {
      if (onDisconnectReceivedRef.current) {
        onDisconnectReceivedRef.current()
      }
    })

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeState()
      unsubscribeDisconnect()
    }
  }, [enabled, config])

  /**
   * Broadcast the current wallet state to other tabs.
   * Converts hook parameters to WalletSyncState format.
   */
  const broadcastState = useCallback(
    (
      account: AccountInfo | null,
      network: NetworkInfo | null,
      isAllowed: boolean | null
    ) => {
      if (!enabled) {
        return
      }

      const syncManager = getWalletSyncManager()
      const state: WalletSyncState = {
        account,
        network,
        isAllowed,
        timestamp: Date.now(),
        tabId: syncManager.getTabId(),
        version: getNextVersion(),
      }

      syncManager.broadcastState(state, false)
    },
    [enabled]
  )

  /**
   * Broadcast a disconnect event to all other tabs.
   * This is immediate and not debounced.
   */
  const broadcastDisconnect = useCallback(() => {
    if (!enabled) {
      return
    }

    const syncManager = getWalletSyncManager()
    syncManager.broadcastDisconnect()
  }, [enabled])

  /**
   * Load the last persisted wallet state from localStorage.
   * Useful for restoring state on page load.
   */
  const loadPersistedState = useCallback((): WalletSyncState | null => {
    if (!enabled) {
      return null
    }

    const syncManager = getWalletSyncManager()
    return syncManager.loadPersistedState()
  }, [enabled])

  /**
   * Get the unique identifier for this tab.
   */
  const getTabId = useCallback((): string => {
    const syncManager = getWalletSyncManager()
    return syncManager.getTabId()
  }, [])

  return {
    broadcastState,
    broadcastDisconnect,
    loadPersistedState,
    getTabId,
  }
}
