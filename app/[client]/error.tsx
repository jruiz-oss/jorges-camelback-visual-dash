'use client'

// Route-level error boundary for /[client]. Next.js renders this if any
// component in the dashboard subtree throws on the client (a "client-side
// exception"). Without it, such an error white-screens the whole route with
// no recovery. Here we show a recoverable screen with a Try again button
// (reset() re-renders the segment) and a hard reload fallback.

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] client-side exception:', error)
  }, [error])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 24,
        textAlign: 'center',
        background: '#f1f5f9',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#0f172a',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        Something went wrong loading the dashboard
      </h1>
      <p style={{ fontSize: 14, color: '#475569', margin: 0, maxWidth: 420 }}>
        The page hit an unexpected error. Try again — if it keeps happening,
        reload the page.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#ffffff',
            background: '#1D446B',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#1D446B',
            background: '#ffffff',
            border: '1px solid rgba(36,40,65,.16)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Reload page
        </button>
      </div>
    </main>
  )
}
