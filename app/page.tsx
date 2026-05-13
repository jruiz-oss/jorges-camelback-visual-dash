import { fetchMetaAds }              from '@/lib/meta'
import { fetchGoogleAds, explodeAd } from '@/lib/google-ads'
import { fetchStackAdaptAds }        from '@/lib/stackadapt'
import { SEGMENTS, classifySegment } from '@/lib/segments'
import type { Ad }                   from '@/lib/types'
import TopBar, {
  type NavItem, type NavTotal,
} from '@/components/TopBar'
import SegmentSection, {
  type PlatformGroup, type PlatformIcon,
} from '@/components/SegmentSection'

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
const PLATFORMS: Array<{ id: PlatformIcon; name: string; handle: string }> = [
  { id: 'meta',       name: 'Meta',       handle: '@camelbackresort' },
  { id: 'google',     name: 'Google Ads', handle: 'Search · Display · YouTube' },
  { id: 'stackadapt', name: 'StackAdapt', handle: 'Programmatic · Display · Native' },
]

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

  // Bucket every ad into a segment, keyed by segment id, with the platform of
  // origin preserved on each ad so we can re-split below.
  type Tagged = { ad: Ad; platform: PlatformIcon }
  const taggedBySegment: Record<string, Tagged[]> = {}
  for (const seg of SEGMENTS) taggedBySegment[seg.id] = []
  for (const platform of Object.keys(adsByPlatform) as PlatformIcon[]) {
    for (const ad of adsByPlatform[platform]) {
      taggedBySegment[classifySegment(ad)].push({ ad, platform })
    }
  }

  // For each segment, build the per-platform groups that SegmentSection wants.
  // We keep PLATFORMS in the configured order so the sub-blocks line up the
  // same way under every segment.
  const segmentPlatformGroups: Record<string, PlatformGroup[]> = {}
  for (const seg of SEGMENTS) {
    const tagged = taggedBySegment[seg.id]
    segmentPlatformGroups[seg.id] = PLATFORMS.map(p => ({
      id:     p.id,
      name:   p.name,
      handle: p.handle,
      ads:    tagged.filter(t => t.platform === p.id).map(t => t.ad),
    }))
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
      </footer>
    </>
  )
}
