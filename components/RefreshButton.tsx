'use client'

import { useState } from 'react'

export default function RefreshButton() {
  // Local spin state so the icon rotates the moment the click registers,
  // even though the page is about to fully reload.
  const [spinning, setSpinning] = useState(false)

  return (
    <button
      className="lift-on-hover"
      onClick={() => { setSpinning(true); window.location.reload() }}
      style={{
        padding: '9px 16px', borderRadius: 10,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
        fontSize: 13, fontWeight: 600, color: '#334155',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 7,
        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        fontFamily: 'inherit',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          fontSize: 15,
          transition: 'transform .6s ease',
          transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
        }}
      >↻</span>
      Refresh
    </button>
  )
}
