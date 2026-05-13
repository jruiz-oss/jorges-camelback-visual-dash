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

// Color tile background — same gradient set as the jump-nav marks (kept
// near each other so they read as the same icon at two sizes).
const MARK_BG: Record<PlatformIcon, string> = {
  meta:       'linear-gradient(135deg,#1877f2,#0c4a9e)',
  google:     'linear-gradient(135deg,#4285f4 0%,#34a853 50%,#fbbc05 80%,#ea4335 100%)',
  stackadapt: 'linear-gradient(135deg,#ff8a36,#ff5a36)',
}

// Bigger 28px version of the white-fill marks used in the nav (same paths,
// rendered at the larger 56px tile size).
function PlatformMark({ icon }: { icon: PlatformIcon }) {
  if (icon === 'meta') {
    return (
      <svg viewBox="0 0 36 36" fill="none" aria-hidden>
        <path
          d="M6 14.5C6 9.5 9.5 6 13.5 6c3 0 5 1.5 8.5 7l-3 5c-2-3-3-4-5-4-2 0-4 1.5-4 4 0 3 2 5 5 5 4 0 7-4 11-12 2-4 4-5 6.5-5 3 0 5.5 2.5 5.5 6.5v6c0 4-2.5 6.5-5.5 6.5-2.5 0-4.5-1-6.5-5l3-5c1.5 2.5 2.5 3.5 4 3.5 1.5 0 2.5-1 2.5-3v-2c0-2-1-3-2.5-3-2 0-4 2.5-8 11-3 6-5.5 8-9 8C9 24 6 20 6 14.5z"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (icon === 'google') {
    return (
      <svg viewBox="0 0 36 36" fill="none" aria-hidden>
        <path d="M12 6 7 22l5 1.5L17 7.5z"     fill="currentColor" opacity=".95" />
        <path d="M18 6l4 11.5 5-1L23.5 6z"      fill="currentColor" opacity=".85" />
        <circle cx="11.5" cy="26" r="3.5"        fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden>
      <rect x="6"  y="8"  width="24" height="6" rx="1.5" fill="currentColor" />
      <rect x="6"  y="17" width="18" height="6" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="6"  y="26" width="12" height="4" rx="1.5" fill="currentColor" opacity=".55" />
    </svg>
  )
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
          <div className="platform-mark" style={{ background: MARK_BG[icon] }}>
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
