import type { Ad } from '@/lib/types'
import CreativeTile from './CreativeTile'
import { ctaForCampaign } from '@/lib/cta'

// One platform "scene" in the live wall — big name + brand-color mark tile,
// per-platform totals, then horizontal lanes per campaign.
//
// Server component. Receives already-fetched Ads from page.tsx, no client-side
// data work. The only client island under us is CreativeTile (for the hover
// gradient + autoplay video).

export type PlatformIcon = 'meta' | 'google' | 'stackadapt'

interface Props {
  id: string
  name: string
  suffix?: string
  icon: PlatformIcon
  /** Short subhandle under the platform name. e.g. "Search · Display · YouTube" */
  handle: string
  /** Token color used for the side accent strip + hover ring on tiles. */
  accent: string
  ads: Ad[]
}

// Official brand marks — Meta uses the full 3-color gradient infinity from
// Meta's press kit, Google Ads uses the canonical 3-color geometry from the
// simple-icons distribution (`icons/googleads.svg`). StackAdapt is a temporary
// neutral mark — replace with the official SVG when supplied.
import { MetaLogo, GoogleAdsLogo, StackAdaptLogo } from './PlatformLogo'

function PlatformMark({ icon }: { icon: PlatformIcon }) {
  if (icon === 'meta')   return <MetaLogo size={32} />
  if (icon === 'google') return <GoogleAdsLogo size={32} />
  return <StackAdaptLogo size={32} />
}

// ── Status helpers — single source of truth shared with CreativeTile so the
// "live" count in the platform header matches the live dots on the tiles.
function isLive(status: string): boolean {
  const s = status.toUpperCase()
  return s === 'ACTIVE' || s === 'ENABLED'
}

// Group ads by campaign name, preserving first-seen order so the biggest
// campaigns appear first (matches the old layout's behavior).
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
  name, ads, accent, platform, clientLabel,
}: {
  name: string
  ads: Ad[]
  accent: string
  platform: PlatformIcon
  clientLabel: string
}) {
  const liveCount = ads.filter(a => isLive(a.status)).length
  const cta = ctaForCampaign(name, platform)

  return (
    <div className="campaign">
      <div className="campaign-head">
        <div className="campaign-name">
          <b>{clientLabel}</b>
          {name}
        </div>
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

// ─── Platform section ────────────────────────────────────────────────────────
export default function PlatformSection({
  id, name, suffix, icon, handle, accent, ads,
}: Props) {
  const groups        = groupByCampaign(ads)
  const liveCount     = ads.filter(a => isLive(a.status)).length
  const campaignCount = groups.length

  // Client label rendered as the small uppercase mono prefix on each campaign
  // row. Hardcoded to "Camelback" for now — promote to a per-campaign field
  // once we add multi-client support.
  const clientLabel = 'Camelback'

  return (
    <section
      id={id}
      className="platform"
      style={{ ['--accent' as string]: accent }}
    >
      <header className="platform-head">
        <div className="platform-id">
          <div className="platform-mark">
            <PlatformMark icon={icon} />
          </div>
          <div>
            <div className="platform-name">
              {name}{suffix && <> <em>{suffix}</em></>}
            </div>
            <div className="platform-meta">
              <span className="live-tag">{liveCount} live now</span>
              <span>·</span>
              <span>{handle}</span>
            </div>
          </div>
        </div>
        <div />
        <div className="platform-totals">
          <div className="stat">
            <span className="stat-n">{campaignCount}</span>
            <span className="stat-l">Campaigns</span>
          </div>
          <div className="stat">
            <span className="stat-n">{ads.length}</span>
            <span className="stat-l">Creatives</span>
          </div>
        </div>
      </header>

      {ads.length === 0 ? (
        <p className="platform-empty">No live ads with spend this month.</p>
      ) : (
        <div className="campaigns">
          {groups.map(g => (
            <CampaignLane
              key={g.name}
              name={g.name}
              ads={g.ads}
              accent={accent}
              platform={icon}
              clientLabel={clientLabel}
            />
          ))}
        </div>
      )}
    </section>
  )
}
