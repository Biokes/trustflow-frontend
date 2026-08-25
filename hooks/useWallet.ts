import { useEffect, useState, useCallback, useRef } from "react";
import {
  isConnected,
  getUserInfo,
  getNetworkDetails,
  isAllowed,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import { useWalletSync } from "./useWalletSync";
import { isStateNewer, isStateStale } from "../utils/walletStorage";
import type { WalletSyncState } from "../types/wallet-sync";

export interface AccountInfo {
  address: string;
  displayName: string;
}

export interface NetworkInfo {
  network: string; // e.g. "Test SDF Network ; September 2015"
  networkUrl: string;
  networkPassphrase: string;
}

export interface WalletState {
  /** The connected Stellar account, or null if not connected */
  account: AccountInfo | null;
  /** Network details from Freighter, or null if unavailable */
  network: NetworkInfo | null;
  /** Whether the app is currently listed as allowed in Freighter */
  isAllowed: boolean | null;
  /**
   * True while a connect/sync action is in progress (setAllowed pending or
   * an immediate poll is running). Use to disable the connect button and
   * show a loading indicator.
   */
  isBusy: boolean;
  /** Most recent connection error message, if any */
  error: string | null;
  /** Trigger the Freighter connection flow (calls setAllowed) */
  connect: () => Promise<void>;
  /** Clear the local connection state so the UI prompts to connect again */
  disconnect: () => void;
  /** Requests a Freighter signature for a transaction XDR envelope, returning the signed XDR */
  signTransaction: (xdr: string) => Promise<string>;
}

/**
 * Manages the full lifecycle of a Freighter wallet connection:
 * - Detects existing connection and account info on mount
 * - Provides `connect()` to trigger setAllowed + immediate public key fetch
 * - Provides `disconnect()` to clear local state
 * - Polls for network and account changes every 2 seconds
 * - Synchronizes wallet state across browser tabs via BroadcastChannel
 * - Automatically reconnects when account changes in Freighter
 *
 * Freighter does **not** support programmatic network switching via the API.
 * To switch networks, the user must open the Freighter extension and switch
 * manually. The hook will detect the change within a polling cycle.
 */
export function useWallet(): WalletState {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [isAllowedState, setIsAllowed] = useState<boolean | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether the user has explicitly disconnected; when true, polling
  // ignores Freighter's isConnected() result so the UI stays in "connect" mode.
  const disconnectedRef = useRef(false);

  // Track the last known state version for conflict resolution.
  const lastStateRef = useRef<WalletSyncState | null>(null);

  // Guards against re-broadcasting state that arrived from another tab.
  const isProcessingSyncRef = useRef(false);

  // Stable ref for broadcastState so sync's useCallback doesn't depend on it
  // directly (which would create a circular dependency: sync → broadcastState
  // → useWalletSync options → sync).
  //
  // Pattern: broadcastStateRef.current is reassigned on every render (below,
  // after useWalletSync returns). Any pending broadcast lives inside the
  // WalletSyncManager's debounce setTimeout — not inside this ref — so there
  // is no risk of a missed broadcast if the component unmounts before the next
  // render updates the ref.
  const broadcastStateRef = useRef<
    ((account: AccountInfo | null, network: NetworkInfo | null, isAllowed: boolean | null) => void)
  >(() => undefined);

  // ── Core sync logic ──────────────────────────────────────────
  // Declared first so it can be safely referenced by useWalletSync callbacks
  // and the mount effect below without any hoisting issues.

  const sync = useCallback(async () => {
    if (disconnectedRef.current) {
      setAccount(null);
      return;
    }

    try {
      const connected = await isConnected();
      if (!connected) {
        setAccount(null);
        setIsAllowed(false);
        setNetwork(null);
        return;
      }

      let stateChanged = false;
      let newAccount: AccountInfo | null = null;
      let newNetwork: NetworkInfo | null = null;
      let newIsAllowed: boolean | null = null;

      // Fetch each piece independently so one failing call doesn't
      // prevent the others from updating the UI.
      try {
        const user = await getUserInfo();
        if (user?.publicKey) {
          newAccount = {
            address: user.publicKey,
            displayName: `${user.publicKey.slice(0, 4)}...${user.publicKey.slice(-4)}`,
          };

          // Detect account change (silent reconnection scenario)
          if (!account || account.address !== newAccount.address) {
            stateChanged = true;
          }

          setAccount(newAccount);
        } else {
          if (account !== null) {
            stateChanged = true;
          }
          setAccount(null);
        }
      } catch {
        // Keep previous account on transient failure
        newAccount = account;
      }

      try {
        const allowed = await isAllowed();
        if (isAllowedState !== allowed) {
          stateChanged = true;
        }
        newIsAllowed = allowed;
        setIsAllowed(allowed);
      } catch {
        // Keep previous allowed state
        newIsAllowed = isAllowedState;
      }

      try {
        const netDetails = await getNetworkDetails();
        if (netDetails) {
          const newNet: NetworkInfo = {
            network: netDetails.network,
            networkUrl: netDetails.networkUrl,
            networkPassphrase: netDetails.networkPassphrase,
          };

          // Detect network change
          if (!network || network.networkPassphrase !== newNet.networkPassphrase) {
            stateChanged = true;
          }

          newNetwork = newNet;
          setNetwork(newNet);
        }
      } catch {
        // Keep previous network info
        newNetwork = network;
      }

      // Broadcast changed state to other tabs, but not if we're currently
      // applying state that arrived from another tab (avoids echo loops).
      if (stateChanged && !isProcessingSyncRef.current) {
        broadcastStateRef.current(newAccount, newNetwork, newIsAllowed);
      }
    } catch {
      // Freighter may not be installed or may throw during polling;
      // silently ignore transient errors to avoid flickering the UI.
    }
  }, [account, network, isAllowedState]);

  // ── Cross-tab synchronization ────────────────────────────────
  // useWalletSync is called after sync is declared so its option callbacks
  // close over a real, stable function reference.

  const {
    broadcastState,
    broadcastDisconnect,
    loadPersistedState,
  } = useWalletSync({
    onStateReceived: (incomingState: WalletSyncState) => {
      // Ignore if a sync is already in flight or user disconnected locally
      if (isProcessingSyncRef.current || disconnectedRef.current) {
        return;
      }

      // Discard stale messages — only accept state newer than what we have
      if (lastStateRef.current && !isStateNewer(incomingState, lastStateRef.current)) {
        return;
      }

      isProcessingSyncRef.current = true;

      try {
        setAccount(incomingState.account);
        setNetwork(incomingState.network);
        setIsAllowed(incomingState.isAllowed);
        lastStateRef.current = incomingState;

        // Silently validate the incoming account is still accessible
        if (incomingState.account) {
          void sync();
        }
      } finally {
        isProcessingSyncRef.current = false;
      }
    },
    onDisconnectReceived: () => {
      if (!disconnectedRef.current) {
        disconnectedRef.current = true;
        setAccount(null);
        setNetwork(null);
        setIsAllowed(false);
        setError(null);
      }
    },
  });

  // Keep the ref in sync with the latest broadcastState function every render
  // so sync() always calls the current version without needing it as a dep.
  broadcastStateRef.current = broadcastState;

  // ── Load persisted state on mount ────────────────────────────

  useEffect(() => {
    const persistedState = loadPersistedState();

    // Ignore state that is older than 5 seconds. If the tab was closed for a
    // long time another tab may have broadcast much fresher state in the
    // meantime; applying a stale snapshot here would briefly win the conflict
    // resolution check (higher version) before the fresh broadcast arrives.
    // Skipping it lets the first poll resolve the correct state from Freighter
    // directly instead.
    if (persistedState && !isStateStale(persistedState, 5000) && !disconnectedRef.current) {
      setAccount(persistedState.account);
      setNetwork(persistedState.network);
      setIsAllowed(persistedState.isAllowed);
      lastStateRef.current = persistedState;
    }

    // Always validate against Freighter on mount regardless of persisted state.
    void sync();
    // sync is intentionally omitted: we only want this to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling ───────────────────────────────────────────────────

  useEffect(() => {
    sync();
    const interval = setInterval(sync, 2000);
    return () => clearInterval(interval);
  }, [sync]);

  // ── Public API ────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    disconnectedRef.current = false;

    try {
      // setAllowed() is called by ConnectButton itself; here we just reset
      // state and sync so the UI updates immediately after.
      await sync();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect wallet";
      setError(message);
      disconnectedRef.current = true;
    } finally {
      setIsBusy(false);
    }
  }, [sync]);

  const disconnect = useCallback(() => {
    disconnectedRef.current = true;
    setAccount(null);
    setNetwork(null);
    setIsAllowed(false);
    setError(null);

    // Immediately notify all other tabs
    broadcastDisconnect();
  }, [broadcastDisconnect]);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!account) {
        throw new Error("Connect a wallet before signing a transaction");
      }

      return freighterSignTransaction(xdr, {
        networkPassphrase: network?.networkPassphrase,
        accountToSign: account.address,
      });
    },
    [account, network]
  );

  return {
    account,
    network,
    isAllowed: isAllowedState,
    isBusy,
    error,
    connect,
    disconnect,
    signTransaction,
  };
}
