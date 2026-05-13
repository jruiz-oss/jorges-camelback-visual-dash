import { fetchMetaAds }              from '@/lib/meta'
import { fetchGoogleAds, explodeAd } from '@/lib/google-ads'
import { fetchStackAdaptAds }        from '@/lib/stackadapt'
import type { Ad }                   from '@/lib/types'
import TopBar, {
  type PlatformNavItem, type PlatformTotal,
} from '@/components/TopBar'
import PlatformSection from '@/components/PlatformSection'

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

// Per-platform display config. Held here (not in lib) so the page owns
// presentation copy; the data layer stays agnostic.
const PLATFORMS: PlatformNavItem[] = [
  { id: 'meta',       name: 'Meta',       suffix: 'Ads', icon: 'meta' },
  { id: 'google',     name: 'Google',     suffix: 'Ads', icon: 'google' },
  { id: 'stackadapt', name: 'StackAdapt',                icon: 'stackadapt' },
]

// Short handle line under each platform name. Configurable strings, not
// pulled from data — chosen to read like the brand's own subline rather than
// a generic descriptor.
const PLATFORM_HANDLES: Record<string, string> = {
  meta:       '@camelbackresort',
  google:     'Search · Display · YouTube',
  stackadapt: 'Programmatic · Display · Native',
}

const PLATFORM_ACCENTS: Record<string, string> = {
  meta:       'var(--meta)',
  google:     'var(--google)',
  stackadapt: 'var(--stack)',
}

function totalsFor(id: string, ads: Ad[]): PlatformTotal {
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

  // Meta: one card per ad (skip the dynamic-creative explosion that used to
  // produce duplicate cards). Google: explode PMax + RSA asset groups so each
  // variant gets its own tile in the lane.
  const metaAds   = metaAdsRaw
  const googleAds = googleAdsRaw.flatMap(explodeAd)

  const adsByPlatform: Record<string, Ad[]> = {
    meta:       metaAds,
    google:     googleAds,
    stackadapt: stackAdaptAds,
  }

  const totals: PlatformTotal[] = PLATFORMS.map(p =>
    totalsFor(p.id, adsByPlatform[p.id] ?? []),
  )

  const lastSync = new Date().toLocaleTimeString(undefined, { hour12: false })

  return (
    <>
      <TopBar
        brandH1="Camelback Resort"
        brandSub="Ad Dashboard · Powered by Commit Agency"
        platforms={PLATFORMS}
        totals={totals}
        innerNote="Made in North Korea"
      />

      <main className="platforms">
        {PLATFORMS.map(p => (
          <PlatformSection
            key={p.id}
            id={p.id}
            name={p.name}
            suffix={p.suffix}
            icon={p.icon}
            handle={PLATFORM_HANDLES[p.id] ?? ''}
            accent={PLATFORM_ACCENTS[p.id] ?? 'var(--ink)'}
            ads={adsByPlatform[p.id] ?? []}
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
