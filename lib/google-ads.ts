import type { Ad } from './types'

// Cache the working API version in module scope so we only probe once per cold start
let cachedApiVersion: string | null = null

/**
 * Probe Google Ads API to find a supported version. Tries newest-to-oldest using
 * `listAccessibleCustomers` (no customer ID required, fast to hit).
 * Caches the result for the lifetime of the warm container.
 */
async function findWorkingApiVersion(
  developerToken: string,
  accessToken: string,
): Promise<string | null> {
  if (cachedApiVersion) return cachedApiVersion
  if (process.env.GOOGLE_ADS_API_VERSION) {
    cachedApiVersion = process.env.GOOGLE_ADS_API_VERSION
    return cachedApiVersion
  }

  // Try newest first. Google supports ~4 versions at a time, sunsets every ~9 months.
  const versions = ['v25', 'v24', 'v23', 'v22', 'v21', 'v20', 'v19', 'v18', 'v17']

  for (const v of versions) {
    try {
      const res = await fetch(
        `https://googleads.googleapis.com/${v}/customers:listAccessibleCustomers`,
        {
          method: 'GET',
          headers: {
            Authorization:    `Bearer ${accessToken}`,
            'developer-token': developerToken,
          },
          cache: 'no-store',
        },
      )
      // 200 = works. 401/403 = auth issue but version is valid. 404 = version gone.
      if (res.status !== 404) {
        console.info(`[Google] Working API version: ${v} (probe status ${res.status})`)
        cachedApiVersion = v
        return v
      }
    } catch (err) {
      console.warn(`[Google] Probe error on ${v}:`, err)
    }
  }

  console.error('[Google] No working API version found in v17-v25')
  return null
}

