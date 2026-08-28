import { useCallback, useState } from 'react'
import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Navbar } from '../components/organisms'
import { USDCConverter, FileUpload, DeliverableViewer, DashboardSidebar, EscrowMilestoneTracker } from '../components/molecules'
import type { UploadedFile, DeliverableFile, TrackerMilestone } from '../components/molecules'
import { useUSDCPrice, formatUSD, convertToUSD } from '../hooks/useUSDCPrice'
import type { MilestoneStatus } from '../shared/contracts-gen/escrow'
import type { RollbackEvent } from '../shared/optimistic/types'
import {
  applyOptimisticUpdate,
  confirmUpdate,
  rollbackUpdate,
  getOptimisticState,
  getEffectiveStatus,
} from '../shared/optimistic/escrow-state'
import type { MilestoneKey } from '../shared/optimistic/types'

interface NavItem {
  label: string
  href: string
  icon: string
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'My Gigs', href: '/dashboard', icon: '💼', description: 'View and manage your active gigs' },
  { label: 'Disputes', href: '/dashboard/disputes', icon: '⚖️', description: 'Active dispute resolutions' },
  { label: 'Contracts', href: '/dashboard/contracts', icon: '🔗', description: 'Contract bindings and interaction' },
  { label: 'Profile', href: '/dashboard/profile', icon: '👤', description: 'Your reputation and work history' },
  { label: 'Settings', href: '/dashboard/settings', icon: '⚙️', description: 'Account and preferences' },
]

// Placeholder escrow balance in USDC for demo purposes
const ESCROW_USDC = 0

// Sample deliverable files for demonstration
const SAMPLE_DELIVERABLES: DeliverableFile[] = [
  {
    id: '1',
    name: 'milestone-1-report.md',
    size: 15420,
    type: 'text/markdown',
    cid: 'QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o',
    uploadedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: '2', 
    name: 'code-review-findings.pdf',
    size: 2847392,
    type: 'application/pdf',
    cid: 'QmPChd2hVbrJ8bfo2CGIF2jXd3dKXH5grkCxfkeqyqJAyK',
    uploadedAt: '2024-01-14T16:45:00Z',
  },
  {
    id: '3',
    name: 'test-results.json',
    size: 8732,
    type: 'application/json', 
    cid: 'QmNLei78zWmzUdbeRB3CiUfAizWUrbeeZh5K1rhAQKCh51',
    uploadedAt: '2024-01-14T14:20:00Z',
  },
]

// ── Demo Milestones ────────────────────────────────────────────

const DEMO_GIG_ID = '00000000deadbeef'

const INITIAL_MILESTONES: TrackerMilestone[] = [
  { index: 0, label: 'Design Mockups', amount: '500', token: 'USDC', status: 'Funded' },
  { index: 1, label: 'Frontend Implementation', amount: '1200', token: 'USDC', status: 'Funded' },
  { index: 2, label: 'Smart Contract Audit', amount: '800', token: 'USDC', status: 'Pending' },
  { index: 3, label: 'Deployment & QA', amount: '500', token: 'USDC', status: 'Pending' },
]

