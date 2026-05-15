'use client'

import { type ReactNode } from 'react'
import { SegmentOverrideProvider } from './SegmentOverrideContext'
import AdminUnlock from './AdminUnlock'

// Client boundary that wraps the whole app. Provides the segment-override
// context (PIN-gated rename) and renders the floating admin lock button.
// Placed in layout.tsx so it covers every page without duplicating logic.

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SegmentOverrideProvider>
      {children}
      <AdminUnlock />
    </SegmentOverrideProvider>
  )
}
