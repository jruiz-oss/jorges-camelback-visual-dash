import type { Ad } from '@/lib/types'
import CreativeTile from './CreativeTile'
import { ctaForCampaign } from '@/lib/cta'
import { MetaLogo, GoogleAdsLogo, StackAdaptLogo } from './PlatformLogo'

// One business-segment "scene" on the live wall — Aquatopia, Lodge, or
// Camelback Mountain Adventures. Each segment is the top-level scroll target;
// underneath it the segment's ads are grouped by platform (Meta / Google /
// StackAdapt), and inside each platform by campaign.
//
// Server component. Receives already-fetched + already-segment-classified ads
// from page.tsx. The only client island under us is CreativeTile.

export type PlatformIcon = 'meta' | 'google' | 'stackadapt'

export interface PlatformGroup {
  id:    PlatformIcon
  name:  string
  /** Short subhandle under the platform name — purely cosmetic. */
  handle: string
  ads:   Ad[]
}

interface Props {
  /** Slug used as the section `id` for jump-pill scroll targets. */
  id:        string
  name:      string
  /** CSS color used for the side accent strip + tile hover ring. */
  accent:    string
  /** Short letter mark for the segment header chip. */
  mark:      string
  platforms: PlatformGroup[]
}

function PlatformMark({ icon }: { icon: PlatformIcon }) {
  if (icon === 'meta')   return <MetaLogo size={24} />
  if (icon === 'google') return <GoogleAdsLogo size={24} />
  return <StackAdaptLogo size={24} />
}

// ── Status helpers — single source of truth shared with CreativeTile so the
// "live" count in segment headers matches the live dots on the tiles.
function isLive(status: string): boolean {
  const s = status.toUpperCase()
  return s === 'ACTIVE' || s === 'ENABLED'
}

function uniqueCampaigns(ads: Ad[]): number {
  const set = new Set<string>()
  for (const a of ads) {
    if (a.campaign && a.campaign.trim()) set.add(a.campaign.trim())
  }
  return set.size
}

// Group ads by campaign name, preserving first-seen order. Biggest campaigns
// float to the top within a platform.
function groupByCampaign(ads: Ad[]): Array<{ name: string; ads: Ad[] }> {
  const order: string[] = []
  const buckets = new Map<string, Ad[]>()
  for (const ad of ads) {
    const key = (ad.campaign ?? '').trim() || 'Other'
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(ad)
  }
  return order
    .map(name => ({ name, ads: buckets.get(name)! }))
    .sort((a, b) => b.ads.length - a.ads.length)
}

// ─── One campaign lane ───────────────────────────────────────────────────────
function CampaignLane({
  name, ads, accent, platform,
}: {
  name:     string
  ads:      Ad[]
  accent:   string
  platform: PlatformIcon
}) {
  const liveCount = ads.filter(a => isLive(a.status)).length
  const cta = ctaForCampaign(name, platform)

  return (
    <div className="campaign">
      <div className="campaign-head">
        <div className="campaign-name">{name}</div>
        <div className="campaign-meta">
          <span className="live-dot" />
          {liveCount}/{ads.length} live
        </div>
      </div>
      <div className="lane">
        {ads.map(ad => (
          <CreativeTile
            key={ad.id}
            ad={ad}
            cta={cta}
            platform={platform}
            accent={accent}
          />
        ))}
      </div>
    </div>
  )
}

// ─── One platform sub-block inside a segment ─────────────────────────────────
function PlatformBlock({
  group, accent,
}: {
  group:  PlatformGroup
  accent: string
}) {
  const { id, name, handle, ads } = group
  const groups    = groupByCampaign(ads)
  const liveCount = ads.filter(a => isLive(a.status)).length

  if (ads.length === 0) {
    return (
      <div className="seg-platform" data-platform={id}>
        <div className="seg-platform-head">
          <div className="seg-platform-id">
            <div className="seg-platform-mark">
              <PlatformMark icon={id} />
            </div>
            <div>
              <div className="seg-platform-name">{name}</div>
              <div className="seg-platform-meta">
                <span>{handle}</span>
              </div>
            </div>
          </div>
        </div>
        <p className="platform-empty">No live ads with spend this month.</p>
      </div>
    )
  }

  return (
    <div className="seg-platform" data-platform={id}>
      <div className="seg-platform-head">
        <div className="seg-platform-id">
          <div className="seg-platform-mark">
            <PlatformMark icon={id} />
          </div>
          <div>
            <div className="seg-platform-name">{name}</div>
            <div className="seg-platform-meta">
              <span className="live-tag">{liveCount} live now</span>
              <span>·</span>
              <span>{handle}</span>
            </div>
          </div>
        </div>
        <div className="seg-platform-totals">
          <div className="stat">
            <span className="stat-n">{groups.length}</span>
            <span className="stat-l">Campaigns</span>
          </div>
          <div className="stat">
            <span className="stat-n">{ads.length}</span>
            <span className="stat-l">Creatives</span>
          </div>
        </div>
      </div>

      <div className="campaigns">
        {groups.map(g => (
          <CampaignLane
            key={g.name}
            name={g.name}
            ads={g.ads}
            accent={accent}
            platform={id}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Segment section ─────────────────────────────────────────────────────────
export default function SegmentSection({
  id, name, accent, mark, platforms,
}: Props) {
  const allAds        = platforms.flatMap(p => p.ads)
  const activePlatforms = platforms.filter(p => p.ads.length > 0)
  const liveCount     = allAds.filter(a => isLive(a.status)).length
  const campaignCount = uniqueCampaigns(allAds)

  return (
    <section
      id={id}
      className="segment"
      style={{ ['--accent' as string]: accent }}
    >
      <header className="segment-head">
        <div className="segment-id">
          <div className="segment-mark" aria-hidden>{mark}</div>
          <div>
            <div className="segment-name">{name}</div>
            <div className="segment-meta">
              <span className="live-tag">{liveCount} live now</span>
              <span>·</span>
              <span>across {activePlatforms.length} platforms</span>
            </div>
          </div>
        </div>
        <div />
        <div className="segment-totals">
          <div className="stat">
            <span className="stat-n">{campaignCount}</span>
            <span className="stat-l">Campaigns</span>
          </div>
          <div className="stat">
            <span className="stat-n">{allAds.length}</span>
            <span className="stat-l">Creatives</span>
          </div>
        </div>
      </header>

      {allAds.length === 0 ? (
        <p className="platform-empty">No live ads with spend this month.</p>
      ) : (
        <div className="seg-platforms">
          {activePlatforms.map(p => (
            <PlatformBlock key={p.id} group={p} accent={accent} />
          ))}
        </div>
      )}
    </section>
  )
}
