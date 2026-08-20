import { renderHook, act, waitFor } from '@testing-library/react';
import { useWallet } from './useWallet';
// @ts-ignore
import * as FreighterApiMock from '@stellar/freighter-api';

const {
  setMockConnected,
  setMockAllowed,
  setMockPublicKey,
  setMockNetwork,
  resetFreighterMocks,
} = FreighterApiMock as any;

jest.mock('@stellar/freighter-api');

describe('useWallet', () => {
  beforeEach(() => {
    resetFreighterMocks();
    jest.useFakeTimers();
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
});
