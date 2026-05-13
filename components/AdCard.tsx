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
  const displayName = name.length > 60 ? name.slice(0, 60) + '…' : name

  // Each card displays exactly one headline + one description + one image
  const headline    = ad.headline ?? ''
  const description = ad.descriptions?.[0] ?? ''
  const hasImage    = !!ad.imageUrl

  return (
    <div style={{
      background: '#fff', borderRadius: 10, overflow: 'hidden',
      width: 200, flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04)',
      display: 'flex', flexDirection: 'column' as const,
      alignSelf: 'flex-start' as const,
    }}>
      {hasImage ? (
        // ─── Image ad layout ───
        <div style={{ width: '100%', height: 175, overflow: 'hidden', background: '#f8fafc' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.imageUrl}
            alt={name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
          />
        </div>
      ) : (
        // ─── Text-only ad: headline + description over a soft gradient ───
        <div style={{
          minHeight: 130, padding: '14px 12px',
          background: 'linear-gradient(135deg,#f8fafc,#eef2f7)',
          display: 'flex', flexDirection: 'column' as const, gap: 8,
          justifyContent: 'center',
        }}>
          {headline ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.35 }}>
              {headline}
            </div>
          ) : null}
          {description ? (
            <div style={{ fontSize: 10.5, color: '#475569', lineHeight: 1.45 }}>
              {description}
            </div>
          ) : null}
          {!headline && !description && (
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' as const }}>No text content</p>
          )}
        </div>
      )}

      {/* For image ads, show headline + description below the image */}
      {hasImage && (headline || description) && (
        <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
          {headline ? (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.3 }}>
              {headline}
            </div>
          ) : null}
          {description ? (
            <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
              {description}
            </div>
          ) : null}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '10px 12px 12px', marginTop: 'auto' }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1e293b', lineHeight: 1.35, marginBottom: 6 }}>
          {displayName}
        </div>
        {ad.campaign && (
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 6, lineHeight: 1.3 }}>
            {ad.campaign}
          </div>
        )}
        <Badge status={ad.status} />
      </div>
    </div>
  )
}
