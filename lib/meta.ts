import type { Ad } from './types'

export async function fetchMetaAds(): Promise<Ad[]> {
  const token     = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  if (!token || !accountId) {
    console.warn('[Meta] Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID')
    return []
  }

  const ads: Ad[] = []

  try {
    // Minimal fields to avoid "reduce data" error
    const fields = 'id,name,effective_status,creative{thumbnail_url}'
    // Active only — effective_status=ACTIVE means the ad, its adset, AND its campaign
    // are all active and the ad is actually serving
    const filtering = JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
    ])

    let url: string | null =
      `https://graph.facebook.com/v19.0/${accountId}/ads` +
      `?access_token=${token}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&filtering=${encodeURIComponent(filtering)}` +
      `&limit=25`

    while (url !== null) {
      const currentUrl: string = url
      const res  = await fetch(currentUrl, { cache: 'no-store' })
      const data = await res.json()

      if (data.error) {
        console.error('[Meta] API error:', data.error.message)
        break
      }

      for (const ad of data.data ?? []) {
        const c = ad.creative ?? {}
        ads.push({
          id:       ad.id,
          name:     ad.name || 'Unnamed Ad',
          status:   (ad.effective_status || 'UNKNOWN').toUpperCase(),
          imageUrl: c.thumbnail_url || '',
          headline: '',
        })
      }

      url = data.paging?.next ?? null
    }
  } catch (err) {
    console.error('[Meta] Fetch failed:', err)
  }

  return ads
}
