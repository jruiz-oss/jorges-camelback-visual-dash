'use client'

import type { Ad } from '@/lib/types'

const STATUS: Record<string, [string, string]> = {
  ACTIVE:   ['#16a34a', '#dcfce7'],
  ENABLED:  ['#16a34a', '#dcfce7'],
  PAUSED:   ['#d97706', '#fef3c7'],
  INACTIVE: ['#dc2626', '#fee2e2'],
  DISABLED: ['#dc2626', '#fee2e2'],
  REMOVED:  ['#6b7280', '#f3f4f6'],
}

function Badge({ status }: { status: string }) {
  const [color, bg] = STATUS[status.toUpperCase()] ?? ['#6b7280', '#f3f4f6']
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}`,
      padding: '2px 9px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: '.4px',
      whiteSpace: 'nowrap', textTransform: 'uppercase' as const,
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export default function AdCard({ ad }: { ad: Ad }) {
  const name        = ad.name || 'Unnamed'
  const displayName = name.length > 54 ? name.slice(0, 54) + '…' : name
  const textHint    = ad.headline || ad.campaign || 'Text Ad'
  const hint        = textHint.length > 85 ? textHint.slice(0, 85) + '…' : textHint

  return (
    <div style={{
      background: '#fff', borderRadius: 10, overflow: 'hidden',
      width: 178, flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04)',
    }}>
      {/* Image area */}
      <div style={{ width: '100%', height: 158, overflow: 'hidden', position: 'relative' as const }}>
        {ad.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.imageUrl}
            alt={name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
            onError={(e) => {
              const el = e.currentTarget
              el.style.display = 'none'
              const fallback = el.nextElementSibling as HTMLElement | null
              if (fallback) fallback.style.display = 'flex'
            }}
          />
        ) : null}
        {/* Text placeholder / image fallback */}
        <div style={{
          display: ad.imageUrl ? 'none' : 'flex',
          position: ad.imageUrl ? 'absolute' as const : 'relative' as const,
          inset: 0, width: '100%', height: ad.imageUrl ? '100%' : 158,
          background: 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
          alignItems: 'center', justifyContent: 'center',
          padding: 14, textAlign: 'center' as const,
        }}>
          <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>{hint}</p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', lineHeight: 1.35, marginBottom: 7 }}>
          {displayName}
        </div>
        <Badge status={ad.status} />
      </div>
    </div>
  )
}
