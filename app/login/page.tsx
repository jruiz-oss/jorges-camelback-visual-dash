'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleAdsLogo, MetaLogo, StackAdaptLogo } from '@/components/PlatformLogo'

const LOGOS = [
  { id: 'google', el: <GoogleAdsLogo size={56} /> },
  { id: 'meta',   el: <MetaLogo size={56} /> },
  { id: 'stack',  el: <StackAdaptLogo size={56} /> },
]

function HulaCarousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setIndex(i => (i + 1) % LOGOS.length), 1400)
    return () => clearInterval(t)
  }, [])

  // slots: prev (left), current (center), next (right)
  const slots = [
    LOGOS[(index + LOGOS.length - 1) % LOGOS.length],
    LOGOS[index],
    LOGOS[(index + 1) % LOGOS.length],
  ]

  const slotStyle = (pos: 'left' | 'center' | 'right'): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s ease',
      position: 'absolute',
    }
    if (pos === 'center') return { ...base, transform: 'translateX(0) scale(1)',    opacity: 1,    left: '50%', marginLeft: -28 }
    if (pos === 'left')   return { ...base, transform: 'translateX(0) scale(0.48)', opacity: 0.35, left: '50%', marginLeft: -28 - 110 }
    return                       { ...base, transform: 'translateX(0) scale(0.48)', opacity: 0.35, left: '50%', marginLeft: -28 + 110 }
  }

  return (
    <div style={{ position: 'relative', width: 240, height: 72, margin: '0 auto' }}>
      {slots.map((logo, i) => (
        <div key={logo.id} style={slotStyle(i === 0 ? 'left' : i === 1 ? 'center' : 'right')}>
          {logo.el}
        </div>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState(false)
  const [loading, setLoading]     = useState(false)
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
        <p style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 0.3, margin: 0 }}>
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
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%', padding: '10px 14px',
              borderRadius: 8, fontSize: 14, outline: 'none',
              border: `1.5px solid ${error ? '#ef4444' : '#e2e8f0'}`,
              marginBottom: error ? 8 : 16,
              transition: 'border-color .15s',
            }}
          />
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
