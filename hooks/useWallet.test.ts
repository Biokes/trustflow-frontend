import { renderHook, act } from '@testing-library/react';
import { useWallet } from './useWallet';
// @ts-ignore
import * as FreighterApiMock from '@stellar/freighter-api';
import type { WalletSyncState } from '../types/wallet-sync';

const {
  setMockConnected,
  setMockAllowed,
  setMockPublicKey,
  setMockNetwork,
  resetFreighterMocks,
} = FreighterApiMock as any;

jest.mock('@stellar/freighter-api');

// ── useWalletSync mock ─────────────────────────────────────────

let capturedOnStateReceived: ((state: WalletSyncState) => void) | undefined;
let capturedOnDisconnectReceived: (() => void) | undefined;

const mockBroadcastState = jest.fn();
const mockBroadcastDisconnect = jest.fn();
const mockLoadPersistedState = jest.fn().mockReturnValue(null);
const mockGetTabId = jest.fn().mockReturnValue('test-tab-id');

jest.mock('./useWalletSync', () => ({
  useWalletSync: (opts: {
    onStateReceived?: (s: WalletSyncState) => void;
    onDisconnectReceived?: () => void;
  }) => {
    capturedOnStateReceived    = opts.onStateReceived;
    capturedOnDisconnectReceived = opts.onDisconnectReceived;
    return {
      broadcastState:      mockBroadcastState,
      broadcastDisconnect: mockBroadcastDisconnect,
      loadPersistedState:  mockLoadPersistedState,
      getTabId:            mockGetTabId,
    };
  },
}));

// ── Helpers ────────────────────────────────────────────────────

/**
 * Advance fake timers by 2 s and flush all resulting async work.
 * jest.runAllTimersAsync() ticks timers AND awaits any promises they produce,
 * which is required because useWallet's setInterval callback is async.
 */
async function tickPolling() {
  await act(async () => {
    await jest.runAllTimersAsync();
  });
}

// ── Suite ──────────────────────────────────────────────────────

