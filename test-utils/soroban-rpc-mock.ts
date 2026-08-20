// test-utils/soroban-rpc-mock.ts

export const mockGetHealth = jest.fn().mockResolvedValue({ status: 'healthy' });

export const mockGetNetwork = jest.fn().mockResolvedValue({
  friendbotUrl: 'https://friendbot.stellar.org/',
  passphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

export const mockSimulateTransaction = jest.fn().mockResolvedValue({
  results: [
    {
      xdr: 'AAAAAQ==', // Dummy XDR for a successful result
      auth: [],
    },
  ],
  latestLedger: 12345,
});

export const mockGetTransaction = jest.fn().mockResolvedValue({
  status: 'SUCCESS',
  returnValue: 'AAAAAA==',
});

export const mockSendTransaction = jest.fn().mockResolvedValue({
  status: 'PENDING',
  hash: '0000000000000000000000000000000000000000000000000000000000000000',
});

export const mockGetLedgerEntries = jest.fn().mockResolvedValue({
  entries: [
    {
      val: 'AAAAAA==', // Base64 XDR placeholder
      lastModifiedLedgerSeq: 12345,
    },
  ],
  latestLedger: 12345,
});

/**
 * Helper to reset all Soroban RPC mocks to their default resolved states.
 */
export const resetSorobanRpcMocks = () => {
  jest.clearAllMocks();
};

export const sorobanRpcMock = {
  getHealth: mockGetHealth,
  getNetwork: mockGetNetwork,
  simulateTransaction: mockSimulateTransaction,
  getTransaction: mockGetTransaction,
  sendTransaction: mockSendTransaction,
  getLedgerEntries: mockGetLedgerEntries,
};