async function getAccessToken(): Promise<string> {
  // Trim env vars — copy/paste from cloud console often picks up trailing whitespace/newlines
  const clientId     = (process.env.GOOGLE_CLIENT_ID     ?? '').trim()
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim()
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN ?? '').trim()

  // Pre-flight check so we know which var is missing instead of guessing from a 400
  const missing: string[] = []
  if (!clientId)     missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
  if (!refreshToken) missing.push('GOOGLE_REFRESH_TOKEN')
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }

  // Lightweight fingerprint logging — confirms which client/refresh token is actually in use
  // without leaking secrets. Helps catch "I updated Vercel but the deploy is using the old value"
  console.info('[Google] Token request', {
    clientIdSuffix:     clientId.slice(-12),
    clientSecretLength: clientSecret.length,
    refreshTokenSuffix: refreshToken.slice(-6),
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
    cache: 'no-store',
  })

  const rawBody = await res.text()
  let data: any = {}
  try { data = JSON.parse(rawBody) } catch { /* non-JSON body */ }

  if (!res.ok || !data.access_token) {
    // Surface Google's actual reason instead of generic "Bad Request"
    const reason = data.error || 'unknown_error'
    const desc   = data.error_description || rawBody || 'no body'
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${reason} — ${desc}`)
  }

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

  // Discover the currently supported API version (versions sunset every ~9 months)
  const apiVersion = await findWorkingApiVersion(devToken, accessToken)
  if (!apiVersion) {
    console.error('[Google] Could not find a working API version — aborting')
    return []
  }
  const baseUrl = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`
  console.info(`[Google] hitting ${apiVersion}, customer prefix: ${customerId.slice(0, 3)}***`)

  // Query ENABLED ads only — paused ads excluded at the source
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      ad_group_ad.ad.image_ad.image_url,
      ad_group_ad.ad.responsive_display_ad.headlines,
      ad_group_ad.ad.responsive_display_ad.descriptions,
      ad_group_ad.ad.responsive_display_ad.long_headline,
      ad_group_ad.ad.expanded_text_ad.headline_part1,
      ad_group_ad.ad.expanded_text_ad.headline_part2,
      ad_group_ad.ad.expanded_text_ad.headline_part3,
      ad_group_ad.ad.expanded_text_ad.description,
      ad_group_ad.ad.expanded_text_ad.description2,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      campaign.name
    FROM ad_group_ad
    WHERE ad_group_ad.status = 'ENABLED'
    LIMIT 500
  `

  const ads: Ad[] = []
  try {
    // Paginate the main query — `searchStream` would be more efficient but `:search`
    // requires explicit pageToken handling for >ONE page of results.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allRows: any[] = []
    let pageToken: string | undefined
    let pageCount = 0
    do {
      const body = pageToken ? { query, pageToken } : { query }
      const res     = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' })
      const rawBody = await res.text()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {}
      try {
        data = JSON.parse(rawBody)
      } catch {
        console.error(`[Google] Non-JSON response (HTTP ${res.status}). First 300 chars:`, rawBody.slice(0, 300))
        return []
      }

      if (data.error) {
        console.error(`[Google] API error (HTTP ${res.status}):`, JSON.stringify(data.error).slice(0, 600))
        return []
      }

      for (const r of data.results ?? []) allRows.push(r)
      pageToken = data.nextPageToken
      pageCount++
    } while (pageToken && pageCount < 20) // safety cap

    console.log(`[Google] main query: ${allRows.length} rows across ${pageCount} page(s)`)

    // Re-bind into the same name the legacy loop below uses
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: { results: any[] } = { results: allRows }

    // ─── Second query: which ads have spend this month? ───
    // GAQL has no HAVING clause, so we run a separate query for ads with cost > 0
    // this month and intersect IDs.
    const spendQuery = `
      SELECT
        ad_group_ad.ad.id,
        metrics.cost_micros
      FROM ad_group_ad
      WHERE segments.date DURING THIS_MONTH
        AND ad_group_ad.status = 'ENABLED'
        AND metrics.cost_micros > 0
      LIMIT 10000
    `
    const spendingAdIds = new Set<string>()
    try {
      const spendRes  = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify({ query: spendQuery }), cache: 'no-store' })
      const spendData = await spendRes.json()
      for (const row of spendData.results ?? []) {
        const id = row.adGroupAd?.ad?.id
        if (id) spendingAdIds.add(String(id))
      }
      console.log(`[Google] ads with spend this month: ${spendingAdIds.size}`)
    } catch (err) {
      console.warn('[Google] spend query failed (still showing all ENABLED):', err)
    }

    // Track per-type counts so we can see WHAT's in the account (search vs display vs PMax-related)
    const typeCounts: Record<string, number> = {}
    let filteredBySpend = 0

    for (const row of data.results ?? []) {
      const aga      = row.adGroupAd ?? {}
      const ad       = aga.ad       ?? {}
      const rawType  = ad.type      ?? 'UNKNOWN'
      typeCounts[rawType] = (typeCounts[rawType] ?? 0) + 1

      // Filter: only show ads that had spend this month
      // (If spend query failed entirely, spendingAdIds is empty — fall back to showing all)
      if (spendingAdIds.size > 0 && !spendingAdIds.has(String(ad.id ?? ''))) {
        filteredBySpend++
        continue
      }
      const adType   = ad.type      ?? ''
      const status   = (aga.status  ?? 'UNKNOWN').toUpperCase()
      const campaign = row.campaign?.name ?? ''

      let imageUrl = ''
      let headlines: string[] = []
      let descriptions: string[] = []

      if (adType === 'IMAGE_AD') {
        imageUrl = ad.imageAd?.imageUrl ?? ''
      } else if (adType === 'RESPONSIVE_DISPLAY_AD') {
        const rda = ad.responsiveDisplayAd ?? {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        headlines = (rda.headlines ?? []).map((h: any) => h?.text).filter(Boolean)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descriptions = (rda.descriptions ?? []).map((d: any) => d?.text).filter(Boolean)
        if (rda.longHeadline?.text) headlines.unshift(rda.longHeadline.text)
      } else if (adType === 'EXPANDED_TEXT_AD') {
        const eta = ad.expandedTextAd ?? {}
        headlines = [eta.headlinePart1, eta.headlinePart2, eta.headlinePart3].filter(Boolean) as string[]
        descriptions = [eta.description, eta.description2].filter(Boolean) as string[]
      } else if (adType === 'RESPONSIVE_SEARCH_AD') {
        const rsa = ad.responsiveSearchAd ?? {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        headlines = (rsa.headlines ?? []).map((h: any) => h?.text).filter(Boolean)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descriptions = (rsa.descriptions ?? []).map((d: any) => d?.text).filter(Boolean)
      }

      ads.push({
        id:       String(ad.id ?? ''),
        name:     ad.name || campaign || 'Unnamed Ad',
        status,
        imageUrl,
        headline: headlines[0] ?? '',
        headlines: headlines.length ? headlines : undefined,
        descriptions: descriptions.length ? descriptions : undefined,
        campaign,
        adType,
      })
    }

    console.log('[Google] ad type breakdown:', JSON.stringify(typeCounts))
    console.log(`[Google] filtered out by spend-this-month: ${filteredBySpend}`)
    console.log(`[Google] final ads shown: ${ads.length}`)
    console.log(`[Google] NOTE: Performance Max ads live in asset_group, not ad_group_ad — they will NOT appear here without separate PMax support`)

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
