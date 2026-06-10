// Route-level loading screen shown by Next.js while app/[client]/page.tsx
// runs its server-side connector fetches. Shows the same HulaCarousel the
// user saw on the login page — seamless single loading experience.
// DashboardLoadGuard (client) takes over from here once the page mounts,
// continuing to show the carousel until images are ready.

import HulaCarousel from '@/components/HulaCarousel'

export default function Loading() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f1f5f9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      gap: 24,
    }}>
      <HulaCarousel />
      <p style={{ fontSize: 17, color: '#0f172a', letterSpacing: 0.3, margin: 0, fontWeight: 400 }}>
        Loading your dashboard…
      </p>
    </main>
  )
}
