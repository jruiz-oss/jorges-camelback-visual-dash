import { fetchMetaAds }                        from '@/lib/meta'
import { fetchGoogleAds, explodeAd }           from '@/lib/google-ads'
import type { GoogleCreds }                    from '@/lib/google-ads'
import { fetchStackAdaptAds }                  from '@/lib/stackadapt'
import { buildSegments, classifySegment, campaignKey, parseCustomSegments } from '@/lib/segments'
import type { Ad }                   from '@/lib/types'
import TopBar, {
  type NavItem, type NavTotal,
} from '@/components/TopBar'
import SegmentSection, {
  type PlatformGroup, type PlatformIcon,
} from '@/components/SegmentSection'
import AdminUnlock from '@/components/AdminUnlock'
import AccountGoalsButton from '@/components/AccountGoalsButton'
import AdFilterButton from '@/components/AdFilterButton'
import ViewModeButton from '@/components/ViewModeButton'
import LoadedAt from '@/components/LoadedAt'
import { parseViewMode, type ViewMode } from '@/lib/view-mode'
import { getAdFilter } from '@/lib/ad-filter-store'
import { PerfProvider } from '@/components/PerfContext'
import SegmentOrderStyle from '@/components/SegmentOrderStyle'
import SegmentColorStyle from '@/components/SegmentColorStyle'
import { findClient } from '@/lib/clients'
import { applyAdFilter } from '@/lib/ad-filter'
import { findCredentialCollision, stackAdaptApiKey } from '@/lib/credential-guard'
import { loadOverrides } from '@/lib/overrides'
import { cached } from '@/lib/server-cache'
import { SegmentOverrideProvider } from '@/components/SegmentOverrideContext'
import { notFound } from 'next/navigation'

// `force-dynamic` keeps the existing behavior: every navigation/refresh runs
// the connector fetches server-side. TopBar's soft 60s `router.refresh()` ticks
// re-enter this function on the cadence the live-ticker copy advertises.
export const dynamic = 'force-dynamic'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isLive(status: string): boolean {
  const s = status.toUpperCase()
  return s === 'ACTIVE' || s === 'ENABLED'
}

