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
const TEXT_AD_GRADIENTS: ReadonlyArray<string> = [
  'linear-gradient(135deg,#1d4f8c 0%,#0a2540 60%,#020817 100%)',
  'linear-gradient(160deg,#f7a072 0%,#d97757 50%,#5e2914 100%)',
  'linear-gradient(180deg,#2a9d8f 0%,#1f5f5b 100%)',
  'linear-gradient(135deg,#e63946 0%,#a4161a 100%)',
  'linear-gradient(135deg,#264653 0%,#0d1b1e 100%)',
  'linear-gradient(180deg,#f4a261 0%,#e76f51 100%)',
  'linear-gradient(135deg,#6a994e 0%,#386641 100%)',
  'linear-gradient(135deg,#9d4edd 0%,#3c096c 100%)',
  'linear-gradient(160deg,#ffb4a2 0%,#b5838d 50%,#6d6875 100%)',
  'linear-gradient(135deg,#fcbf49 0%,#f77f00 60%,#d62828 100%)',
  'linear-gradient(135deg,#22577a 0%,#38a3a5 100%)',
  'linear-gradient(180deg,#7209b7 0%,#3a0ca3 100%)',
  'linear-gradient(135deg,#06d6a0 0%,#118ab2 100%)',
  'linear-gradient(135deg,#ef476f 0%,#7d1d3f 100%)',
  'linear-gradient(180deg,#ffd166 0%,#ef476f 100%)',
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

// Brand chip: tries to derive a sensible handle/initial from the campaign name.
// Real platform handles aren't on the Ad shape today — this is a "looks-right"
// derivation. Flag in README: promote to a real `brand` field if multi-client.
function brandFor(campaign: string | undefined, platform: Platform): { handle: string; initial: string } {
  const c = (campaign ?? '').trim()
  if (!c) {
    const fallback = { meta: '@camelback', google: 'camelbackresort.com', stackadapt: 'camelbackresort.com' }[platform]
    return { handle: fallback, initial: 'C' }
  }
  // Pull the first word as a stand-in handle: "Aquatopia — Traffic" → "aquatopia".
  const first = c.split(/[\s—–\-:|·]+/)[0] ?? c
  const slug = first.toLowerCase().replace(/[^a-z0-9]/g, '')
  const initial = first.charAt(0).toUpperCase() || 'C'
  const handle = platform === 'google' ? `${slug}.com` : `@${slug}`
  return { handle, initial }
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
  const brand = brandFor(ad.campaign, platform)
  const kind = typeLabel(ad)

  return (
    <div
      className={`creative ${live ? '' : 'paused'} ${hasVideo ? 'video' : ''}`}
      style={{ ['--accent' as any]: accent }}
    >
      {hasVideo ? (
        // autoPlay + muted + playsInline is the only inline-autoplay combo
        // browsers will honor. Loop so it keeps playing while the user
        // scrolls past.
        <video
          className="creative-video"
          src={ad.videoUrl}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="creative-img"
          src={ad.imageUrl}
          alt={headline}
          loading="lazy"
        />
      ) : (
        // Text-only ad — Google RSA primarily. Deterministic gradient + the
        // headline overlaid keeps the wall rhythm intact instead of leaving a
        // black box.
        <div
          className="creative-ph"
          style={{ background: gradientFor(ad.campaign || ad.id) }}
        >
          {headline}
        </div>
      )}

      {hasVideo && <div className="play-ring" aria-hidden />}

      <div className="creative-top">
        <span className="brand-chip">
          <span className="brand-chip-mark">{brand.initial}</span>
          <span>{brand.handle}</span>
        </span>
        <span className="corner-status">{live ? 'Live' : 'Paused'}</span>
      </div>

      <div className="creative-bottom">
        <div className="creative-headline">{headline}</div>
        <div className="creative-foot-row">
          <span className="creative-cta">{cta}</span>
          <span className="creative-type">{kind}</span>
        </div>
      </div>

      <div className="creative-detail">
        <h4>{headline}</h4>
        <p>{body}</p>
      </div>
    </div>
  )
}
