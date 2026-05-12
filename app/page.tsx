import { fetchMetaAds }        from '@/lib/meta'
import { fetchGoogleAds }      from '@/lib/google-ads'
import { fetchStackAdaptAds }  from '@/lib/stackadapt'
import type { Ad }             from '@/lib/types'
import RefreshButton           from '@/components/RefreshButton'

// Re-fetch on every request (no caching)
export const dynamic = 'force-dynamic'

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS: Record<string, [string, string]> = {
  ACTIVE:   ['#16a34a', '#dcfce7'],
  ENABLED:  ['#16a34a', '#dcfce7'],
  PAUSED:   ['#d97706', '#fef3c7'],
  INACTIVE: ['#dc2626', '#fee2e2'],
  DISABLED: ['#dc2626', '#fee2e2'],
  REMOVED:  ['#6b7280', '#f3f4f6'],
}

function Badge({ status }: { status: string }) {
  const [color, bg] = STATUS[status.toUpperCase()] ?? ['#6b7280', '#f3f4f6']
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}`,
      padding: '2px 9px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: '.4px',
      whiteSpace: 'nowrap', textTransform: 'uppercase',
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── Ad card ──────────────────────────────────────────────────────────────────
function AdCard({ ad }: { ad: Ad }) {
  const name        = ad.name || 'Unnamed'
  const displayName = name.length > 54 ? name.slice(0, 54) + '…' : name
  const textHint    = ad.headline || ad.campaign || 'Text Ad'
  const hint        = textHint.length > 85 ? textHint.slice(0, 85) + '…' : textHint

  return (
    <div style={{
      background: '#fff', borderRadius: 10, overflow: 'hidden',
      width: 178, flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 1px 8px rgba(0,0,0,.04)',
    }}>
      {/* Image area */}
      <div style={{ width: '100%', height: 158, overflow: 'hidden', position: 'relative' }}>
        {ad.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={ad.imageUrl}
            alt={name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
              const fallback = el.nextElementSibling as HTMLElement | null
              if (fallback) fallback.style.display = 'flex'
            }}
          />
        ) : null}
        {/* Fallback / text-ad placeholder */}
        <div style={{
          display: ad.imageUrl ? 'none' : 'flex',
          position: ad.imageUrl ? 'absolute' : 'relative',
          inset: 0, width: '100%', height: ad.imageUrl ? '100%' : 158,
          background: 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
          alignItems: 'center', justifyContent: 'center',
          padding: 14, textAlign: 'center',
        }}>
          <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>{hint}</p>
        </div>
      </div>

      {/* Card footer */}
      <div style={{ padding: '10px 10px 12px' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#1e293b',
          lineHeight: 1.35, marginBottom: 7,
        }}>
          {displayName}
        </div>
        <Badge status={ad.status} />
      </div>
    </div>
  )
}

// ─── Platform row ─────────────────────────────────────────────────────────────
interface PlatformProps {
  icon:  string
  label: string
  color: string
  ads:   Ad[]
}

function PlatformRow({ icon, label, color, ads }: PlatformProps) {
  const active = ads.filter(a => ['ACTIVE','ENABLED'].includes(a.status.toUpperCase())).length

  return (
    <section style={{ marginBottom: 36 }}>
      {/* Header */}
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

      {/* Cards */}
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
  // Fetch all three in parallel
  const [metaAds, googleAds, stackAds] = await Promise.allSettled([
    fetchMetaAds(),
    fetchGoogleAds(),
    fetchStackAdaptAds(),
  ]).then(results =>
    results.map(r => (r.status === 'fulfilled' ? r.value : []))
  ) as [Ad[], Ad[], Ad[]]

  const total       = metaAds.length + googleAds.length + stackAds.length
  const totalActive = [...metaAds, ...googleAds, ...stackAds]
    .filter(a => ['ACTIVE', 'ENABLED'].includes(a.status.toUpperCase())).length

  const now = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return (
    <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px' }}>
      {/* Top bar */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 30, paddingBottom: 16,
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            Ad Dashboard
          </h1>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
            Last loaded: {now}
          </p>
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

      {/* Platform rows */}
      <PlatformRow icon="M" label="Meta Ads"   color="#1877F2" ads={metaAds}   />
      <PlatformRow icon="G" label="Google Ads" color="#4285F4" ads={googleAds} />
      <PlatformRow icon="S" label="StackAdapt" color="#00b09b" ads={stackAds}  />
    </main>
  )
}
