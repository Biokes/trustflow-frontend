/**
 * Cross-tab wallet synchronization manager.
 *
 * Manages BroadcastChannel communication with localStorage fallback for
 * synchronizing wallet state across browser tabs. Handles:
 * - Tab-to-tab messaging via BroadcastChannel
 * - Fallback to localStorage events for older browsers
 * - Debounced broadcasts to prevent spam
 * - Unique tab identification
 * - Message serialization/deserialization
 */

import type {
  WalletSyncState,
  WalletSyncMessage,
  WalletSyncConfig,
  WalletSyncListener,
  WalletDisconnectListener,
} from '../types/wallet-sync'
import { WalletSyncMessageType } from '../types/wallet-sync'
import { writeWalletState, readWalletState, isStorageAvailable } from './walletStorage'

/** Default configuration values */
const DEFAULT_CONFIG: Required<WalletSyncConfig> = {
  channelName: 'trustflow-wallet-sync',
  storageKeyPrefix: 'trustflow-wallet',
  broadcastDebounceMs: 100,
  staleThresholdMs: 30000,
}

/**
 * Generate a unique tab identifier.
 * Uses crypto.randomUUID() if available, falls back to timestamp + random.
 */
function generateTabId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Manages cross-tab wallet state synchronization.
 */
export class WalletSyncManager {
  private config: Required<WalletSyncConfig>
  private tabId: string
  private channel: BroadcastChannel | null = null
  private listeners: Set<WalletSyncListener> = new Set()
  private disconnectListeners: Set<WalletDisconnectListener> = new Set()
  private broadcastTimeoutId: ReturnType<typeof setTimeout> | null = null
  private pendingBroadcast: WalletSyncState | null = null
  private storageListener: ((event: StorageEvent) => void) | null = null
  private isInitialized = false

  constructor(config: WalletSyncConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.tabId = generateTabId()
  }

