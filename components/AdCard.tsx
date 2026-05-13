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

  // Multi-variant headlines — show up to 4. Falls back to single headline string if no array.
  const headlines = ad.headlines && ad.headlines.length
    ? ad.headlines.slice(0, 4)
    : (ad.headline ? [ad.headline] : [])
  const description = ad.descriptions?.[0] ?? ''

  const isTextOnly = !ad.imageUrl

  return (
    <div style={{
      background: '#fff', borderRadius: 10, overflow: 'hidden',
      width: 178, flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04)',
      display: 'flex', flexDirection: 'column' as const,
    }}>
      {isTextOnly ? (
        // ─── Text ad layout: headline stack ───
        <div style={{
          height: 158, padding: '14px 12px',
          background: 'linear-gradient(135deg,#f8fafc,#eef2f7)',
          display: 'flex', flexDirection: 'column' as const, gap: 6,
          overflow: 'hidden',
        }}>
          {headlines.length === 0 && (
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' as const, marginTop: 60 }}>
              No headlines
            </p>
          )}
          {headlines.map((h, i) => (
            <div key={i} style={{
              fontSize: i === 0 ? 12 : 10.5,
              fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? '#1e3a8a' : '#475569',
              lineHeight: 1.3,
              overflow: 'hidden' as const,
              textOverflow: 'ellipsis' as const,
              display: '-webkit-box' as const,
              WebkitLineClamp: i === 0 ? 2 : 1,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {h}
            </div>
          ))}
          {description && (
            <div style={{
              fontSize: 9.5, color: '#64748b', lineHeight: 1.35,
              marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: 5,
              overflow: 'hidden' as const,
              display: '-webkit-box' as const,
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {description}
            </div>
          )}
        </div>
      ) : (
        // ─── Image ad layout ───
        <div style={{ width: '100%', height: 158, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.imageUrl}
            alt={name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
          />
        </div>
      )}

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
