import { fetchMetaAds }              from '@/lib/meta'
import { fetchGoogleAds, explodeAd } from '@/lib/google-ads'
import { fetchStackAdaptAds }        from '@/lib/stackadapt'
import { buildSegments, classifySegment } from '@/lib/segments'
import type { Ad }                   from '@/lib/types'
import TopBar, {
  type NavItem, type NavTotal,
} from '@/components/TopBar'
import SegmentSection, {
  type PlatformGroup, type PlatformIcon,
} from '@/components/SegmentSection'
import AdminUnlock from '@/components/AdminUnlock'

// `force-dynamic` keeps the existing behavior: every navigation/refresh runs
// the connector fetches server-side. TopBar's soft 60s `router.refresh()` ticks
// re-enter this function on the cadence the live-ticker copy advertises.
export const dynamic = 'force-dynamic'

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// Per-platform display config — used as the sub-block headers inside every
// segment. Order here determines the stacked order under each segment.
// `handle` is omitted here; it's computed dynamically per-platform below.
const PLATFORMS: Array<{ id: PlatformIcon; name: string }> = [
  { id: 'meta',       name: 'Meta'       },
  { id: 'google',     name: 'Google Ads' },
  { id: 'stackadapt', name: 'StackAdapt' },
]

// Preferred display order for Google channel labels so the handle reads
// naturally: Search before Display before YouTube before Performance Max.
const GOOGLE_CHANNEL_ORDER = ['Search', 'Display', 'YouTube', 'Performance Max']

// Derive the "handle" subtitle shown under the platform name from the actual
// channels present in the given ads. Falls back to a static string per platform
// if no channel data is available (e.g. on first deploy before adType is set).
function deriveHandle(platform: PlatformIcon, ads: Ad[]): string {
  if (platform === 'meta') {
    // Meta handle is the account identifier, not a channel list.
    return '@camelbackresort'
  }

  const channels = new Set(ads.map(a => a.channel).filter(Boolean) as string[])
  if (channels.size === 0) {
    // Fallback copy per platform — shown only when channel data is missing.
    if (platform === 'google')     return 'Search · Display · YouTube'
    if (platform === 'stackadapt') return 'Programmatic'
    return ''
  }

  if (platform === 'google') {
    // Sort in preferred reading order; anything not in the list goes at the end.
    const sorted = Array.from(channels).sort((a, b) => {
      const ai = GOOGLE_CHANNEL_ORDER.indexOf(a)
      const bi = GOOGLE_CHANNEL_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return sorted.join(' · ')
  }

  // StackAdapt: alphabetical order (no strong convention).
  return Array.from(channels).sort().join(' · ')
}

function totalsFor(id: string, ads: Ad[]): NavTotal {
  return {
    id,
    active:    ads.filter(a => isLive(a.status)).length,
    total:     ads.length,
    campaigns: uniqueCampaigns(ads),
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  // Same Promise.allSettled pattern as before — a single platform failing
  // shouldn't blank the whole wall.
  const [metaAdsRaw, googleAdsRaw, stackAdaptAds] = await Promise.allSettled([
    fetchMetaAds(),
    fetchGoogleAds(),
    fetchStackAdaptAds(),
  ]).then(results =>
    results.map(r => (r.status === 'fulfilled' ? r.value : []))
  ) as [Ad[], Ad[], Ad[]]

  // Meta: one card per ad. Google: explode PMax + RSA asset groups so each
  // variant gets its own tile in the lane.
  const metaAds   = metaAdsRaw
  const googleAds = googleAdsRaw.flatMap(explodeAd)

  const adsByPlatform: Record<PlatformIcon, Ad[]> = {
    meta:       metaAds,
    google:     googleAds,
    stackadapt: stackAdaptAds,
  }

  // Discover segments from the data itself. Curated verticals (Aquatopia,
  // Weddings, Lodge, CMA, Recruiting) are always present; everything else is
  // auto-bucketed by the first token of the campaign name.
  const allAds = ([] as Ad[]).concat(metaAds, googleAds, stackAdaptAds)
  const SEGMENTS = buildSegments(allAds)

  // Bucket every ad into a segment, keyed by segment id, with the platform of
  // origin preserved on each ad so we can re-split below.
  type Tagged = { ad: Ad; platform: PlatformIcon }
  const taggedBySegment: Record<string, Tagged[]> = {}
  for (const seg of SEGMENTS) taggedBySegment[seg.id] = []
  for (const platform of Object.keys(adsByPlatform) as PlatformIcon[]) {
    for (const ad of adsByPlatform[platform]) {
      const id = classifySegment(ad, SEGMENTS)
      ;(taggedBySegment[id] ??= []).push({ ad, platform })
    }
  }

  // For each segment, build the per-platform groups that SegmentSection wants.
  // We keep PLATFORMS in the configured order so the sub-blocks line up the
  // same way under every segment. The handle is derived from the channels
  // actually present in that segment's ads for each platform.
  const segmentPlatformGroups: Record<string, PlatformGroup[]> = {}
  for (const seg of SEGMENTS) {
    const tagged = taggedBySegment[seg.id]
    segmentPlatformGroups[seg.id] = PLATFORMS.map(p => {
      const segAds = tagged.filter(t => t.platform === p.id).map(t => t.ad)
      return {
        id:     p.id,
        name:   p.name,
        handle: deriveHandle(p.id, segAds.length ? segAds : adsByPlatform[p.id]),
        ads:    segAds,
      }
    })
  }

  // Drop empty segments from the rendered list so the wall doesn't show
  // segments that have no spend at all. "Other" is included only if it has ads
  // — keeps the surface honest about un-classified campaigns.
  const visibleSegments = SEGMENTS.filter(seg => {
    const ads = taggedBySegment[seg.id]
    return ads.length > 0
  })

  // Top-bar nav pills — one per visible segment. The mark/accent come straight
  // from the segment definition.
  const navItems: NavItem[] = visibleSegments.map(seg => ({
    id:     seg.id,
    name:   seg.name,
    mark:   seg.mark,
    accent: seg.accent,
  }))

  const totals: NavTotal[] = visibleSegments.map(seg =>
    totalsFor(seg.id, taggedBySegment[seg.id].map(t => t.ad)),
  )

  const lastSync = new Date().toLocaleTimeString(undefined, { hour12: false })

  return (
    <>
      <TopBar
        brandH1="Camelback Resort"
        brandSub="Ad Dashboard · Powered by Commit Agency"
        navItems={navItems}
        totals={totals}
        innerNote="Made in North Korea"
      />

      <main className="platforms">
        {visibleSegments.map(seg => (
          <SegmentSection
            key={seg.id}
            id={seg.id}
            name={seg.name}
            accent={seg.accent}
            mark={seg.mark}
            platforms={segmentPlatformGroups[seg.id]}
          />
        ))}
      </main>

      <footer className="footer">
        <span className="footer-tag">
          AdDash · live mirror of active placements
        </span>
        <span>last sync · {lastSync}</span>
        <AdminUnlock />
      </footer>
    </>
  )
}
