// Route-level loading screen shown by Next.js while app/[client]/page.tsx
// runs its server-side connector fetches. Renders the shared LoadingScreen —
// the same view the login page shows while navigating — so the hand-off is a
// single seamless loading experience. Next.js dismisses this automatically
// once the server component resolves.

import LoadingScreen from '@/components/LoadingScreen'

export default function Loading() {
  return <LoadingScreen />
}
