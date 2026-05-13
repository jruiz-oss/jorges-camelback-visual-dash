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

  // Show ALL unique headline/description variants (deduped)
  const headlines = ad.headlines && ad.headlines.length
    ? Array.from(new Set(ad.headlines.filter(Boolean)))
    : (ad.headline ? [ad.headline] : [])
  const descriptions = ad.descriptions && ad.descriptions.length
    ? Array.from(new Set(ad.descriptions.filter(Boolean)))
    : []

  const isTextOnly = !ad.imageUrl
  // Cards with lots of variants need more vertical room — let them grow
  const cardWidth = isTextOnly ? 220 : 178

  return (
    <div style={{
      background: '#fff', borderRadius: 10, overflow: 'hidden',
      width: cardWidth, flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04)',
      display: 'flex', flexDirection: 'column' as const,
      alignSelf: 'flex-start' as const, // so cards in a row don't stretch to match the tallest
    }}>
      {isTextOnly ? (
        // ─── Text ad layout: ALL headlines + ALL descriptions ───
        <div style={{
          padding: '14px 12px',
          background: 'linear-gradient(135deg,#f8fafc,#eef2f7)',
          display: 'flex', flexDirection: 'column' as const, gap: 4,
        }}>
          {headlines.length === 0 && descriptions.length === 0 && (
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' as const, padding: '40px 0' }}>
              No headlines or descriptions
            </p>
          )}

          {headlines.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 2 }}>
                Headlines ({headlines.length})
              </div>
              {headlines.map((h, i) => (
                <div key={`h-${i}`} style={{
                  fontSize: i === 0 ? 12.5 : 11,
                  fontWeight: i === 0 ? 700 : 500,
                  color: i === 0 ? '#1e3a8a' : '#334155',
                  lineHeight: 1.35,
                }}>
                  {h}
                </div>
              ))}
            </>
          )}

          {descriptions.length > 0 && (
            <>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase' as const, letterSpacing: '.5px',
                marginTop: 10, marginBottom: 2,
                borderTop: '1px solid #e2e8f0', paddingTop: 8,
              }}>
                Descriptions ({descriptions.length})
              </div>
              {descriptions.map((d, i) => (
                <div key={`d-${i}`} style={{
                  fontSize: 10.5, color: '#475569', lineHeight: 1.4,
                }}>
                  {d}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        // ─── Image ad layout (with optional headline/description overlay below image) ───
        <>
          <div style={{ width: '100%', height: 158, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.imageUrl}
              alt={name}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
            />
          </div>
          {/* For PMax: also show the headlines/descriptions below the image */}
          {(headlines.length > 0 || descriptions.length > 0) && ad.adType === 'PERFORMANCE_MAX' && (
            <div style={{ padding: '8px 10px 0', display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
              {headlines.slice(0, 1).map((h, i) => (
                <div key={`h-${i}`} style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.3 }}>
                  {h}
                </div>
              ))}
              {headlines.length > 1 && (
                <div style={{ fontSize: 9.5, color: '#64748b' }}>
                  +{headlines.length - 1} more headlines
                </div>
              )}
            </div>
          )}
        </>
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
