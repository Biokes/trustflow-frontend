import React from 'react'
import { useWallet, useIsMounted } from '../../../hooks'
import { ConnectButton } from '../../atoms'
import styles from './style.module.css'

/**
 * Displays connected wallet address and network or a connect button.
 *
 * Uses `useWallet` so it picks up network and connection state automatically.
 * Passes `isConnecting` to ConnectButton so it reflects a connection already
 * in progress from another tab, preventing duplicate Freighter prompts.
 */
export function WalletData() {
  const mounted = useIsMounted()
  const { account, connect, isBusy } = useWallet()

  if (!mounted) {
    return <ConnectButton label="Connect Wallet" />
  }

  return (
    <>
      {account ? (
        <div className={styles.displayData}>
          <div className={styles.card}>{account.displayName}</div>
        </div>
      ) : (
        <ConnectButton
          label="Connect Wallet"
          onConnect={connect}
          isConnecting={isBusy}
        />
      )}
    </>
  )
}
