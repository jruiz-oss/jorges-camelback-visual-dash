'use client'

import { type ReactNode } from 'react'
import { SegmentOverrideProvider } from './SegmentOverrideContext'

// Client boundary that wraps the whole app. Provides the segment-override
// context (PIN-gated rename). AdminUnlock is rendered in the page footer
// rather than as a floating button.

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SegmentOverrideProvider>
      {children}
    </SegmentOverrideProvider>
  )
}