describe('useWallet', () => {
  beforeEach(() => {
    resetFreighterMocks();
    jest.useFakeTimers();
    mockBroadcastState.mockClear();
    mockBroadcastDisconnect.mockClear();
    mockLoadPersistedState.mockReturnValue(null);
    capturedOnStateReceived    = undefined;
    capturedOnDisconnectReceived = undefined;
  });

  afterEach(() => {
    // Restore real timers BEFORE clearing so there is no window where
    // fake timers are live but the Jest environment is already torn down.
    jest.useRealTimers();
  });

  it('should initialize with null state if disconnected', async () => {
    const { result } = renderHook(() => useWallet());

    await tickPolling();

    expect(result.current.account).toBeNull();
    expect(result.current.network).toBeNull();
    expect(result.current.isAllowed).toBe(false);
  });

  it('should sync connected state on mount', async () => {
    setMockConnected(true);
    setMockAllowed(true);
    setMockPublicKey('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
    setMockNetwork({
      network: 'Test SDF Network ; September 2015',
      networkUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    const { result } = renderHook(() => useWallet());

    await tickPolling();

    expect(result.current.account).toEqual({
      address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      displayName: 'GABC...7890',
    });
    expect(result.current.isAllowed).toBe(true);
    expect(result.current.network?.network).toBe('Test SDF Network ; September 2015');
  });

  it('should handle connect action', async () => {
    const { result } = renderHook(() => useWallet());

    setMockConnected(true);
    setMockAllowed(true);
    setMockPublicKey('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.account?.address).toBe('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
    expect(result.current.isAllowed).toBe(true);
  });

  it('should handle disconnect action', async () => {
    setMockConnected(true);
    setMockPublicKey('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');

    const { result } = renderHook(() => useWallet());

    await tickPolling();

    expect(result.current.account?.address).toBe('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');

    act(() => { result.current.disconnect(); });

    expect(result.current.account).toBeNull();

    // Polling should not reconnect after an explicit disconnect
    await tickPolling();

    expect(result.current.account).toBeNull();
  });

  it('should poll and update state on changes', async () => {
    setMockConnected(true);
    setMockPublicKey('G111');

    const { result } = renderHook(() => useWallet());

    await tickPolling();
    expect(result.current.account?.address).toBe('G111');

    setMockPublicKey('G222');

    await tickPolling();
    expect(result.current.account?.address).toBe('G222');
  });

  it('should sign transaction', async () => {
    setMockConnected(true);
    setMockPublicKey('G111');

    const { result } = renderHook(() => useWallet());

    await tickPolling();
    expect(result.current.account?.address).toBe('G111');

    let signed!: string;
    await act(async () => {
      signed = await result.current.signTransaction('unsigned-xdr');
    });

    expect(signed).toBe('unsigned-xdr-signed-by-G111');
  });

  it('should throw when signing transaction without an account', async () => {
    const { result } = renderHook(() => useWallet());

    await expect(result.current.signTransaction('unsigned-xdr')).rejects.toThrow(
      'Connect a wallet before signing a transaction'
    );
  });

  // ── Cross-tab sync integration ────────────────────────────────

  describe('cross-tab sync', () => {
    it('restores state from localStorage on mount when persisted state exists', async () => {
      const persisted: WalletSyncState = {
        account:   { address: 'GPERSISTED', displayName: 'GPER...TED' },
        network:   { network: 'Testnet', networkUrl: 'https://test', networkPassphrase: 'Test SDF Network ; September 2015' },
        isAllowed: true,
        // Fresh timestamp — within the 5 s staleness window
        timestamp: Date.now(),
        tabId:     'tab-old',
        version:   10,
      };
      mockLoadPersistedState.mockReturnValue(persisted);
      setMockConnected(true);
      setMockPublicKey('GPERSISTED');

      const { result } = renderHook(() => useWallet());

      await tickPolling();

      expect(result.current.account?.address).toBe('GPERSISTED');
      expect(result.current.network?.networkPassphrase).toBe('Test SDF Network ; September 2015');
    });

    it('skips stale persisted state on mount and syncs from Freighter instead', async () => {
      const stalePersistedState: WalletSyncState = {
        account:   { address: 'GSTALE_PERSISTED', displayName: 'GST...ED' },
        network:   { network: 'Testnet', networkUrl: 'https://test', networkPassphrase: 'Test SDF Network ; September 2015' },
        isAllowed: true,
        // Older than 5 s — should be ignored on mount
        timestamp: Date.now() - 10000,
        tabId:     'tab-old',
        version:   5,
      };
      mockLoadPersistedState.mockReturnValue(stalePersistedState);

      // Freighter has a different, current account
      setMockConnected(true);
      setMockPublicKey('GCURRENT');

      const { result } = renderHook(() => useWallet());

      await tickPolling();

      // Stale persisted state must NOT have been applied — the live Freighter
      // account should win
      expect(result.current.account?.address).toBe('GCURRENT');
    });

    it('applies incoming state from another tab (newer version)', async () => {
      setMockConnected(true);
      setMockPublicKey('G111');

      const { result } = renderHook(() => useWallet());
      await tickPolling();
      expect(result.current.account?.address).toBe('G111');

      const incomingState: WalletSyncState = {
        account:   { address: 'GNEW', displayName: 'GN...EW' },
        network:   { network: 'Testnet', networkUrl: 'https://test', networkPassphrase: 'Test SDF Network ; September 2015' },
        isAllowed: true,
        timestamp: Date.now() + 1000,
        tabId:     'tab-other',
        version:   9999,
      };

      await act(async () => {
        capturedOnStateReceived?.(incomingState);
      });

      expect(result.current.account?.address).toBe('GNEW');
      expect(result.current.network?.networkPassphrase).toBe('Test SDF Network ; September 2015');
    });

    it('ignores incoming state from another tab when it is older', async () => {
      setMockConnected(true);
      setMockPublicKey('G111');

      const { result } = renderHook(() => useWallet());
      await tickPolling();
      expect(result.current.account?.address).toBe('G111');

      const staleState: WalletSyncState = {
        account:   { address: 'GSTALE', displayName: 'GS...LE' },
        network:   null,
        isAllowed: false,
        timestamp: Date.now() - 10000,
        tabId:     'tab-other',
        version:   0,
      };

      await act(async () => {
        capturedOnStateReceived?.(staleState);
      });

      expect(result.current.account?.address).toBe('G111');
    });

    it('propagates disconnect from another tab to local state', async () => {
      setMockConnected(true);
      setMockPublicKey('G111');

      const { result } = renderHook(() => useWallet());
      await tickPolling();
      expect(result.current.account?.address).toBe('G111');

      await act(async () => {
        capturedOnDisconnectReceived?.();
      });

      expect(result.current.account).toBeNull();
      expect(result.current.network).toBeNull();
    });

    it('broadcasts disconnect to other tabs when disconnect() is called', async () => {
      setMockConnected(true);
      setMockPublicKey('G111');

      const { result } = renderHook(() => useWallet());
      await tickPolling();

      act(() => { result.current.disconnect(); });

      expect(mockBroadcastDisconnect).toHaveBeenCalled();
    });

    it('broadcasts state when account changes in Freighter during polling', async () => {
      setMockConnected(true);
      setMockPublicKey('GORIGINAL');

      const { result } = renderHook(() => useWallet());
      await tickPolling();
      expect(result.current.account?.address).toBe('GORIGINAL');

      mockBroadcastState.mockClear();
      setMockPublicKey('GCHANGED');

      await tickPolling();

      expect(result.current.account?.address).toBe('GCHANGED');
      expect(mockBroadcastState).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'GCHANGED' }),
        expect.anything(),
        expect.anything()
      );
    });
  });
});