  /**
   * Initialize the sync manager.
   * Sets up BroadcastChannel or localStorage event listeners.
   */
  initialize(): void {
    if (this.isInitialized) {
      return
    }

    // Try to use BroadcastChannel (modern browsers)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(this.config.channelName)
        this.channel.onmessage = (event) => {
          this.handleMessage(event.data)
        }
      } catch {
        this.setupStorageFallback()
      }
    } else {
      // Fallback to localStorage events
      this.setupStorageFallback()
    }

    this.isInitialized = true
  }

  /**
   * Set up localStorage event listener as fallback for BroadcastChannel.
   */
  private setupStorageFallback(): void {
    if (!isStorageAvailable() || typeof window === 'undefined') {
      return
    }

    this.storageListener = (event: StorageEvent) => {
      // Only handle storage events for our broadcast channel key.
      // This key is intentionally separate from the persistence key
      // ('trustflow-wallet-state') used by walletStorage.ts to avoid
      // broadcast messages overwriting persisted state.
      if (event.key === `${this.config.storageKeyPrefix}-state:broadcast`) {
        if (event.newValue) {
          try {
            const message: WalletSyncMessage = JSON.parse(event.newValue)
            // Don't process messages from this tab
            if (message.senderId !== this.tabId) {
              this.handleMessage(message)
            }
          } catch {
            // Silently ignore malformed messages
          }
        }
      }
    }

    window.addEventListener('storage', this.storageListener)
  }

  /**
   * Handle incoming sync messages from other tabs.
   */
  private handleMessage(message: WalletSyncMessage): void {
    // Ignore messages from this tab
    if (message.senderId === this.tabId) {
      return
    }

    switch (message.type) {
      case WalletSyncMessageType.STATE_UPDATE:
        if (message.state) {
          this.listeners.forEach((listener) => {
            try {
              listener(message.state!)
            } catch {
              // Listener errors must not break other listeners
            }
          })
        }
        break

      case WalletSyncMessageType.DISCONNECT:
        this.disconnectListeners.forEach((listener) => {
          try {
            listener()
          } catch {
            // Listener errors must not break other listeners
          }
        })
        break

      case WalletSyncMessageType.REQUEST_STATE:
        // Another tab is requesting current state (not implemented in v1)
        break

      case WalletSyncMessageType.HEARTBEAT:
        // Heartbeat to track active tabs (not implemented in v1)
        break

      default:
        // Unknown message type — ignore silently
        break
    }
  }

  /**
   * Broadcast wallet state to other tabs.
   * Uses debouncing to prevent excessive broadcasts.
   *
   * @param state - The wallet state to broadcast
   * @param immediate - If true, bypass debouncing and broadcast immediately
   */
  broadcastState(state: WalletSyncState, immediate: boolean = false): void {
    if (!this.isInitialized) {
      return
    }

    // Store the pending state
    this.pendingBroadcast = state

    // Clear existing timeout if any
    if (this.broadcastTimeoutId) {
      clearTimeout(this.broadcastTimeoutId)
      this.broadcastTimeoutId = null
    }

    // Immediate broadcast for critical events (disconnect)
    if (immediate) {
      this.executeBroadcast(state)
      return
    }

    // Debounced broadcast for regular updates
    this.broadcastTimeoutId = setTimeout(() => {
      if (this.pendingBroadcast) {
        this.executeBroadcast(this.pendingBroadcast)
        this.pendingBroadcast = null
      }
      this.broadcastTimeoutId = null
    }, this.config.broadcastDebounceMs)
  }

  /**
   * Execute the actual broadcast to other tabs.
   */
  private executeBroadcast(state: WalletSyncState): void {
    const message: WalletSyncMessage = {
      type: WalletSyncMessageType.STATE_UPDATE,
      state,
      senderId: this.tabId,
      timestamp: Date.now(),
    }

    // Persist to localStorage first
    writeWalletState(state)

    // Broadcast via channel if available
    if (this.channel) {
      try {
        this.channel.postMessage(message)
      } catch {
        // Silently ignore — the storage fallback will carry the message
      }
    }

    // If using storage fallback, write to the broadcast-specific key so it
    // does not collide with the persistence key used by walletStorage.ts.
    if (this.storageListener && isStorageAvailable()) {
      try {
        const key = `${this.config.storageKeyPrefix}-state:broadcast`
        localStorage.setItem(key, JSON.stringify(message))
      } catch {
        // Silently ignore storage errors during broadcast
      }
    }
  }

  /**
   * Broadcast a disconnect event to all tabs.
   * This is always immediate (not debounced).
   */
  broadcastDisconnect(): void {
    if (!this.isInitialized) {
      return
    }

    const message: WalletSyncMessage = {
      type: WalletSyncMessageType.DISCONNECT,
      senderId: this.tabId,
      timestamp: Date.now(),
    }

    // Broadcast via channel
    if (this.channel) {
      try {
        this.channel.postMessage(message)
      } catch {
        // Silently ignore channel errors
      }
    }

    // Broadcast via storage fallback using the broadcast-specific key.
    if (this.storageListener && isStorageAvailable()) {
      try {
        const key = `${this.config.storageKeyPrefix}-state:broadcast`
        localStorage.setItem(key, JSON.stringify(message))
      } catch {
        // Silently ignore storage errors during disconnect broadcast
      }
    }
  }

  /**
   * Subscribe to state updates from other tabs.
   *
   * @param listener - Callback function to receive state updates
   * @returns Unsubscribe function
   */
  onStateUpdate(listener: WalletSyncListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Subscribe to disconnect events from other tabs.
   *
   * @param listener - Callback function to handle disconnect
   * @returns Unsubscribe function
   */
  onDisconnect(listener: WalletDisconnectListener): () => void {
    this.disconnectListeners.add(listener)
    return () => {
      this.disconnectListeners.delete(listener)
    }
  }

  /**
   * Get the unique identifier for this tab.
   */
  getTabId(): string {
    return this.tabId
  }

  /**
   * Load the last persisted state from localStorage.
   *
   * @returns The stored state, or null if not found
   */
  loadPersistedState(): WalletSyncState | null {
    return readWalletState()
  }

  /**
   * Clean up resources and close connections.
   * Call this when the tab is closing or the component unmounts.
   */
  destroy(): void {
    // Clear pending broadcast
    if (this.broadcastTimeoutId) {
      clearTimeout(this.broadcastTimeoutId)
      this.broadcastTimeoutId = null
    }

    // Close BroadcastChannel
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }

    // Remove storage listener
    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener)
      this.storageListener = null
    }

    // Clear listeners
    this.listeners.clear()
    this.disconnectListeners.clear()

    this.isInitialized = false
  }
}

/**
 * Singleton instance of WalletSyncManager for the application.
 * Exported for use in hooks and components.
 */
let syncManagerInstance: WalletSyncManager | null = null

/**
 * Get or create the singleton WalletSyncManager instance.
 *
 * @param config - Optional configuration (only used on first call)
 * @returns The singleton WalletSyncManager instance
 */
export function getWalletSyncManager(config?: WalletSyncConfig): WalletSyncManager {
  if (!syncManagerInstance) {
    syncManagerInstance = new WalletSyncManager(config)
  }
  return syncManagerInstance
}

/**
 * Destroy the singleton instance (useful for testing or cleanup).
 */
export function destroyWalletSyncManager(): void {
  if (syncManagerInstance) {
    syncManagerInstance.destroy()
    syncManagerInstance = null
  }
}
