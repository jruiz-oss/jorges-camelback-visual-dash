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
  const headline    = ad.headline ?? ''
  const description = ad.descriptions?.[0] ?? ''
  const hasVideo    = !!ad.videoUrl
  const hasImage    = !hasVideo && !!ad.imageUrl

  // The ad's "name" is often just the campaign name repeated (Google Search
  // defaults the name field to the campaign label). Keep it only when it's
  // genuinely additive — different from both the campaign and the headline.
  const name = (ad.name ?? '').trim()
  const camp = (ad.campaign ?? '').trim()
  const head = headline.trim()
  const nameIsNoise =
    !name ||
    name === 'Unnamed' ||
    name === 'Unnamed Ad' ||
    name.toLowerCase() === camp.toLowerCase() ||
    name.toLowerCase() === head.toLowerCase()

  return (
    <div className="ad-card" style={{
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      width: 220, flexShrink: 0,
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 1px 8px rgba(15,23,42,.04)',
      display: 'flex', flexDirection: 'column' as const,
      alignSelf: 'flex-start' as const,
    }}>
      {hasVideo ? (
        // ─── Video ad — live playback window ───────────────────────────────
        // autoPlay + muted is required by browsers for inline autoplay.
        // playsInline keeps it from going full-screen on mobile.
        // loop so it keeps playing in the card view.
        <>
          <div style={{ width: '100%', height: 180, overflow: 'hidden', background: '#0f172a', position: 'relative' as const }}>
            <video
              src={ad.videoUrl}
              autoPlay
              muted
              loop
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
            />
          </div>
          {(headline || description) && (
            <div style={{
              padding: '0',
              display: 'flex', flexDirection: 'column' as const, gap: 0,
            }}>
              {headline && (
                <div style={{
                  padding: '10px 14px 8px',
                  borderBottom: description ? '1px solid rgba(0,0,0,.06)' : 'none',
                }}>
                  <span style={{
                    display: 'inline-block', fontSize: 7.5, fontWeight: 700,
                    letterSpacing: '.12em', textTransform: 'uppercase' as const,
                    color: '#fff', background: '#1a0dab',
                    padding: '2px 6px', borderRadius: 3, marginBottom: 4,
                  }}>Headline</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0dab', lineHeight: 1.35 }}>
                    {headline}
                  </div>
                </div>
              )}
              {description && (
                <div style={{ padding: '8px 14px 4px' }}>
                  <span style={{
                    display: 'inline-block', fontSize: 7.5, fontWeight: 700,
                    letterSpacing: '.12em', textTransform: 'uppercase' as const,
                    color: '#fff', background: '#5f6368',
                    padding: '2px 6px', borderRadius: 3, marginBottom: 4,
                  }}>Description</span>
                  <div style={{ fontSize: 11, color: '#4d5156', lineHeight: 1.45 }}>
                    {description}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : hasImage ? (
        // ─── Image ad ──────────────────────────────────────────────────────
        <>
          <div style={{ width: '100%', height: 180, overflow: 'hidden', background: '#f1f5f9' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.imageUrl}
              alt={name || 'Ad creative'}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' }}
            />
          </div>
          {(headline || description) && (
            <div style={{
              padding: '0',
              display: 'flex', flexDirection: 'column' as const, gap: 0,
            }}>
              {headline && (
                <div style={{
                  padding: '10px 14px 8px',
                  borderBottom: description ? '1px solid rgba(0,0,0,.06)' : 'none',
                }}>
                  <span style={{
                    display: 'inline-block', fontSize: 7.5, fontWeight: 700,
                    letterSpacing: '.12em', textTransform: 'uppercase' as const,
                    color: '#fff', background: '#1a0dab',
                    padding: '2px 6px', borderRadius: 3, marginBottom: 4,
                  }}>Headline</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0dab', lineHeight: 1.35 }}>
                    {headline}
                  </div>
                </div>
              )}
              {description && (
                <div style={{ padding: '8px 14px 4px' }}>
                  <span style={{
                    display: 'inline-block', fontSize: 7.5, fontWeight: 700,
                    letterSpacing: '.12em', textTransform: 'uppercase' as const,
                    color: '#fff', background: '#5f6368',
                    padding: '2px 6px', borderRadius: 3, marginBottom: 4,
                  }}>Description</span>
                  <div style={{ fontSize: 11, color: '#4d5156', lineHeight: 1.45 }}>
                    {description}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        // ─── Text-only ad: labeled Headline + Description card ─────────────
        <div className="creative-ph-card">
          {/* Sponsored tag sits at the very top, overlaid via creative-top */}
          {headline && (
            <div className="creative-ph-hl-block">
              <span className="creative-ph-label lbl-hl">Headline</span>
              <div className="creative-ph-headline">{headline}</div>
            </div>
          )}
          {description && (
            <div className="creative-ph-desc-block">
              <span className="creative-ph-label lbl-desc">Description</span>
              <div className="creative-ph-body">{description}</div>
            </div>
          )}
          {!headline && !description && (
            <div className="creative-ph-desc-block">
              <p style={{ fontSize: 11, color: '#94a3b8' }}>
                {nameIsNoise ? 'No text content' : name}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer — status badge only. Campaign now lives in the section header
          above the row, and ad.name is suppressed when it's a duplicate. */}
      <div style={{
        padding: '10px 14px 12px',
        marginTop: 'auto',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {!nameIsNoise && (
          <span style={{
            fontSize: 10, color: '#94a3b8', flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}>
            {name}
          </span>
        )}
        <Badge status={ad.status} />
      </div>
    </div>
  )
}