// Connector results are shared by every viewer for CACHE_TTL_MS (lib/server-cache.ts):
// the 60s soft refresh in TopBar lands just after expiry, so each tick still
// gets fresh data, but N open screens cost one fetch instead of N. If a
// platform errors or exceeds its timeout, the last good result (up to
// STALE_MS old) is shown instead of an empty lane.
const CACHE_TTL_MS = 55_000
const STALE_MS     = 30 * 60_000

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
function deriveHandle(platform: PlatformIcon, ads: Ad[], metaHandle: string): string {
  if (platform === 'meta') {
    // Meta handle is the account identifier, not a channel list.
    return metaHandle
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
export default async function DashboardPage({ params }: { params: { client: string } }) {
  const clientConfig = findClient(params.client)
  if (!clientConfig) notFound()
  const p = clientConfig.envPrefix

  // Two clients pointing at the same ad account / password = cross-client data.
  const collision = findCredentialCollision(clientConfig)
  if (collision) throw new Error(`[${params.client}] Credential isolation: ${collision}.`)

  // ── Credential isolation guard ───────────────────────────────────────────
  // Meta account ID is REQUIRED — an empty string would silently query the
  // wrong account or return no data with no explanation.
  // Google and StackAdapt are OPTIONAL integrations: if their env vars are
  // absent the fetchers return [] and the UI shows the "not connected" state.
  // That graceful degradation is intentional — not every client has every
  // platform wired up yet.
  //
  // Isolation guarantee: every credential is keyed by `p` (this client's
  // envPrefix). There is no shared mutable credential state between clients —
  // a missing key for client A cannot cause client B's key to be used.
  function requireEnv(key: string): string {
    const val = process.env[key]
    if (!val) throw new Error(
      `[${params.client}] Missing required env var "${key}". ` +
      `Add it to Vercel (and .env.local) before deploying this client.`
    )
    return val
  }

  // META_ACCESS_TOKEN is a global system-user token (same across all clients).
  // Per-client: just the ad account ID.
  const metaCreds = {
    accountId: requireEnv(`${p}_META_AD_ACCOUNT_ID`),
  }
  // Google: only the per-client customer ID. Auth uses a shared service account
  // (GOOGLE_SERVICE_ACCOUNT_JSON) — no refresh tokens, no OAuth flow.
  // Optional — empty string causes fetchGoogleAds to return [] gracefully.
  const googleCreds: GoogleCreds = {
    customerId: process.env[`${p}_GOOGLE_CUSTOMER_ID`] ?? '',
  }
  // Optional — empty string causes fetchStackAdaptAds to return [] gracefully.
  // advertiserId comes from the per-client env var {PREFIX}_STACKADAPT_ADVERTISER_ID
  // (the StackAdapt API key is account-wide, so this scopes results to one client).
  // Falls back to the legacy hardcoded clientConfig value if the env var is unset.
  const stackadaptCreds = {
    apiKey:       stackAdaptApiKey(clientConfig),
    advertiserId: process.env[`${p}_STACKADAPT_ADVERTISER_ID`] || clientConfig.stackadaptAdvertiserId,
  }

  // All three platforms fetched in parallel, each through the shared cache
  // (keyed by client) — a single platform failing or hanging shouldn't blank
  // the whole wall. Google's own errors come back as `networkError`, which is
  // turned into a throw so the cache serves the last good result instead.
  const [metaResult, stackAdaptResult, googleSettled, overridesRes, filterRes] = await Promise.allSettled([
    cached(`meta:${clientConfig.slug}`, { ttlMs: CACHE_TTL_MS, staleMs: STALE_MS, timeoutMs: 45_000 },
      () => fetchMetaAds(metaCreds)),
    cached(`stackadapt:${clientConfig.slug}`, { ttlMs: CACHE_TTL_MS, staleMs: STALE_MS, timeoutMs: 60_000 },
      () => fetchStackAdaptAds(stackadaptCreds)),
    cached(`google:${clientConfig.slug}`, { ttlMs: CACHE_TTL_MS, staleMs: STALE_MS, timeoutMs: 45_000 },
      async () => {
        const r = await fetchGoogleAds(googleCreds)
        if (r.networkError) throw new Error('Google fetch failed')
        return r
      }),
    loadOverrides(clientConfig.slug),
    getAdFilter(clientConfig),
  ])

  const metaAdsRaw   = metaResult.status    === 'fulfilled' ? metaResult.value    : [] as Ad[]
  const stackAdaptRaw = stackAdaptResult.status === 'fulfilled' ? stackAdaptResult.value : [] as Ad[]
  const googleResult  = googleSettled.status === 'fulfilled'
    ? googleSettled.value
    : { ads: [] as Ad[], authExpired: false, networkError: true }
  for (const [name, r] of [['Meta', metaResult], ['StackAdapt', stackAdaptResult], ['Google', googleSettled]] as const) {
    if (r.status === 'rejected') console.error(`[${params.client}] ${name} unavailable:`, (r.reason as Error)?.message ?? r.reason)
  }
  // Shared admin overrides (renames, colors, order, moves, custom segments,
  // view mode) from the database — the same for every viewer.
  const { overrides, storage } = overridesRes.status === 'fulfilled'
    ? overridesRes.value
    : { overrides: { names: {}, colors: {}, order: [], adMoves: {}, campaignMoves: {}, customSegments: {} }, storage: 'error' as const }

  // Meta: one card per ad. Google: explode PMax + RSA asset groups so each
  // variant gets its own tile in the lane.
  // Per-client include/exclude filter (lib/ad-filter.ts) runs before segmentation.
  const f = filterRes.status === 'fulfilled' ? filterRes.value.filter : undefined
  const stackAdaptAds = applyAdFilter(stackAdaptRaw, 'stackadapt', f)
  const metaAds   = applyAdFilter(metaAdsRaw, 'meta', f)
  const googleAds = applyAdFilter(googleResult.ads, 'google', f).flatMap(explodeAd)

  const adsByPlatform: Record<PlatformIcon, Ad[]> = {
    meta:       metaAds,
    google:     googleAds,
    stackadapt: stackAdaptAds,
  }

  // Discover segments from the data itself. Curated verticals come ONLY from
  // this client's own `curatedSegments` (lib/clients.ts) — none for clients that
  // don't define any — and match on campaign-name keywords; all other campaigns
  // are auto-bucketed by the first token of the name.
  const allAds = ([] as Ad[]).concat(metaAds, googleAds, stackAdaptAds)
  const SEGMENTS = buildSegments(allAds, {
    curated:        clientConfig.curatedSegments,
    custom:         parseCustomSegments(overrides.customSegments),
    autoPalette:    clientConfig.autoPalette,
    fallbackAccent: clientConfig.fallbackAccent,
    brandWords:     clientConfig.brandWords,
  })

  // Bucket every ad into a segment, keyed by segment id, with the platform of
  // origin preserved on each ad so we can re-split below.
  type Tagged = { ad: Ad; platform: PlatformIcon }
  const taggedBySegment: Record<string, Tagged[]> = {}
  for (const seg of SEGMENTS) taggedBySegment[seg.id] = []
  // Manual moves win over auto-classification, but only when they point at a
  // segment that still exists — a stale cookie (e.g. pointing at a curated
  // segment id from a client that no longer defines it) silently falls back
  // to auto-classification instead of dropping the ad.
  // Precedence: per-tile move > whole-campaign move > auto-classification.
  // Overrides are stored per client slug, so one client's moves never leak
  // into another client's wall.
  const adSegmentOverrides       = overrides.adMoves
  const campaignSegmentOverrides = overrides.campaignMoves
  const exists = (segId: string | undefined): segId is string => !!segId && !!taggedBySegment[segId]
  for (const platform of Object.keys(adsByPlatform) as PlatformIcon[]) {
    for (const ad of adsByPlatform[platform]) {
      const adOverride   = adSegmentOverrides[ad.id]
      const campOverride = campaignSegmentOverrides[campaignKey(platform, ad.campaign)]
      const id = exists(adOverride)   ? adOverride
               : exists(campOverride) ? campOverride
               : classifySegment(ad, SEGMENTS, clientConfig.brandWords)
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
    segmentPlatformGroups[seg.id] = PLATFORMS.map(plat => {
      const segAds = tagged.filter(t => t.platform === plat.id).map(t => t.ad)
      return {
        id:     plat.id,
        name:   plat.name,
        handle: deriveHandle(plat.id, segAds.length ? segAds : adsByPlatform[plat.id], clientConfig.metaHandle),
        ads:    segAds,
      }
    })
  }

  // Drop empty segments from the rendered list so the wall doesn't show
  // segments that have no spend at all. "Other" is included only if it has ads
  // — keeps the surface honest about un-classified campaigns.
  const allSegmentOptions = SEGMENTS.map(seg => ({ id: seg.id, name: seg.name }))

  const visibleSegments = SEGMENTS.filter(seg => {
    const ads = taggedBySegment[seg.id]
    return ads.length > 0
  })

  // View mode: saved by the admin (shared overrides) > {PREFIX}_VIEW_MODE env >
  // segments. "channel" drops segments entirely: one section per
  // platform, campaigns inside. Section ids are prefixed `channel-` so saved
  // order/color/name overrides never mix with segment ids.
  const viewMode: ViewMode =
    overrides.viewMode ??
    parseViewMode(process.env[`${p}_VIEW_MODE`]) ??
    'segment'

  const CHANNEL_ACCENT: Record<PlatformIcon, string> = { meta: '#0866FF', google: '#34A853', stackadapt: '#4C5BD4' }
  const CHANNEL_MARK:   Record<PlatformIcon, string> = { meta: 'M', google: 'G', stackadapt: 'S' }
  type Section = {
    id: string; name: string; accent: string; mark: string
    platforms: PlatformGroup[]; flat: boolean
  }
  const sections: Section[] = viewMode === 'channel'
    ? PLATFORMS.filter(pl => adsByPlatform[pl.id].length > 0).map(pl => ({
        id:        `channel-${pl.id}`,
        name:      pl.name,
        accent:    CHANNEL_ACCENT[pl.id],
        mark:      CHANNEL_MARK[pl.id],
        flat:      true,
        platforms: [{
          id: pl.id, name: pl.name, ads: adsByPlatform[pl.id],
          handle: deriveHandle(pl.id, adsByPlatform[pl.id], clientConfig.metaHandle),
        }],
      }))
    : visibleSegments.map(seg => ({
        id: seg.id, name: seg.name, accent: seg.accent, mark: seg.mark,
        flat: false, platforms: segmentPlatformGroups[seg.id],
      }))

  // Top-bar nav pills — one per section. The mark/accent come straight from
  // the section definition.
  const navItems: NavItem[] = sections.map(sec => ({
    id:     sec.id,
    name:   sec.name,
    mark:   sec.mark,
    accent: sec.accent,
  }))

  const totals: NavTotal[] = sections.map(sec =>
    totalsFor(sec.id, sec.platforms.flatMap(pl => pl.ads)),
  )

  // Formatted in the viewer's browser (components/LoadedAt.tsx), not here:
  // the server's timezone is UTC, not the viewer's.
  const syncedAt = new Date().toISOString()

  // Build a :root override block when the client has brand-specific CSS tokens.
  const cssOverrideBlock = clientConfig.cssOverrides
    ? `:root{${Object.entries(clientConfig.cssOverrides).map(([k, v]) => `${k}:${v}`).join(';')}}`
    : null

  // PerfProvider: admin-only 7-day metrics + goals, fetched client-side from
  // /api/admin/* only once edit mode is unlocked (nothing is added to this
  // server render, so viewers pay no extra API calls and never see numbers).
  return (
    <SegmentOverrideProvider slug={clientConfig.slug} initial={overrides} storage={storage}>
    <PerfProvider slug={clientConfig.slug}>
      {cssOverrideBlock && (
        <style dangerouslySetInnerHTML={{ __html: cssOverrideBlock }} />
      )}
      <TopBar
        brandH1={`${clientConfig.name} Ad Dashboard`}
        brandSub="Powered by Commit Agency"
        navItems={navItems}
        totals={totals}
      />

      {/* Injects CSS order: N on each section so admin drag-reorder is reflected
          in the page body without re-rendering server components. */}
      <SegmentOrderStyle segmentIds={sections.map(sec => sec.id)} />

      {/* Applies admin per-segment accent color overrides (shared, database) to
          both the segment sections and their nav pills. */}
      <SegmentColorStyle />

      <main className="platforms">
        {sections.map(sec => (
          <SegmentSection
            key={sec.id}
            id={sec.id}
            name={sec.name}
            accent={sec.accent}
            mark={sec.mark}
            platforms={sec.platforms}
            clientDomain={clientConfig.brandDomain}
            // No move menus in channel view: there are no segments to move into.
            allSegments={sec.flat ? [] : allSegmentOptions}
            flat={sec.flat}
          />
        ))}
      </main>

      <footer className="footer">
        <span className="footer-tag">
          AdDash · live mirror of active placements
        </span>
        <span>last sync · <LoadedAt at={syncedAt} /></span>
        <span className="footer-admin">
          <AccountGoalsButton />
          <ViewModeButton mode={viewMode} />
          <AdFilterButton slug={clientConfig.slug} />
          <AdminUnlock />
        </span>
      </footer>
    </PerfProvider>
    </SegmentOverrideProvider>
  )
}
