'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleAdsLogo, MetaLogo, StackAdaptLogo } from '@/components/PlatformLogo'

const LOGOS = [
  { id: 'google', el: <GoogleAdsLogo size={56} /> },
  { id: 'meta',   el: <MetaLogo size={56} /> },
  { id: 'stack',  el: <StackAdaptLogo size={56} /> },
]

function HulaCarousel() {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const rafRef   = useRef<number | null>(null)

  useEffect(() => {
    const RADIUS = 52   // px — tight so side logos feel close/behind
    const SPEED  = 0.85 // rad/s — one full loop every ~7.4 s
    let start: number | null = null

    const tick = (ts: number) => {
      if (!start) start = ts
      const a = ((ts - start) / 1000) * SPEED

      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const theta = a + (i / 3) * 2 * Math.PI
        const x = Math.sin(theta) * RADIUS
        const z = Math.cos(theta)         // 1 = front, -1 = back
        const t = (z + 1) / 2            // 0 = back … 1 = front

        const scale   = 0.55 + 0.45 * t  // 0.55 at back → 1.0 at front
        // fade out smoothly only as logo approaches the very back
        const opacity = z < -0.75
          ? Math.max(0, (z + 1) * 4)
          : 0.3 + 0.7 * t

        el.style.transform = `translateX(calc(-50% + ${x.toFixed(2)}px)) translateY(-50%) scale(${scale.toFixed(3)})`
        el.style.opacity   = opacity.toFixed(3)
        el.style.zIndex    = String(Math.round(t * 100))
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <div style={{ position: 'relative', width: 200, height: 72, margin: '0 auto' }}>
      {LOGOS.map((logo, i) => (
        <div
          key={logo.id}
          ref={el => { itemRefs.current[i] = el }}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            willChange: 'transform, opacity',
            width: 76, height: 76,
            background: '#ffffff',
            borderRadius: 18,
            boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          }}
        >
          {logo.el}
        </div>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]           = useState(false)
  const [loading, setLoading]       = useState(false)
  const [navigating, setNavigating] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(false)

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      const data = await res.json()
      setNavigating(true)
      router.push(`/${data.client}`)
      router.refresh()
    } else {
      setError(true)
      setLoading(false)
    }
  }

  if (navigating) {
    return (
      <main style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
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

  return (
    <main style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: '40px 36px',
        width: 'min(340px, calc(100vw - 32px))', boxShadow: '0 4px 24px rgba(0,0,0,.08)',
      }}>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: '#0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: -1,
          }}>A</div>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Ad Dashboard</span>
        </div>

        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Enter the password to view active ads.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: error ? 8 : 16 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={{
                width: '100%', padding: '10px 40px 10px 14px',
                borderRadius: 8, fontSize: 14, outline: 'none',
                border: `1.5px solid ${error ? '#ef4444' : '#e2e8f0'}`,
                boxSizing: 'border-box',
                transition: 'border-color .15s',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: 10, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, color: '#94a3b8', display: 'flex', alignItems: 'center',
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {error && (
            <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
              Incorrect password — try again.
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '11px', borderRadius: 8,
              background: '#0f172a', color: '#fff',
              fontWeight: 700, fontSize: 14, border: 'none',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              opacity: !password ? 0.55 : 1,
              transition: 'opacity .15s',
            }}
          >
            {loading ? 'Checking…' : 'Enter →'}
          </button>
        </form>
      </div>
    </main>
  )
}
