import type { Ad } from './types'

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID     ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
      grant_type:    'refresh_token',
    }),
    cache: 'no-store',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error_description ?? 'Token exchange failed')
  return data.access_token
}

export async function fetchGoogleAds(): Promise<Ad[]> {
  const devToken   = process.env.GOOGLE_DEVELOPER_TOKEN
  const customerId = process.env.GOOGLE_CUSTOMER_ID?.replace(/-/g, '')
  const loginId    = process.env.GOOGLE_LOGIN_CUSTOMER_ID?.replace(/-/g, '')

  if (!devToken || !customerId) {
    console.warn('[Google] Missing GOOGLE_DEVELOPER_TOKEN or GOOGLE_CUSTOMER_ID')
    return []
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    console.error('[Google] Auth failed:', err)
    return []
  }

  const headers: Record<string, string> = {
    Authorization:    `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type':   'application/json',
  }
  if (loginId) headers['login-customer-id'] = loginId

  const baseUrl = `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`

  // Query all active/paused ads
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      ad_group_ad.ad.image_ad.image_url,
      ad_group_ad.ad.responsive_display_ad.headlines,
      ad_group_ad.ad.expanded_text_ad.headline_part1,
      ad_group_ad.ad.responsive_search_ad.headlines,
      campaign.name
    FROM ad_group_ad
    WHERE ad_group_ad.status IN ('ENABLED', 'PAUSED')
    LIMIT 200
  `

  const ads: Ad[] = []
  try {
    const res  = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ query }), cache: 'no-store' })
    const data = await res.json()

    if (data.error) {
      console.error('[Google] API error:', data.error.message)
      return []
    }

    for (const row of data.results ?? []) {
      const aga      = row.adGroupAd ?? {}
      const ad       = aga.ad       ?? {}
      const adType   = ad.type      ?? ''
      const status   = (aga.status  ?? 'UNKNOWN').toUpperCase()
      const campaign = row.campaign?.name ?? ''

      let imageUrl = ''
      let headline = ''

      if (adType === 'IMAGE_AD') {
        imageUrl = ad.imageAd?.imageUrl ?? ''
      } else if (adType === 'RESPONSIVE_DISPLAY_AD') {
        const hl = ad.responsiveDisplayAd?.headlines ?? []
        headline = hl[0]?.text ?? ''
      } else if (adType === 'EXPANDED_TEXT_AD') {
        headline = ad.expandedTextAd?.headlinePart1 ?? ''
      } else if (adType === 'RESPONSIVE_SEARCH_AD') {
        const hl = ad.responsiveSearchAd?.headlines ?? []
        headline = hl[0]?.text ?? ''
      }

      ads.push({
        id:       String(ad.id ?? ''),
        name:     ad.name || campaign || 'Unnamed Ad',
        status,
        imageUrl,
        headline,
        campaign,
        adType,
      })
    }

    // Backfill image URLs for responsive display ads
    await backfillRdaImages(ads, baseUrl, headers)
  } catch (err) {
    console.error('[Google] Fetch failed:', err)
  }

  return ads
}

async function backfillRdaImages(
  ads: Ad[],
  baseUrl: string,
  headers: Record<string, string>,
): Promise<void> {
  const rdaIds = ads
    .filter(a => !a.imageUrl && a.adType === 'RESPONSIVE_DISPLAY_AD')
    .map(a => a.id)
    .slice(0, 50)

  if (!rdaIds.length) return

  try {
    const idList = rdaIds.map(id => `'${id}'`).join(', ')
    const rdaQuery = `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.responsive_display_ad.marketing_images,
        ad_group_ad.ad.responsive_display_ad.square_marketing_images
      FROM ad_group_ad
      WHERE ad_group_ad.ad.id IN (${idList})
    `
    const rdaRes  = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ query: rdaQuery }), cache: 'no-store' })
    const rdaData = await rdaRes.json()

    // Build ad_id → asset resource_name map
    const adAssetMap: Record<string, string> = {}
    for (const row of rdaData.results ?? []) {
      const ad  = row.adGroupAd?.ad ?? {}
      const rda = ad.responsiveDisplayAd ?? {}
      const images = rda.marketingImages ?? rda.squareMarketingImages ?? []
      if (images[0]?.asset) adAssetMap[String(ad.id)] = images[0].asset
    }

    if (!Object.keys(adAssetMap).length) return

    // Fetch asset image URLs
    const assetQuery = `
      SELECT asset.resource_name, asset.image_asset.full_size.url
      FROM asset
      WHERE asset.type = 'IMAGE'
      LIMIT 500
    `
    const assetRes  = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ query: assetQuery }), cache: 'no-store' })
    const assetData = await assetRes.json()

    const assetUrlMap: Record<string, string> = {}
    for (const row of assetData.results ?? []) {
      const asset = row.asset ?? {}
      const rn    = asset.resourceName ?? ''
      const url   = asset.imageAsset?.fullSize?.url ?? ''
      if (rn && url) assetUrlMap[rn] = url
    }

    for (const ad of ads) {
      if (!ad.imageUrl && adAssetMap[ad.id]) {
        const rn = adAssetMap[ad.id]
        if (assetUrlMap[rn]) ad.imageUrl = assetUrlMap[rn]
      }
    }
  } catch (err) {
    console.warn('[Google] Could not backfill RDA images:', err)
  }
}
