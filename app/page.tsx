import { fetchMetaAds }                  from '@/lib/meta'
import { fetchGoogleAds, explodeAd }     from '@/lib/google-ads'
// StackAdapt intentionally disabled until a properly-scoped API key is provisioned.
// import { fetchStackAdaptAds }            from '@/lib/stackadapt'
import type { Ad }                       from '@/lib/types'
import RefreshButton                     from '@/components/RefreshButton'
import AdCard                            from '@/components/AdCard'
import LoadedAt                          from '@/components/LoadedAt'
import { MetaLogo, GoogleAdsLogo }       from '@/components/PlatformLogo'
import type { ReactNode }                from 'react'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Count unique non-empty campaign names. Ads from `explodeAd()` share a campaign
// field, so de-duping by campaign name gives the campaign count even after a
// single Google ad has been split into many creative variants.
function uniqueCampaigns(ads: Ad[]): number {
  const set = new Set<string>()
  for (const a of ads) {
    if (a.campaign && a.campaign.trim()) set.add(a.campaign.trim())
  }
  return set.size
}

// Group ads by campaign name, preserving first-seen order, then sort the result
// by creative count (biggest campaigns first — most useful for a client view).
function groupByCampaign(ads: Ad[]): Array<{ name: string; ads: Ad[] }> {
  const order: string[] = []
  const buckets = new Map<string, Ad[]>()
  for (const ad of ads) {
    const key = (ad.campaign ?? '').trim() || '(No campaign)'
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

// ─── Campaign sub-section ────────────────────────────────────────────────────
// One per campaign inside a platform. Subheader + horizontally scrolling row
// of AdCards so users can swipe through all variants without the page becoming
// a wall of cards.
function CampaignSection({ name, ads, accent }: {
  name: string, ads: Ad[], accent: string,
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 10, paddingLeft: 2,
      }}>
        <div style={{
          width: 3, height: 14, borderRadius: 2,
          background: accent,
        }} />
        <span style={{
          fontSize: 13, fontWeight: 600, color: '#334155',
          letterSpacing: '-.01em',
        }}>
          {name}
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
          · {ads.length} {ads.length === 1 ? 'creative' : 'creatives'}
        </span>
      </div>
      <div
        className="campaign-scroll"
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto' as const,
          overflowY: 'visible' as const,
          paddingBottom: 10,
          scrollSnapType: 'x proximity' as const,
          WebkitOverflowScrolling: 'touch' as const,
        }}
      >
        {ads.map(ad => (
          <div key={ad.id} style={{ scrollSnapAlign: 'start' as const, flexShrink: 0 }}>
            <AdCard ad={ad} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Platform row ─────────────────────────────────────────────────────────────
function PlatformRow({ logo, label, accent, ads }: {
  logo: ReactNode, label: string, accent: string, ads: Ad[]
}) {
  const campaigns = uniqueCampaigns(ads)
  const groups    = groupByCampaign(ads)

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 18, paddingBottom: 12,
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)',
          border: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(15,23,42,.05), inset 0 -1px 0 rgba(15,23,42,.02)',
          flexShrink: 0,
        }}>
          {logo}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-.01em' }}>
            {label}
          </span>
          <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
            <span style={{ color: accent, fontWeight: 600 }}>
              {campaigns} {campaigns === 1 ? 'campaign' : 'campaigns'}
            </span>
            <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
            {ads.length} {ads.length === 1 ? 'creative' : 'creatives'}
          </span>
        </div>
      </div>

      {ads.length === 0 ? (
        <p style={{
          fontSize: 12.5, color: '#94a3b8',
          padding: '14px 16px', background: '#f8fafc',
          border: '1px dashed #e2e8f0', borderRadius: 8,
        }}>
          No live ads with spend this month.
        </p>
      ) : (
        <div>
          {groups.map(g => (
            <CampaignSection
              key={g.name}
              name={g.name}
              ads={g.ads}
              accent={accent}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const [metaAds, googleAdsRaw] = await Promise.allSettled([
    fetchMetaAds(),
    fetchGoogleAds(),
  ]).then(results =>
    results.map(r => (r.status === 'fulfilled' ? r.value : []))
  ) as [Ad[], Ad[]]

  // Explode each Google ad into one card per (headline, description, image) variant
  const googleAds = googleAdsRaw.flatMap(explodeAd)

  // Headline metric: unique campaigns across all platforms. Far more meaningful
  // for a client view than counting exploded creative variants.
  const totalCampaigns = uniqueCampaigns([...metaAds, ...googleAds])
  const totalCreatives = metaAds.length + googleAds.length

  return (
    <main style={{
      maxWidth: 1440, margin: '0 auto',
      padding: '28px 24px 40px',
      // Font now inherits from body (Inter via Google Fonts — see layout.tsx).
    }}>
      {/* ─── Header ─── */}
      {/* `position: sticky` pins the header to the viewport once scrolled.
          A 12px top offset gives it a "floating card" feel rather than glueing
          it flush against the window chrome. zIndex keeps it above scrolled
          AdCards, and the heavier shadow reads as elevation. */}
      <header style={{
        position: 'sticky' as const,
        top: 12,
        zIndex: 50,
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: '18px 24px',
        marginBottom: 32,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 16px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.04)',
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: '#0f172a',
            letterSpacing: '-.02em', lineHeight: 1.1,
          }}>
            Ad Dashboard
          </h1>
          <p style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4, letterSpacing: '.02em' }}>
            Built by Jorge · <span style={{ color: '#cbd5e1' }}>not the North Korean one</span>
          </p>
          <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
            Last loaded <LoadedAt />
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Stats pill: 3-stop gradient that lands on indigo for a touch of
              brand color, plus an indigo-tinted ring + softer ambient shadow so
              it reads as elevated rather than just dark. */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            padding: '11px 18px', borderRadius: 12,
            background: 'linear-gradient(135deg,#0f172a 0%, #1e293b 55%, #312e81 100%)',
            color: '#fff',
            boxShadow:
              '0 0 0 1px rgba(99,102,241,.18),' +
              ' 0 8px 20px rgba(15,23,42,.18),' +
              ' inset 0 1px 0 rgba(255,255,255,.06)',
          }}>
            <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em' }}>
              {totalCampaigns}
            </span>
            <span style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 500 }}>
              {totalCampaigns === 1 ? 'campaign' : 'campaigns'} this month
            </span>
            <span style={{ color: '#475569', margin: '0 4px' }}>·</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{totalCreatives} creatives</span>
          </div>
          <RefreshButton />
        </div>
      </header>

      <PlatformRow
        logo={<MetaLogo />}
        label="Meta Ads"
        accent="#0866ff"
        ads={metaAds}
      />
      <PlatformRow
        logo={<GoogleAdsLogo />}
        label="Google Ads"
        accent="#4285F4"
        ads={googleAds}
      />
    </main>
  )
}
