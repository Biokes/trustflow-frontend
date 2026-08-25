/**
 * Type definitions for cross-tab wallet synchronization.
 *
 * This module defines the data structures used to synchronize Freighter wallet
 * state across multiple browser tabs via BroadcastChannel and localStorage.
 */

import type { AccountInfo, NetworkInfo } from '../hooks/useWallet'

/**
 * The complete wallet state that gets synchronized across tabs.
 */
export interface WalletSyncState {
  /** The connected Stellar account, or null if not connected */
  account: AccountInfo | null
  /** Network details from Freighter, or null if unavailable */
  network: NetworkInfo | null
  /** Whether the app is currently listed as allowed in Freighter */
  isAllowed: boolean | null
  /** Timestamp (milliseconds since epoch) when this state was created */
  timestamp: number
  /** Unique identifier for the tab that created this state */
  tabId: string
  /** Incremental version number for conflict resolution (higher = newer) */
  version: number
}

/**
 * Message types used for cross-tab communication.
 */
export enum WalletSyncMessageType {
  /** Full state update from another tab */
  STATE_UPDATE = 'STATE_UPDATE',
  /** Request all tabs to send their current state (for conflict resolution) */
  REQUEST_STATE = 'REQUEST_STATE',
  /** Heartbeat to indicate this tab is still alive */
  HEARTBEAT = 'HEARTBEAT',
  /** Notification that wallet was disconnected */
  DISCONNECT = 'DISCONNECT',
}

/**
 * Message structure for cross-tab communication via BroadcastChannel.
 */
export interface WalletSyncMessage {
  type: WalletSyncMessageType
  /** The wallet state (required for STATE_UPDATE and HEARTBEAT) */
  state?: WalletSyncState
  /** The tab ID that sent this message */
  senderId: string
  /** Timestamp when this message was sent */
  timestamp: number
}

/**
 * Configuration options for the wallet sync manager.
 */
export interface WalletSyncConfig {
  /** Name of the BroadcastChannel (default: 'trustflow-wallet-sync') */
  channelName?: string
  /** localStorage key prefix (default: 'trustflow-wallet') */
  storageKeyPrefix?: string
  /** Debounce delay in ms for broadcasting state changes (default: 100) */
  broadcastDebounceMs?: number
  /** How long before a tab is considered stale (default: 30000ms = 30s) */
  staleThresholdMs?: number
}

/**
 * Callback function type for handling incoming sync messages.
 */
export type WalletSyncListener = (state: WalletSyncState) => void

/**
 * Callback function type for handling disconnect events.
 */
export type WalletDisconnectListener = () => void
