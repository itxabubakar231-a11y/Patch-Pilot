/**
 * PatchPilot — Main Application Root (Member 3 Dashboard Lead)
 *
 * Assembles the frontend foundation: AppShell, EnvironmentBanner, AdminUnlock,
 * and Zone navigation layout.
 * Conforms to PRD.md, docs/ARCHITECTURE.md, and docs/DESIGN.md.
 */

import { useState, useEffect } from 'react'
import AppShell from './components/AppShell.jsx'
import { subscribeAuthChange } from './services/apiClient.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [, setAuthTick] = useState(0)

  // Re-render when auth changes to update UI indicators
  const handleAuthChange = () => {
    setAuthTick((prev) => prev + 1)
  }

  // Synchronize entire application shell with reactive in-memory auth state transitions
  useEffect(() => {
    const unsubscribe = subscribeAuthChange(() => {
      setAuthTick((prev) => prev + 1)
    })
    return () => unsubscribe()
  }, [])

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onAuthChange={handleAuthChange}
    />
  )
}
