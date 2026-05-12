'use client'

export default function RefreshButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        padding: '7px 14px', borderRadius: 8,
        background: '#f8fafc', border: '1px solid #e2e8f0',
        fontSize: 13, fontWeight: 600, color: '#475569',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      <span style={{ fontSize: 15 }}>↻</span> Refresh
    </button>
  )
}
