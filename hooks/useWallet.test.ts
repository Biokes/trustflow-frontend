import { renderHook, act, waitFor } from '@testing-library/react';
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

// Capture the callbacks registered by useWallet so tests can invoke them
// directly to simulate cross-tab messages.
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
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should initialize with null state if disconnected', async () => {
    const { result } = renderHook(() => useWallet());
    await act(async () => { await Promise.resolve(); });
    
    // Fast forward for initial sync
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

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
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.account).toEqual({
      address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
      displayName: 'GABC...7890',
    });

    expect(result.current.isAllowed).toBe(true);
    expect(result.current.network?.network).toBe('Test SDF Network ; September 2015');
  });

  it('should handle connect action', async () => {
    const { result } = renderHook(() => useWallet());
    await act(async () => { await Promise.resolve(); });
    
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
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.account?.address).toBe('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.account).toBeNull();

    // Polling shouldn't reconnect if manually disconnected
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.account).toBeNull();
  });

  it('should poll and update state on changes', async () => {
    setMockConnected(true);
    setMockPublicKey('G111');

    const { result } = renderHook(() => useWallet());
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.account?.address).toBe('G111');

    setMockPublicKey('G222');

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.account?.address).toBe('G222');
  });

  it('should sign transaction', async () => {
    setMockConnected(true);
    setMockPublicKey('G111');

    const { result } = renderHook(() => useWallet());
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.account?.address).toBe('G111');

    let signed: string;
    await act(async () => {
      signed = await result.current.signTransaction('unsigned-xdr');
    });

    expect(signed!).toBe('unsigned-xdr-signed-by-G111');
  });

  it('should throw when signing transaction without an account', async () => {
    const { result } = renderHook(() => useWallet());
    await act(async () => { await Promise.resolve(); });

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
        timestamp: Date.now(),
        tabId:     'tab-old',
        version:   10,
      };
      mockLoadPersistedState.mockReturnValue(persisted);

      // Also tell Freighter that this account is still connected
      setMockConnected(true);
      setMockPublicKey('GPERSISTED');

      const { result } = renderHook(() => useWallet());

      // After mount effect runs, persisted state should be applied
      await act(async () => { await Promise.resolve(); });

      expect(result.current.account?.address).toBe('GPERSISTED');
      expect(result.current.network?.networkPassphrase).toBe('Test SDF Network ; September 2015');
    });

    it('applies incoming state from another tab (newer version)', async () => {
      setMockConnected(true);
      setMockPublicKey('G111');

      const { result } = renderHook(() => useWallet());
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(2000); });

      expect(result.current.account?.address).toBe('G111');

      // Simulate another tab broadcasting a newer account
      const incomingState: WalletSyncState = {
        account:   { address: 'GNEW', displayName: 'GN...EW' },
        network:   { network: 'Testnet', networkUrl: 'https://test', networkPassphrase: 'Test SDF Network ; September 2015' },
        isAllowed: true,
        timestamp: Date.now() + 1000,
        tabId:     'tab-other',
        version:   9999, // definitely newer
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
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(2000); });

      // Poll has now run at least once; lastStateRef.current has been populated
      // by the broadcastState call inside sync(). We make the incoming version lower.
      const staleState: WalletSyncState = {
        account:   { address: 'GSTALE', displayName: 'GS...LE' },
        network:   null,
        isAllowed: false,
        timestamp: Date.now() - 10000,
        tabId:     'tab-other',
        version:   0, // older than anything our hook has produced
      };

      await act(async () => {
        capturedOnStateReceived?.(staleState);
      });

      // Account must NOT have changed — our local state is newer
      expect(result.current.account?.address).toBe('G111');
    });

    it('propagates disconnect from another tab to local state', async () => {
      setMockConnected(true);
      setMockPublicKey('G111');

      const { result } = renderHook(() => useWallet());
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(2000); });

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
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(2000); });

      act(() => { result.current.disconnect(); });

      expect(mockBroadcastDisconnect).toHaveBeenCalled();
    });

    it('broadcasts state when account changes in Freighter during polling', async () => {
      setMockConnected(true);
      setMockPublicKey('GORIGINAL');

      const { result } = renderHook(() => useWallet());
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(2000); });

      expect(result.current.account?.address).toBe('GORIGINAL');
      mockBroadcastState.mockClear();

      // Simulate Freighter account switch
      setMockPublicKey('GCHANGED');

      await act(async () => { jest.advanceTimersByTime(2000); });

      expect(result.current.account?.address).toBe('GCHANGED');
      expect(mockBroadcastState).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'GCHANGED' }),
        expect.anything(),
        expect.anything()
      );
    });
  });
});
