'use client'

// Full-page overlay that sits on top of the real dashboard after Next.js
// dismisses the route-level loading.tsx. Shows the same HulaCarousel the
// user saw on the login page, so the experience is seamless: carousel from
// login → through data fetch → through image download → then reveal.
//
// Dismissal logic:
//   1. Poll `.creative-img` elements every 150 ms.
//   2. Fade out once every img is complete (loaded or errored).
//   3. If no image tiles exist (text/audio only), dismiss immediately.
//   4. Hard cap of 8 s so a slow CDN never blocks forever.

import { useEffect, useState } from 'react'
import HulaCarousel from '@/components/HulaCarousel'

export default function DashboardLoadGuard() {
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let done = false

    const dismiss = () => {
      if (done) return
      done = true
      setFading(true)
      setTimeout(() => setHidden(true), 650)
    }

    const imagesReady = () => {
      const imgs = Array.from(
        document.querySelectorAll<HTMLImageElement>('.creative-img')
      )
      if (imgs.length === 0) return true
      return imgs.every(img => img.complete)
    }

    if (imagesReady()) { dismiss(); return }

    const interval = setInterval(() => {
      if (imagesReady()) { clearInterval(interval); dismiss() }
    }, 150)

    const maxTimer = setTimeout(() => { clearInterval(interval); dismiss() }, 8000)

    return () => { clearInterval(interval); clearTimeout(maxTimer) }
  }, [])

  if (hidden) return null

  return (
    <div
      aria-hidden
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          99,
        background:      '#f1f5f9',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             24,
        opacity:         fading ? 0 : 1,
        transition:      'opacity 0.65s ease',
        pointerEvents:   fading ? 'none' : 'auto',
        fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <HulaCarousel />
      <p style={{ fontSize: 17, color: '#0f172a', letterSpacing: 0.3, margin: 0, fontWeight: 400 }}>
        Loading your dashboard…
      </p>
    </div>
  )
}
