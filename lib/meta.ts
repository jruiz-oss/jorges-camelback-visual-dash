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
    // Include both ad-level status and effective_status
    // Meta's API does NOT support filtering by `status` (only `effective_status`).
    // So we fetch without a server-side filter and filter client-side instead.
    const fields = 'id,name,status,effective_status,creative{thumbnail_url}'

    let url: string | null =
      `https://graph.facebook.com/v19.0/${accountId}/ads` +
      `?access_token=${token}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit=100`

    while (url !== null) {
      const currentUrl: string = url
      const res  = await fetch(currentUrl, { cache: 'no-store' })
      const data = await res.json()

      if (data.error) {
        console.error('[Meta] API error:', data.error.message)
        break
      }

      const pageAds = data.data ?? []

      for (const ad of pageAds) {
        // Client-side filter: only include ads where the ad-level status is ACTIVE.
        // This shows ads whose creative is set active, regardless of parent state.
        if ((ad.status ?? '').toUpperCase() !== 'ACTIVE') continue

        const c = ad.creative ?? {}
        ads.push({
          id:       ad.id,
          name:     ad.name || 'Unnamed Ad',
          // Display effective_status so the user can see WHY an active ad isn't
          // serving (e.g. ADSET_PAUSED, CAMPAIGN_PAUSED)
          status:   (ad.effective_status || ad.status || 'UNKNOWN').toUpperCase(),
          imageUrl: c.thumbnail_url || '',
          headline: '',
        })
      }

      url = data.paging?.next ?? null
    }

    console.log(`[Meta] active ads returned: ${ads.length}`)
  } catch (err) {
    console.error('[Meta] Fetch failed:', err)
  }

  return ads
}
