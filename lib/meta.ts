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
    // Include both ad-level status (for filtering) and effective_status (for visibility)
    const fields = 'id,name,status,effective_status,creative{thumbnail_url}'
    // Filter on ad-level `status` — returns ads whose CREATIVE is set to active,
    // regardless of whether parent adset/campaign is paused. Use effective_status
    // if you only want ads that are currently serving (parent + ad both active).
    const filtering = JSON.stringify([
      { field: 'status', operator: 'IN', value: ['ACTIVE'] },
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

      const pageAds = data.data ?? []
      console.log(`[Meta] page returned ${pageAds.length} ads`)

      for (const ad of pageAds) {
        const c = ad.creative ?? {}
        ads.push({
          id:       ad.id,
          name:     ad.name || 'Unnamed Ad',
          // Show effective_status so user can see WHY an ad isn't running
          // (e.g. ADSET_PAUSED) even though the ad creative itself is active
          status:   (ad.effective_status || ad.status || 'UNKNOWN').toUpperCase(),
          imageUrl: c.thumbnail_url || '',
          headline: '',
        })
      }

      url = data.paging?.next ?? null
    }

    console.log(`[Meta] total ads returned: ${ads.length}`)
  } catch (err) {
    console.error('[Meta] Fetch failed:', err)
  }

  return ads
}
