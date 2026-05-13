import { fetchMetaAds }                  from '@/lib/meta'
import { fetchGoogleAds, explodeAd }     from '@/lib/google-ads'
// StackAdapt intentionally disabled until a properly-scoped API key is provisioned.
// import { fetchStackAdaptAds }            from '@/lib/stackadapt'
import type { Ad }                       from '@/lib/types'
import RefreshButton                     from '@/components/RefreshButton'
import AdCard                            from '@/components/AdCard'
import { MetaLogo, GoogleAdsLogo }       from '@/components/PlatformLogo'
import type { ReactNode }                from 'react'

export const dynamic = 'force-dynamic'

// ─── Platform row ─────────────────────────────────────────────────────────────
function PlatformRow({ logo, label, accent, ads }: {
  logo: ReactNode, label: string, accent: string, ads: Ad[]
}) {
  const active = ads.filter(a =>
    ['ACTIVE', 'ENABLED'].includes(a.status.toUpperCase())
  ).length

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 18, paddingBottom: 12,
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: '#fff', border: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          flexShrink: 0,
        }}>
          {logo}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-.01em' }}>
            {label}
          </span>
          <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
            <span style={{ color: accent, fontWeight: 600 }}>{active} active</span>
            <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
            {ads.length} total
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {ads.map(ad => <AdCard key={ad.id} ad={ad} />)}
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

  const total = metaAds.length + googleAds.length
  const totalActive = [...metaAds, ...googleAds]
    .filter(a => ['ACTIVE', 'ENABLED'].includes(a.status.toUpperCase())).length

  const now = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return (
    <main style={{
      maxWidth: 1440, margin: '0 auto',
      padding: '28px 24px 40px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    }}>
      {/* ─── Header ─── */}
      <header style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(15,23,42,.04)',
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: '#0f172a',
            letterSpacing: '-.02em', lineHeight: 1.1,
          }}>
            Ad Dashboard
          </h1>
          <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 5 }}>
            Last loaded {now}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            padding: '10px 16px', borderRadius: 10,
            background: 'linear-gradient(135deg,#0f172a 0%, #1e293b 100%)',
            color: '#fff',
          }}>
            <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{totalActive}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>active</span>
            <span style={{ color: '#475569', margin: '0 2px' }}>/</span>
            <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>{total}</span>
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
