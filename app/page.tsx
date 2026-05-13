import { fetchMetaAds }                  from '@/lib/meta'
import { fetchGoogleAds, explodeAd }     from '@/lib/google-ads'
import { fetchStackAdaptAds }            from '@/lib/stackadapt'
import type { Ad }                       from '@/lib/types'
import RefreshButton           from '@/components/RefreshButton'
import AdCard                  from '@/components/AdCard'

export const dynamic = 'force-dynamic'

// ─── Platform row ─────────────────────────────────────────────────────────────
function PlatformRow({ icon, label, color, ads }: {
  icon: string, label: string, color: string, ads: Ad[]
}) {
  const active = ads.filter(a =>
    ['ACTIVE', 'ENABLED'].includes(a.status.toUpperCase())
  ).length

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 16, paddingBottom: 10,
        borderBottom: `2px solid ${color}`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 900, color: '#fff', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{label}</span>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 2 }}>
          {active} active / {ads.length} total
        </span>
      </div>

      {ads.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8', padding: '6px 0 10px' }}>
          No ads returned — check credentials or active campaigns.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {ads.map(ad => <AdCard key={ad.id} ad={ad} />)}
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const [metaAds, googleAdsRaw, stackAds] = await Promise.allSettled([
    fetchMetaAds(),
    fetchGoogleAds(),
    fetchStackAdaptAds(),
  ]).then(results =>
    results.map(r => (r.status === 'fulfilled' ? r.value : []))
  ) as [Ad[], Ad[], Ad[]]

  // Explode each Google ad into one card per (headline, description, image) variant
  const googleAds = googleAdsRaw.flatMap(explodeAd)

  const total = metaAds.length + googleAds.length + stackAds.length
  const totalActive = [...metaAds, ...googleAds, ...stackAds]
    .filter(a => ['ACTIVE', 'ENABLED'].includes(a.status.toUpperCase())).length

  const now = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px' }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 30, paddingBottom: 16, borderBottom: '1px solid #e2e8f0',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Ad Dashboard</h1>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Last loaded: {now}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
              {totalActive}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              active / {total} total
            </div>
          </div>
          <RefreshButton />
        </div>
      </header>

      <PlatformRow icon="M" label="Meta Ads"   color="#1877F2" ads={metaAds}   />
      <PlatformRow icon="G" label="Google Ads" color="#4285F4" ads={googleAds} />
      <PlatformRow icon="S" label="StackAdapt" color="#00b09b" ads={stackAds}  />
    </main>
  )
}
