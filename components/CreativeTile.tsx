'use client'

import { useState } from 'react'
import type { Ad } from '@/lib/types'

// One creative tile in the redesigned "live wall". 9:16, image- or video-first,
// with a brand chip + LIVE/Paused pill + CTA pill overlaid on a dark gradient.
// On hover the bottom slides up to reveal the full body copy.

type Platform = 'meta' | 'google' | 'stackadapt'

interface Props {
  ad: Ad
  cta: string
  platform: Platform
  // Accent color used for the focus/hover ring — passes through from PlatformRow.
  accent: string
}

// Deterministic gradient for text-only ads (Google Search RSAs primarily).
// Picks a stable color pair from the campaign name so the same campaign always
// renders with the same backdrop — keeps the wall from looking randomized as
// data refreshes.
//
// All gradient stops are drawn from the Camelback brand palette
// (Slate, Indigo, Orange, Light Orange, Spruce, Pine, Red, Midnight) so the
// text-ad placeholders feel on-brand even when no image asset is present.
const TEXT_AD_GRADIENTS: ReadonlyArray<string> = [
  'linear-gradient(135deg,#1D446B 0%,#242841 60%,#1F1E23 100%)', // Indigo → Slate → Midnight
  'linear-gradient(160deg,#F7B45B 0%,#F97529 50%,#242841 100%)', // Light Orange → Orange → Slate
  'linear-gradient(180deg,#4C9429 0%,#21432B 100%)',             // Pine → Spruce
  'linear-gradient(135deg,#FB2E33 0%,#242841 100%)',             // Camelback Red → Slate
  'linear-gradient(135deg,#242841 0%,#1F1E23 100%)',             // Slate → Midnight
  'linear-gradient(180deg,#F97529 0%,#FB2E33 100%)',             // Orange → Red
  'linear-gradient(135deg,#4C9429 0%,#1D446B 100%)',             // Pine → Indigo (mountain + water)
  'linear-gradient(135deg,#1D446B 0%,#21432B 100%)',             // Indigo → Spruce
  'linear-gradient(160deg,#F7B45B 0%,#F97529 50%,#FB2E33 100%)', // sunset
  'linear-gradient(135deg,#21432B 0%,#1F1E23 100%)',             // Spruce → Midnight
  'linear-gradient(135deg,#1D446B 0%,#4C9429 100%)',             // Indigo → Pine
  'linear-gradient(180deg,#FB2E33 0%,#1F1E23 100%)',             // Red → Midnight
  'linear-gradient(135deg,#F7B45B 0%,#242841 100%)',             // Light Orange → Slate
  'linear-gradient(135deg,#F97529 0%,#21432B 100%)',             // Orange → Spruce
  'linear-gradient(180deg,#F7B45B 0%,#1D446B 100%)',             // Light Orange → Indigo
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function gradientFor(seed: string): string {
  return TEXT_AD_GRADIENTS[hashString(seed) % TEXT_AD_GRADIENTS.length]
}

// Maps the connector status string to the binary visual states in the design.
// Anything not actively running reads as "Paused" — REMOVED / DISABLED never
// reach this view in normal flow but we don't want the tile to break if they do.
function isLive(status: string): boolean {
  const s = status.toUpperCase()
  return s === 'ACTIVE' || s === 'ENABLED'
}

// Keep the chip client-branded. Deriving this from campaign names made cards
// read like stray agency/system labels when campaign names started with Commit.
// Meta: shows the destination URL path from link_data.link (e.g. "/aquatopia-waterpark"),
//   falling back to "camelbackresort.com" if no URL is available.
// Google: chip is intentionally null here — Google uses a corner-url path label
//   in place of the old Live/Paused pill instead of a brand chip.
function brandFor(platform: Platform, destinationUrl?: string): { handle: string; initial: string } | null {
  if (platform === 'meta') {
    return { handle: destinationUrl ?? 'camelbackresort.com', initial: 'C' }
  }
  if (platform === 'google') return null
  return { handle: 'camelbackresort.com', initial: 'C' }
}

// Human-readable ad format label shown as a dimmed badge next to the headline.
// Order of checks matters: carousel > video > Google adType map > channel (StackAdapt) > image > text.
const GOOGLE_TYPE_LABELS: Record<string, string> = {
  PERFORMANCE_MAX:       'Perf Max',
  RESPONSIVE_SEARCH_AD:  'Search',
  RESPONSIVE_DISPLAY_AD: 'Display',
  EXPANDED_TEXT_AD:      'Text',
  IMAGE_AD:              'Image',
}
function typeLabel(ad: Ad, isCarousel: boolean, platform: Platform): string {
  if (isCarousel)                              return 'Carousel'
  if (ad.videoUrl)                             return 'Video'
  if (platform === 'google' && ad.adType)      return GOOGLE_TYPE_LABELS[ad.adType] ?? ad.adType
  if (platform === 'stackadapt' && ad.channel) return ad.channel
  if (ad.imageUrl)                             return 'Image'
  return 'Text'
}

export default function CreativeTile({ ad, cta, platform, accent }: Props) {
  const cards = ad.carouselImages ?? []
  const isCarousel = cards.length > 1
  const [cardIdx, setCardIdx] = useState(0)

  const live = isLive(ad.status)
  const hasVideo = !!ad.videoUrl
  // For carousels use the active card's image; otherwise use the single imageUrl
  const activeImageUrl = isCarousel ? cards[cardIdx] : ad.imageUrl
  const hasImage = !hasVideo && !!activeImageUrl
  const headline = (ad.headline ?? '').trim() || (ad.name ?? '').trim() || '—'
  const body = (ad.descriptions ?? []).join(' · ') || headline
  const brand = brandFor(platform, ad.destinationUrl)
  const kind = typeLabel(ad, isCarousel, platform)
  // Light text-card layout — only for Google Search RSAs with no creative
  // asset. CSS keys off `.has-text-card` to swap chip styling + drop overlays.
  const isTextCard = platform === 'google' && !hasVideo && !hasImage

  return (
    <div
      className={`creative platform-${platform} ${live ? '' : 'paused'} ${hasVideo ? 'video' : ''} ${isTextCard ? 'has-text-card' : ''}`}
      data-platform={platform}
      data-carousel-images={cards.length}
      style={{ ['--accent' as any]: accent }}
    >
      {/* Media wrapper — contains the creative AND the floating chips
          (brand handle + LIVE/Paused) overlaid on top of the image so the
          detail panel below stays purely about headline + body copy. This
          removes the "white-bar" band that previously sat between image
          and text. */}
      <div className="creative-media-wrapper">
        {hasVideo ? (
          // autoPlay + muted + playsInline is the only inline-autoplay combo
          // browsers will honor. Loop so it keeps playing while the user
          // scrolls past.
          <div className="creative-media">
            <video
              className="creative-video"
              src={ad.videoUrl}
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
        ) : hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="creative-media">
            <img
              className="creative-img"
              src={activeImageUrl}
              alt={headline}
              loading="lazy"
            />
            {/* Carousel prev/next — only rendered when there are multiple cards */}
            {isCarousel && (
              <>
                <button
                  aria-label="Previous card"
                  onClick={() => setCardIdx(i => (i - 1 + cards.length) % cards.length)}
                  style={{
                    position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: 6,
                    color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                    padding: '6px 8px', zIndex: 10,
                  }}
                >‹</button>
                <button
                  aria-label="Next card"
                  onClick={() => setCardIdx(i => (i + 1) % cards.length)}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: 6,
                    color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                    padding: '6px 8px', zIndex: 10,
                  }}
                >›</button>
                {/* Dot indicators */}
                <div style={{
                  position: 'absolute', bottom: 8, left: 0, right: 0,
                  display: 'flex', justifyContent: 'center', gap: 4, zIndex: 10,
                }}>
                  {cards.map((_, i) => (
                    <button
                      key={i}
                      aria-label={`Card ${i + 1}`}
                      onClick={() => setCardIdx(i)}
                      style={{
                        width: cardIdx === i ? 14 : 6, height: 6,
                        borderRadius: 3, border: 'none', cursor: 'pointer',
                        background: cardIdx === i ? '#fff' : 'rgba(255,255,255,0.45)',
                        padding: 0, transition: 'width 0.15s, background 0.15s',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : platform === 'google' ? (
          // Text-only Google Search RSA — clean modern SERP-style card.
          // No gradient, no overlay; the copy IS the creative.
          <div className="creative-ph creative-ph-card">
            <div className="ph-serp-meta">
              <span className="ph-serp-badge">Sponsored</span>
            </div>
            <div className="creative-ph-headline">{headline}</div>
            {body && body !== headline && (
              <div className="creative-ph-body">{body}</div>
            )}
          </div>
        ) : (
          // Text-only ad on other platforms — deterministic gradient backdrop.
          <div
            className="creative-ph"
            style={{ background: gradientFor(ad.campaign || ad.id) }}
          />
        )}

        {hasVideo && <div className="play-ring" aria-hidden />}

        {/* Floating chips overlaid on the image. Text-only Google RSAs
            opt out (the SERP card has its own Sponsored badge). */}
        {!isTextCard && (
          <div className="creative-info-row">
            {brand ? (
              <span className="brand-chip">
                <span className="brand-chip-mark">{brand.initial}</span>
                <span>{brand.handle}</span>
              </span>
            ) : (
              <span aria-hidden />
            )}
            {platform === 'google' ? (
              ad.destinationUrl
                ? <span className="corner-url">{ad.destinationUrl}</span>
                : null
            ) : platform === 'meta' ? null : (
              <span className="corner-status">{live ? 'Live' : 'Paused'}</span>
            )}
          </div>
        )}
      </div>

      {/* Copy panel sits BELOW the photo — headline + body only, no chips.
          Description is NEVER clamped: the panel grows tall enough to show
          every line of body copy. Text-only Google RSAs already display
          their copy inside the SERP card above so skip this block. */}
      {!isTextCard && (
        <div className="creative-detail">
          <div className="creative-headline-row">
            <h4>{headline}</h4>
            <span className="ad-type-badge">{kind}</span>
          </div>
          {body && body !== headline && <p>{body}</p>}
        </div>
      )}
      {/* Google text-only RSA slim footer — shows the landing page URL path.
          If no URL is available the footer is omitted entirely (no pill fallback). */}
      {isTextCard && ad.destinationUrl && (
        <div className="creative-detail creative-detail--google-text">
          <span className="corner-url corner-url--text">{ad.destinationUrl}</span>
        </div>
      )}
    </div>
  )
}
