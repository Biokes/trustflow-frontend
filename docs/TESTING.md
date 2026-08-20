# Testing Guide

This document outlines the testing patterns and infrastructure used in the TrustFlow frontend. We use Jest and React Testing Library for testing React components, hooks, and API endpoints.

## Mocking the Freighter Wallet

We heavily rely on the Freighter extension for wallet connections and transaction signing. Since the extension isn't available in a Node.js test environment, we mock the `@stellar/freighter-api` globally in our tests.

### Setup

The mock is located in `__mocks__/@stellar/freighter-api.ts` and is automatically picked up by Jest when you call:

```typescript
jest.mock('@stellar/freighter-api');
```

### Controlling the Mock State

The mocked API provides several helper methods to simulate different wallet states during your tests. These helpers are exposed on the mocked module itself:

```typescript
import * as FreighterApiMock from '@stellar/freighter-api';

const {
  setMockConnected,
  setMockAllowed,
  setMockPublicKey,
  setMockNetwork,
  resetFreighterMocks,
} = FreighterApiMock as any;
```

Before each test, it is recommended to reset the mock state:

```typescript
beforeEach(() => {
  resetFreighterMocks();
});
```

### Simulating Scenarios

**1. Connecting a Wallet**

```typescript
setMockConnected(true);
setMockAllowed(true);
setMockPublicKey('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
setMockNetwork({
  network: 'Test SDF Network ; September 2015',
  networkUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});
```

**2. Simulating a Disconnected Wallet**

By default, or after calling `resetFreighterMocks()`, the wallet simulates a disconnected state.

## Mocking Soroban RPC

For testing interactions with the Stellar network and smart contracts, we use a utility mock for Soroban RPC.

### Setup

The Soroban mock utilities are located in `test-utils/soroban-rpc-mock.ts`. You can import and use them in your tests to simulate responses from the Soroban RPC server, such as ledger entries or transaction submissions.

This allows developers to write robust tests for heavily on-chain or wallet-dependent hooks and components without relying on a live network.

## Testing Best Practices

- **Avoid act() warnings**: When testing hooks or components with asynchronous state updates (like polling), ensure that you wait for promises to resolve and wrap timer advances in `act()` blocks. Example:
  ```typescript
  await act(async () => {
    await Promise.resolve(); // flush pending microtasks
    jest.advanceTimersByTime(2000); // advance timers if using fake timers
  });
  ```
- **Cleanup**: Always clear timers and reset mocks after each test to prevent state leakage between tests.
