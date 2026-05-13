import type { Ad } from './types'

const META_API_VERSION = 'v19.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

// ─── Step 1: spend-first ──────────────────────────────────────────────────────
// /insights returns just ad_id + spend — a tiny payload. We can paginate the
// whole month without ever hitting the "reduce the amount of data" throttle
// that bit the old /ads listing.
type InsightsRow  = { ad_id: string; spend?: string }
type InsightsResp = {
  data?:   InsightsRow[]
  paging?: { next?: string }
  error?:  { message: string; code?: number }
}

async function fetchSpendingAdIds(accountId: string, token: string): Promise<Set<string>> {
  const spendingIds = new Set<string>()
  const fields = 'ad_id,spend'

  let url: string | null =
    `${GRAPH}/${accountId}/insights` +
    `?access_token=${token}` +
    `&level=ad` +
    `&date_preset=this_month` +
    `&fields=${encodeURIComponent(fields)}` +
    `&limit=500`

  while (url) {
    const res:  Response       = await fetch(url, { cache: 'no-store' })
    const data: InsightsResp   = await res.json()

    if (data.error) {
      console.error('[Meta] insights error:', data.error.message)
      break
    }

    for (const row of data.data ?? []) {
      const spend = parseFloat(row.spend ?? '0')
      if (spend > 0 && row.ad_id) spendingIds.add(row.ad_id)
    }
    url = data.paging?.next ?? null
  }

  console.log(`[Meta] ads with spend this month: ${spendingIds.size}`)
  return spendingIds
}

// ─── Step 2: batch ad details by ID ───────────────────────────────────────────
// Meta's `?ids=` endpoint lets us pull up to ~50 objects per call. We only
// fetch details for ads we already know spent money this month.
type AdDetail = {
  id: string
  name?: string
  status?: string
  effective_status?: string
  creative?: { thumbnail_url?: string }
  campaign?: { name?: string }
}

async function fetchAdDetails(ids: string[], token: string): Promise<Ad[]> {
  if (!ids.length) return []

  const fields = 'id,name,status,effective_status,creative{thumbnail_url},campaign{name}'
  const ads: Ad[] = []
  const CHUNK = 50

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const url =
      `${GRAPH}/` +
      `?ids=${slice.join(',')}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&access_token=${token}`

    const res = await fetch(url, { cache: 'no-store' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()

    if (data?.error) {
      console.error('[Meta] details error:', data.error.message)
      continue
    }

    for (const adId of slice) {
      const ad: AdDetail | undefined = data?.[adId]
      if (!ad) continue
      const effective = (ad.effective_status || ad.status || '').toUpperCase()
      // Live-only: ignore ads that spent earlier in the month but are now paused
      if (effective !== 'ACTIVE') continue
      ads.push({
        id:       ad.id,
        name:     ad.name || 'Unnamed Ad',
        status:   effective,
        imageUrl: ad.creative?.thumbnail_url || '',
        headline: '',
        campaign: ad.campaign?.name || '',
      })
    }
  }

  return ads
}

// ─── Public entry point ───────────────────────────────────────────────────────
export async function fetchMetaAds(): Promise<Ad[]> {
  const token     = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  if (!token || !accountId) {
    console.warn('[Meta] Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID')
    return []
  }

  try {
    const spendingIds = await fetchSpendingAdIds(accountId, token)
    if (!spendingIds.size) {
      console.log('[Meta] no ads spent this month — nothing to show')
      return []
    }

    const ads = await fetchAdDetails(Array.from(spendingIds), token)
    console.log(`[Meta] live ads with spend this month: ${ads.length}`)
    return ads
  } catch (err) {
    console.error('[Meta] Fetch failed:', err)
    return []
  }
}
