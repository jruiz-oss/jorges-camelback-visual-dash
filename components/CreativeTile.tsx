'use client'

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
// Google: chip is intentionally hidden in the render path below (the website
// URL pill was duplicative of the Sponsored badge / Google identity already on
// the SERP-style preview), so we don't bother computing one here.
function brandFor(platform: Platform): { handle: string; initial: string } | null {
  if (platform === 'meta') return { handle: '@camelbackresort', initial: 'C' }
  if (platform === 'google') return null
  return { handle: 'camelbackresort.com', initial: 'C' }
}

// Type chip is hidden in compact density, but we still surface a useful label
// in case density opens up later.
function typeLabel(ad: Ad): string {
  if (ad.videoUrl) return 'Video'
  if (ad.adType) return ad.adType
  if (ad.imageUrl) return 'Static'
  return 'Text'
}

export default function CreativeTile({ ad, cta, platform, accent }: Props) {
  const live = isLive(ad.status)
  const hasVideo = !!ad.videoUrl
  const hasImage = !hasVideo && !!ad.imageUrl
  const headline = (ad.headline ?? '').trim() || (ad.name ?? '').trim() || '—'
  const body = (ad.descriptions ?? []).join(' · ') || headline
  const brand = brandFor(platform)
  const kind = typeLabel(ad)
  // Light text-card layout — only for Google Search RSAs with no creative
  // asset. CSS keys off `.has-text-card` to swap chip styling + drop overlays.
  const isTextCard = platform === 'google' && !hasVideo && !hasImage

  return (
    <div
      className={`creative platform-${platform} ${live ? '' : 'paused'} ${hasVideo ? 'video' : ''} ${isTextCard ? 'has-text-card' : ''}`}
      data-platform={platform}
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
              src={ad.imageUrl}
              alt={headline}
              loading="lazy"
            />
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
            <span className="corner-status">{live ? 'Live' : 'Paused'}</span>
          </div>
        )}
      </div>

      {/* Copy panel sits BELOW the photo — headline + body only, no chips.
          Description is NEVER clamped: the panel grows tall enough to show
          every line of body copy. Text-only Google RSAs already display
          their copy inside the SERP card above so skip this block. */}
      {!isTextCard && (
        <div className="creative-detail">
          <h4>{headline}</h4>
          {body && body !== headline && <p>{body}</p>}
        </div>
      )}
      {/* Google text-only RSA still needs a slim footer for the Live pill
          since chips aren't drawn over the SERP card. */}
      {isTextCard && (
        <div className="creative-detail creative-detail--google-text">
          <span className="corner-status">{live ? 'Live' : 'Paused'}</span>
        </div>
      )}
    </div>
  )
}