const Dashboard: NextPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { price: usdcPrice, status: priceStatus } = useUSDCPrice()
  const [lastRollback, setLastRollback] = useState<RollbackEvent | null>(null)
  const [milestones] = useState<TrackerMilestone[]>(INITIAL_MILESTONES)

  const escrowUSD =
    usdcPrice !== null ? formatUSD(convertToUSD(ESCROW_USDC, usdcPrice)) : null

  function handleUploadComplete(entry: UploadedFile) {
    // TODO: persist the CID on-chain via the TrustFlow milestone release contract
    console.log('Deliverable pinned to IPFS:', entry.cid, entry.file.name)
  }

  function handleUploadError(entry: UploadedFile) {
    console.error('IPFS pin failed for', entry.file.name, entry.error)
  }

  // ── Optimistic tracker helpers ────────────────────────────

  const getEffective = useCallback(
    (milestoneIndex: number): MilestoneStatus => {
      const key: MilestoneKey = { gigId: DEMO_GIG_ID, milestoneIndex }
      const ms = milestones.find((m) => m.index === milestoneIndex)
      return getEffectiveStatus(key, ms?.status ?? 'Pending')
    },
    [milestones],
  )

  const checkOptimistic = useCallback(
    (milestoneIndex: number): boolean => {
      const key: MilestoneKey = { gigId: DEMO_GIG_ID, milestoneIndex }
      return getOptimisticState(key)?.isOptimistic ?? false
    },
    [],
  )

  /**
   * Simulate an optimistic escrow action. Applies the optimistic update
   * immediately, then after a short delay simulates the on-chain confirmation
   * (or a random rollback for demo purposes).
   */
  const simulateAction = useCallback(
    (milestoneIndex: number, currentStatus: MilestoneStatus, nextStatus: MilestoneStatus) => {
      const key: MilestoneKey = { gigId: DEMO_GIG_ID, milestoneIndex }

      try {
        applyOptimisticUpdate(key, currentStatus, nextStatus)
      } catch (err) {
        console.error('Invalid transition:', err)
        return
      }

      // Simulate a 2-second on-chain confirmation (20% chance of failure for demo)
      setTimeout(() => {
        const shouldFail = Math.random() < 0.2
        if (shouldFail) {
          const reason = 'Simulated ledger failure: transaction rejected by network'
          rollbackUpdate(key, reason)
          setLastRollback({
            key,
            previousStatus: currentStatus,
            attemptedStatus: nextStatus,
            reason,
            rolledBackAt: Date.now(),
          })
        } else {
          confirmUpdate(key)
        }
      }, 2000)
    },
    [],
  )

  const handleFund = useCallback(
    (milestoneIndex: number) => {
      const ms = milestones.find((m) => m.index === milestoneIndex)
      if (ms) simulateAction(milestoneIndex, ms.status, 'Funded')
    },
    [milestones, simulateAction],
  )

  const handleRelease = useCallback(
    (milestoneIndex: number) => {
      const ms = milestones.find((m) => m.index === milestoneIndex)
      if (ms) simulateAction(milestoneIndex, ms.status, 'Released')
    },
    [milestones, simulateAction],
  )

  const handleDispute = useCallback(
    (milestoneIndex: number) => {
      const ms = milestones.find((m) => m.index === milestoneIndex)
      if (ms) simulateAction(milestoneIndex, ms.status, 'Disputed')
    },
    [milestones, simulateAction],
  )

  const handleRefund = useCallback(
    (milestoneIndex: number) => {
      const ms = milestones.find((m) => m.index === milestoneIndex)
      if (ms) simulateAction(milestoneIndex, ms.status, 'Refunded')
    },
    [milestones, simulateAction],
  )

  return (
    <>
      <Head>
        <title>Dashboard - TrustFlow</title>
        <meta name="description" content="Manage your gigs, disputes, and profile on TrustFlow" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Navbar />

        <div className="flex">
          <DashboardSidebar
            items={NAV_ITEMS}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Main content */}
          <main className="flex-1 p-6 lg:p-8">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden mb-4 p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Dashboard header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Gigs</h1>
              <p className="text-gray-600 dark:text-gray-400">View and manage your active and completed gigs</p>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Active Gigs */}
              <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">💼</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    Active
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">0</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Active Gigs</div>
              </div>

              {/* In Escrow — with live USD equivalent */}
              <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">🔒</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                    Active
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-0.5">
                  {ESCROW_USDC} USDC
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {priceStatus === 'loading' && escrowUSD === null
                    ? 'Loading…'
                    : escrowUSD !== null
                    ? `≈ ${escrowUSD}`
                    : '—'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">In Escrow</div>
              </div>

              {/* Completed */}
              <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">✓</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                    Active
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">0</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
              </div>

              {/* Disputes */}
              <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">⚖️</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                    Active
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">0</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Disputes</div>
              </div>
            </div>

            {/* USDC → USD Converter widget */}
            <div className="mb-8 max-w-md">
              <USDCConverter />
            </div>

            {/* Deliverables upload — for freelancers to submit work for IPFS pinning */}
            <div className="mb-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Submit Deliverables
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Upload your work files. Each file is pinned to IPFS and its content identifier (CID) is
                  recorded on-chain when you release a milestone.
                </p>
              </div>
              <FileUpload
                onUploadComplete={handleUploadComplete}
                onUploadError={handleUploadError}
                multiple={true}
                maxFileSizeBytes={50 * 1024 * 1024}
              />
            </div>

            {/* Submitted Deliverables Viewer */}
            {SAMPLE_DELIVERABLES.length > 0 && (
              <div className="mb-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Submitted Deliverables
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    View and preview your submitted deliverable files. Markdown files can be previewed with full formatting.
                  </p>
                </div>
                <DeliverableViewer
                  files={SAMPLE_DELIVERABLES}
                  onFileSelect={(file) => console.log('Selected file:', file)}
                />
              </div>
            )}

            {/* Escrow Milestone Tracker — optimistic UI demo */}
            <div className="mb-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Escrow Milestones
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Track milestone progress with instant optimistic updates. Actions apply immediately
                  and roll back automatically if the on-chain transaction fails.
                </p>
              </div>
              <EscrowMilestoneTracker
                gigId={DEMO_GIG_ID}
                milestones={milestones}
                getEffectiveStatus={getEffective}
                isOptimistic={checkOptimistic}
                onFund={handleFund}
                onRelease={handleRelease}
                onDispute={handleDispute}
                onRefund={handleRefund}
                lastRollback={lastRollback}
              />
            </div>

            {/* Empty state */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center">
              <div className="text-6xl mb-4">💼</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No gigs yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Connect your wallet and start accepting gigs to see them here. Your escrow milestones will be tracked automatically.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/explore"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Browse Gigs
                </Link>
                <button
                  className="px-6 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-lg border border-gray-300 dark:border-gray-700 transition-colors"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default Dashboard
