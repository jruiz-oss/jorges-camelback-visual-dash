'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(false)
  const [loading, setLoading]   = useState(false)
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
      router.push('/')
      router.refresh()
    } else {
      setError(true)
      setLoading(false)
    }
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
        width: 340, boxShadow: '0 4px 24px rgba(0,0,0,.08)',
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
