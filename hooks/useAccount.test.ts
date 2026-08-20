import { renderHook, waitFor } from '@testing-library/react';
import { useAccount } from './useAccount';
import { useWallet } from './useWallet';

jest.mock('./useWallet', () => ({
  useWallet: jest.fn(),
}));

describe('useAccount', () => {
  it('should return null when wallet is disconnected', () => {
    (useWallet as jest.Mock).mockReturnValue({ account: null });
    
    const { result } = renderHook(() => useAccount());
    expect(result.current).toBeNull();
  });

  it('should return the account when wallet is connected', () => {
    const mockAccount = { address: 'G123', displayName: 'G123...456' };
    (useWallet as jest.Mock).mockReturnValue({ account: mockAccount });
    
    const { result } = renderHook(() => useAccount());
    expect(result.current).toEqual(mockAccount);
  });
});
