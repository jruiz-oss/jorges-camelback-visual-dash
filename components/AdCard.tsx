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
  const hasPreview  = !!ad.previewUrl
  const hasVideo    = !hasPreview && !!ad.videoUrl
  const hasImage    = !hasPreview && !hasVideo && !!ad.imageUrl

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
      {hasPreview ? (
        // ─── Meta ad preview iframe ────────────────────────────────────────
        // Meta's preview_iframe.php renders the actual live ad including video
        // playback and carousels. The native iframe is 500px tall — we scale
        // it down to fit the 220px card width using CSS transform so the ad
        // renders at full resolution and is then visually shrunk.
        <div style={{
          width: '100%',
          // Height = card_width / native_iframe_width * native_iframe_height
          // Native: 500px wide × 690px tall (DESKTOP_FEED_STANDARD)
          // Card:   220px wide → scale = 220/500 = 0.44 → height = 690 * 0.44 ≈ 304
          height: 304,
          overflow: 'hidden',
          background: '#f8fafc',
          position: 'relative' as const,
        }}>
          <iframe
            src={ad.previewUrl}
            scrolling="no"
            style={{
              width: 500,
              height: 690,
              border: 'none',
              transformOrigin: 'top left',
              transform: 'scale(0.44)',
              pointerEvents: 'none', // prevent iframe interaction — it's a preview
            }}
          />
        </div>
      ) : hasVideo ? (
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
              padding: '12px 14px 4px',
              display: 'flex', flexDirection: 'column' as const, gap: 5,
            }}>
              {headline && (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0dab', lineHeight: 1.35 }}>
                  {headline}
                </div>
              )}
              {description && (
                <div style={{ fontSize: 11, color: '#4d5156', lineHeight: 1.45 }}>
                  {description}
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
              padding: '12px 14px 4px',
              display: 'flex', flexDirection: 'column' as const, gap: 5,
            }}>
              {headline && (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0dab', lineHeight: 1.35 }}>
                  {headline}
                </div>
              )}
              {description && (
                <div style={{ fontSize: 11, color: '#4d5156', lineHeight: 1.45 }}>
                  {description}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        // ─── Text-only ad: Google-SERP-inspired layout ─────────────────────
        // Clean white card, tiny "Sponsored" tag, headline in Google link blue,
        // description in Google's exact muted gray. Reads like a real search
        // result snippet instead of a 2005 panel.
        <div style={{
          padding: '14px 14px 6px',
          display: 'flex', flexDirection: 'column' as const, gap: 8,
          minHeight: 160,
        }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, color: '#5f6368',
            letterSpacing: '.08em', textTransform: 'uppercase' as const,
          }}>
            Sponsored
          </div>
          {headline && (
            <div style={{
              fontSize: 14, fontWeight: 500, color: '#1a0dab',
              lineHeight: 1.3, letterSpacing: '-0.005em',
            }}>
              {headline}
            </div>
          )}
          {description && (
            <div style={{
              fontSize: 11.5, color: '#4d5156',
              lineHeight: 1.5,
            }}>
              {description}
            </div>
          )}
          {!headline && !description && (
            <p style={{ fontSize: 11, color: '#94a3b8' }}>
              {nameIsNoise ? 'No text content' : name}
            </p>
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
