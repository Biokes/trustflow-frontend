# 🖥️ TrustFlow Frontend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-13-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/trustflow-protocol/trustflow-frontend/blob/main/CONTRIBUTING.md)
[![Good First Issues](https://img.shields.io/github/issues/trustflow-protocol/trustflow-frontend/good%20first%20issue?label=good%20first%20issues)](https://github.com/trustflow-protocol/trustflow-frontend/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

> **The decentralized UI for the TrustFlow gig-economy protocol.**

TrustFlow Frontend is the Next.js web application that gives users a seamless interface for creating escrows, tracking milestones, resolving disputes, and managing their on-chain reputation — all powered by Soroban smart contracts on the Stellar network.

**🚀 [Live Demo](#) (Coming Soon)** | **📖 [Documentation](https://docs.trustflow.xyz)** | **🤝 [Contributing](CONTRIBUTING.md)**

---

## ✨ Core Features

- 🔗 **Wallet Integration**: One-click Stellar wallet connection via Freighter.
- 💼 **Escrow Dashboard**: Create, fund, and track milestone-based escrow vaults.
- 🎯 **Gig Explorer**: Browse and filter available gigs with search functionality.
- 🏆 **Freelancer Leaderboard**: Compare top earners and highest-reputation workers.
- 📝 **Gig Creation Wizard**: Multi-step form to create milestone-based gigs.
- ⚖️ **Dispute Interface**: Submit evidence, monitor juror votes, and receive settlement outcomes.
- 🌗 **Dark / Light Mode**: System-aware theme toggling via the `useTheme` hook.
- 🔔 **Toast Notifications**: Non-blocking feedback for all transaction states.
- 📱 **Responsive Design**: Mobile-first layout across all breakpoints.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 13](https://nextjs.org/) (Pages Router)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 3](https://tailwindcss.com/) + CSS Modules
- **Blockchain**: [Stellar](https://stellar.org/) + [Soroban](https://soroban.stellar.org/)
- **Wallet**: [Freighter](https://www.freighter.app/)
- **State Management**: React Hooks + Context API

---

## 📄 Available Pages

- **`/`** - Landing page with feature showcase
- **`/dashboard`** - User dashboard (My Gigs)
- **`/dashboard/disputes`** - Active disputes
- **`/dashboard/contracts`** - Contract bindings status and interaction
- **`/dashboard/profile`** - User profile and reputation
- **`/dashboard/settings`** - Account settings
- **`/explore`** - Browse available gigs
- **`/leaderboard`** - Global freelancer rankings by earnings and reputation
- **`/create-gig`** - Multi-step gig creation wizard

---

## 🗂️ Project Structure

```
├── pages/
│   ├── _app.tsx            # App shell — providers, global styles
│   └── index.tsx           # Landing / dashboard entry point
├── components/
│   ├── atoms/              # Primitive UI: Button, Card, Input, Checkbox, ProgressBar, Toast
│   ├── molecules/          # Composed UI: Deposits, FormPledge, TransactionModal, WalletData
│   └── organisms/          # Page-level sections: Navbar, Campaign, Pledge
├── hooks/
│   ├── useAccount.ts       # Stellar wallet account state
│   ├── useSubscription.ts  # Real-time contract event subscriptions
│   ├── useTheme.ts         # Dark/light theme management
│   ├── useToast.ts         # Toast notification queue
│   └── useIsMounted.ts     # SSR hydration safety guard
├── shared/
│   ├── contracts.ts        # Shared contract address constants
│   └── utils.ts            # Shared utility functions
├── styles/
│   ├── globals.css         # Global styles and CSS variables
│   └── Home.module.css     # Homepage styles
└── public/                 # Static assets and favicon
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18
- [Freighter Wallet](https://www.freighter.app/) browser extension
- A funded Stellar testnet account

### Installation

```bash
npm install
```

### Environment Setup

```bash
cp .env.example .env
```

Key variables:

```env
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_ESCROW_CONTRACT_ID=your-escrow-contract-id
NEXT_PUBLIC_DISPUTE_CONTRACT_ID=your-dispute-contract-id
```

### Running

```bash
# Development
npm run dev

# Lint code
npm run lint

# Type-check
npm run typecheck

# Production build
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 Component Guide

### Atoms

Base-level, stateless UI primitives. Use these directly or compose them into molecules.

- `Button` — primary, secondary, and loading states.
- `AmountInput` — numeric input with token denomination label.
- `ProgressBar` — milestone completion indicator.
- `Toast` — auto-dismissing notification bubble (integrated globally).
- `ThemeToggle` — dark/light mode switcher (integrated in Navbar).

**Using Toast Notifications:**

```tsx
import { useGlobalToast } from '../pages/_app'

function MyComponent() {
  const toast = useGlobalToast()

  const handleSuccess = () => toast.success('Transaction confirmed!')
  const handleError = () => toast.error('Connection failed')
  const handleWarning = () => toast.warning('Low balance detected')
  const handleInfo = () => toast.info('Fetching data...')

  return <button onClick={handleSuccess}>Show Toast</button>
}
```

### Molecules

Stateful compositions built from atoms.

- `FormPledge` — full pledge form with validation and submission.
- `TransactionModal` — step-by-step transaction status overlay.
- `WalletData` — connected wallet summary card.
- `Deposits` — list of active deposits with release controls.

### Organisms

Full page sections wired to on-chain data.

- `Navbar` — responsive top nav with wallet connect.
- `Campaign` — campaign detail with funding progress.
- `Pledge` — pledge workflow from input to confirmation.

## 🧭 Architecture Notes

- The project currently uses the Next.js Pages Router. The Freelancer Leaderboard is implemented at `pages/leaderboard.tsx` to match the existing routing convention.
- The leaderboard is backed by typed local sample data until the protocol exposes a public ranking endpoint or indexer query. The UI sorts the same dataset by total escrow earnings or reputation score.
- The profile page fetches reputation, bio, and past gigs from `GET /api/profile`, which proxies to `PROFILE_API_BASE_URL` when configured and falls back to typed mock data for local/dev environments.
- No new runtime dependencies were added for this feature.

### Cross-Tab Wallet Session Sync & Auto-Reconnect

Wallet state (account, network, allowed status) is synchronized across all open browser tabs without requiring user interaction.

**How it works:**

1. When `useWallet` detects a state change during its 2-second polling cycle (account switch, network change), it broadcasts the new state to all other tabs via `BroadcastChannel`.
2. Each tab receiving the message compares the incoming version number against its own. Higher version wins; ties are broken by timestamp. Stale or equal state is silently discarded.
3. When a tab receives a newer state, it applies it immediately and fires a silent Freighter validation call to confirm the account is still accessible.
4. Disconnect is always broadcast immediately (not debounced) so all tabs clear their state at once.
5. On mount, each tab reads the last persisted state from `localStorage` and restores it before the first poll completes, eliminating the blank-wallet flash on page load.

**Key files:**

| File | Role |
|------|------|
| `types/wallet-sync.ts` | Shared TypeScript interfaces (`WalletSyncState`, `WalletSyncMessage`, etc.) |
| `utils/walletStorage.ts` | localStorage read/write/clear with quota-exceeded handling and version counter |
| `utils/walletSyncManager.ts` | `WalletSyncManager` class — owns the `BroadcastChannel`, debounce logic, listener registry, and localStorage fallback |
| `hooks/useWalletSync.ts` | React wrapper around `WalletSyncManager`; manages subscription lifecycle |
| `hooks/useWallet.ts` | Integrates sync into the existing polling hook via a stable `broadcastStateRef` |

**Fallback strategy:**

`BroadcastChannel` is used where available (all modern browsers). In environments where it is unavailable or throws, the manager falls back to `localStorage` + `storage` events, which fire across tabs when a key changes. The fallback writes to a dedicated key (`trustflow-wallet-state:broadcast`) that is separate from the persistence key (`trustflow-wallet-state`) to prevent broadcast messages from overwriting stored state.

**Version counter:**

Each state broadcast increments a version counter stored in `localStorage` under `trustflow-wallet-version`. This counter persists across page refreshes and browser restarts so that version numbers are always increasing across sessions — this is intentional and ensures that a freshly opened tab never mistakenly discards a broadcast from a tab that has been running longer.

**No new runtime dependencies.** Everything uses native Web APIs (`BroadcastChannel`, `localStorage`, `crypto.randomUUID`).

### Contract Bindings Codegen

TrustFlow uses a codegen pipeline to generate fully typed TypeScript client bindings from Soroban contract specs. This ensures all frontend contract calls are compile-time checked and stay in sync with the contract interface.

**How it works:**

1. Contract specs are defined as JSON files in `shared/contracts-raw/`
2. Running `npm run codegen` generates TypeScript bindings in `shared/contracts-gen/`
3. The `npm run build` and `npm run dev` commands automatically run codegen

**Adding a new contract:**

1. Create a spec file: `shared/contracts-raw/mycontract.spec.json`
2. Run `npm run codegen`
3. Import the generated client: `import { createMycontractContract } from '../shared/contracts-gen'`

**Generated files:**

- `shared/contracts-gen/escrow.ts` — Escrow contract types and client
- `shared/contracts-gen/dispute.ts` — Dispute contract types and client
- `shared/contracts-gen/index.ts` — Barrel export

---

## 🛡️ Security

- No private keys ever touch the browser — all signing delegated to Freighter.
- Contract IDs and RPC URLs loaded strictly from environment variables.
- XDR simulation run before every transaction submission.

---

## 🗺️ Roadmap

### ✅ Completed

- [x] Landing page with feature showcase
- [x] Dark/Light mode theming
- [x] Toast notification system
- [x] User dashboard with sidebar navigation
- [x] Gig explorer with search and filtering
- [x] Multi-step gig creation wizard
- [x] Responsive mobile-first design
- [x] **Type-Safe Contract Bindings**: Codegen pipeline for compile-time checked contract calls

### 🚧 In Progress

- [ ] **Wallet Integration (#21)**: Full Freighter API integration
- [ ] **Profile Pages (#10)**: On-chain reputation and work history viewer

### 📋 Planned

- [ ] **Dispute UI (#15)**: Full juror dashboard with evidence upload and voting
- [ ] **Mobile Navbar (#34)**: Enhanced mobile navigation
- [ ] **i18n Support (#8)**: Multi-language support via next-intl
- [ ] **Real-time Updates (#12)**: WebSocket integration for live notifications

[View all issues →](https://github.com/trustflow-protocol/trustflow-frontend/issues)

---

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### Quick Start for Contributors

1. **Find an issue**: Check [good first issues](https://github.com/trustflow-protocol/trustflow-frontend/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [help wanted](https://github.com/trustflow-protocol/trustflow-frontend/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
2. **Read the guide**: See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions
3. **Set up locally**: Follow the installation steps above
4. **Make your changes**: Create a feature branch and commit your work
5. **Submit a PR**: Open a pull request with a clear description

### Development Workflow

```bash
# 1. Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/trustflow-frontend.git

# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make changes and test
npm run dev
npm run lint
npm run typecheck
npm run build

# 4. Commit and push
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
```

### Areas We Need Help

- 🔗 **Blockchain Integration**: Freighter wallet and Soroban contract integration
- 🎨 **UI Components**: Additional components and improvements
- 📝 **Documentation**: Improving guides and code comments
- 🧪 **Testing**: Adding unit and E2E tests
- 🐛 **Bug Fixes**: Resolving reported issues

[Read the full contributing guide →](CONTRIBUTING.md)

---

## 🤝 Community & Support

- **Documentation**: [Full Docs](https://docs.trustflow.xyz)
- **Issues**: [Report bugs or request features](https://github.com/trustflow-protocol/trustflow-frontend/issues)
- **Discussions**: [Stellar Community Forum](https://stellar.org/community)

---

_Securing the future of work, one transaction at a time._

---

## 📜 License

MIT License. Copyright (c) 2026 TrustFlow Protocol.

## 📊 Project Status

This project is under active development. The UI foundation is complete and ready for blockchain integration. We're actively seeking contributors, especially those with:

- Stellar/Soroban smart contract experience
- React/Next.js expertise
- UI/UX design skills

**Good First Issues**: [Start here](https://github.com/trustflow-protocol/trustflow-frontend/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
