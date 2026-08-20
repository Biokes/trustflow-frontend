// __mocks__/@stellar/freighter-api.ts

let mockIsConnected = false;
let mockIsAllowed = false;
let mockPublicKey = '';
let mockNetwork = {
  network: 'Test SDF Network ; September 2015',
  networkUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

export const setMockConnected = (connected: boolean) => {
  mockIsConnected = connected;
};

export const setMockAllowed = (allowed: boolean) => {
  mockIsAllowed = allowed;
};

export const setMockPublicKey = (publicKey: string) => {
  mockPublicKey = publicKey;
};

export const setMockNetwork = (network: any) => {
  mockNetwork = network;
};

export const isConnected = jest.fn().mockImplementation(async () => mockIsConnected);

export const isAllowed = jest.fn().mockImplementation(async () => mockIsAllowed);

export const getUserInfo = jest.fn().mockImplementation(async () => {
  if (!mockPublicKey) return { publicKey: '' };
  return { publicKey: mockPublicKey };
});

export const getNetworkDetails = jest.fn().mockImplementation(async () => {
  if (!mockNetwork) return null;
  return mockNetwork;
});

export const signTransaction = jest.fn().mockImplementation(async (xdr: string, opts?: any) => {
  return `${xdr}-signed-by-${opts?.accountToSign || 'unknown'}`;
});

export const resetFreighterMocks = () => {
  mockIsConnected = false;
  mockIsAllowed = false;
  mockPublicKey = '';
  mockNetwork = {
    network: 'Test SDF Network ; September 2015',
    networkUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };
  jest.clearAllMocks();
};
