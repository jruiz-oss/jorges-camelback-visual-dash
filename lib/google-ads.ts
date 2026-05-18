import type { Ad } from './types'

// Maps Google Ads ad type strings → human-readable channel labels shown in the
// platform header. Order here determines the display order when multiple channels
// are present (Search before Display before YouTube before PMax).
const AD_TYPE_CHANNEL: Record<string, string> = {
  RESPONSIVE_SEARCH_AD:  'Search',
  EXPANDED_TEXT_AD:      'Search',
  IMAGE_AD:              'Display',
  RESPONSIVE_DISPLAY_AD: 'Display',
  VIDEO_AD:              'YouTube',
  VIDEO_RESPONSIVE_AD:   'YouTube',
  PERFORMANCE_MAX:       'Performance Max',
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── GAQL paginated query helper ──────────────────────────────────────────────
// Centralizes pageToken handling + JSON-parse errors so callers stay tidy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runGaql(baseUrl: string, headers: Record<string, string>, query: string): Promise<any[]> {
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
      return allRows
    }

    if (data.error) {
      console.error(`[Google] API error (HTTP ${res.status}):`, JSON.stringify(data.error).slice(0, 600))
      return allRows
    }

    for (const r of data.results ?? []) allRows.push(r)
    pageToken = data.nextPageToken
    pageCount++
  } while (pageToken && pageCount < 40) // safety cap

  return allRows
}

// Split an array of IDs into IN-clause-safe chunks. GAQL doesn't document a
// hard limit on IN-list size, but ~500 keeps the URL/body well within sane bounds.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── Step 1: which ad_group_ad ads spent this month? ──────────────────────────
async function fetchSpendingAdIds(baseUrl: string, headers: Record<string, string>): Promise<string[]> {
  const spendQuery = `
    SELECT ad_group_ad.ad.id, metrics.cost_micros
    FROM ad_group_ad
    WHERE segments.date DURING THIS_MONTH
      AND ad_group_ad.status = 'ENABLED'
      AND metrics.cost_micros > 0
  `
  const rows = await runGaql(baseUrl, headers, spendQuery)
  const ids = new Set<string>()
  for (const row of rows) {
    const id = row.adGroupAd?.ad?.id
    if (id) ids.add(String(id))
  }
  console.log(`[Google] ads with spend this month: ${ids.size}`)
  return Array.from(ids)
}

// ─── Step 2: detail query for those IDs ───────────────────────────────────────
async function fetchAdDetails(
  baseUrl: string,
  headers: Record<string, string>,
  ids: string[],
): Promise<Ad[]> {
  if (!ids.length) return []

  const ads: Ad[] = []
  const typeCounts: Record<string, number> = {}

  for (const slice of chunk(ids, 500)) {
    const idList = slice.map(id => `'${id}'`).join(', ')
    const query = `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.status,
        ad_group_ad.ad.final_urls,
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
      WHERE ad_group_ad.ad.id IN (${idList})
    `

    const rows = await runGaql(baseUrl, headers, query)

    for (const row of rows) {
      const aga      = row.adGroupAd ?? {}
      const ad       = aga.ad       ?? {}
      const adType   = ad.type      ?? 'UNKNOWN'
      const status   = (aga.status  ?? 'UNKNOWN').toUpperCase()
      const campaign = row.campaign?.name ?? ''
      typeCounts[adType] = (typeCounts[adType] ?? 0) + 1

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

      // Extract the landing page path from final_urls[0].
      // Strip trailing slash; skip root-only paths ("/").
      let destinationUrl: string | undefined
      const rawFinalUrl: string = (ad.finalUrls ?? [])[0] ?? ''
      if (rawFinalUrl) {
        try {
          const path = new URL(rawFinalUrl).pathname.replace(/\/$/, '')
          if (path) destinationUrl = path
        } catch { /* unparseable — skip */ }
      }

      ads.push({
        id:             String(ad.id ?? ''),
        name:           ad.name || campaign || 'Unnamed Ad',
        status,
        imageUrl,
        headline:       headlines[0] ?? '',
        headlines:      headlines.length    ? headlines    : undefined,
        descriptions:   descriptions.length ? descriptions : undefined,
        campaign,
        adType,
        channel:        AD_TYPE_CHANNEL[adType],
        destinationUrl,
      })
    }
  }

  console.log('[Google] ad type breakdown (spending ads):', JSON.stringify(typeCounts))
  console.log(`[Google] ad_group_ad ads shown: ${ads.length}`)
  return ads
}

// ─── Public entry point ───────────────────────────────────────────────────────
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

  const ads: Ad[] = []
  try {
    const spendingIds = await fetchSpendingAdIds(baseUrl, headers)
    const detailAds   = await fetchAdDetails(baseUrl, headers, spendingIds)
    ads.push(...detailAds)
    // Backfill image URLs for responsive display ads (which don't include them inline)
    await backfillRdaImages(ads, baseUrl, headers)
  } catch (err) {
    console.error('[Google] ad_group_ad fetch failed:', err)
  }

  // ─── Performance Max asset groups (separate schema entirely) ───
  try {
    const pmaxAds = await fetchPmaxAssetGroups(baseUrl, headers)
    console.log(`[Google] PMax asset groups shown: ${pmaxAds.length}`)
    ads.push(...pmaxAds)
  } catch (err) {
    console.error('[Google] PMax fetch failed:', err)
  }

  console.log(`[Google] total ads shown (ad_group_ad + PMax): ${ads.length}`)
  return ads
}

// ─── Performance Max ──────────────────────────────────────────────────────────
// PMax campaigns don't have ads in `ad_group_ad`. Instead, each campaign has
// `asset_group`s, and each asset group has assets (images, headlines, descriptions).
// We render one card per asset group, aggregating its assets.
//
// Step 1 uses FROM campaign (not FROM asset_group) to find PMax campaigns with
// spend — campaign-level metrics are always reliably available in GAQL whereas
// asset_group-level metrics can silently return empty depending on API version.
// Step 2 queries FROM asset_group_asset filtered by those campaign IDs, which is
// the only resource that exposes asset content. Fallback: if no spending campaigns
// are found, show all ENABLED PMax campaigns so live ads are never invisible.
async function fetchPmaxAssetGroups(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<Ad[]> {
  // ── Step 1: find PMax campaign IDs via FROM campaign (reliable for metrics) ─
  const campaignIds = new Set<string>()

  const campaignSpendQuery = `
    SELECT campaign.id, metrics.cost_micros
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND campaign.status = 'ENABLED'
      AND segments.date DURING LAST_30_DAYS
      AND metrics.cost_micros > 0
  `
  const campaignRows = await runGaql(baseUrl, headers, campaignSpendQuery)
  for (const row of campaignRows) {
    const id = row.campaign?.id
    if (id) campaignIds.add(String(id))
  }
  console.log(`[Google PMax] campaigns with spend LAST_30_DAYS: ${campaignIds.size}`)

  // Fallback — all ENABLED PMax campaigns regardless of spend
  if (!campaignIds.size) {
    console.warn('[Google PMax] No spending campaigns — falling back to all ENABLED PMax campaigns')
    const enabledQuery = `
      SELECT campaign.id
      FROM campaign
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
        AND campaign.status = 'ENABLED'
    `
    const enabledRows = await runGaql(baseUrl, headers, enabledQuery)
    for (const row of enabledRows) {
      const id = row.campaign?.id
      if (id) campaignIds.add(String(id))
    }
    console.log(`[Google PMax] ENABLED campaign fallback: ${campaignIds.size}`)
    if (!campaignIds.size) return []
  }

  // ── Step 2: pull assets for those campaigns via FROM asset_group_asset ──────
  const campaignIdList = Array.from(campaignIds).map(id => `'${id}'`).join(', ')
  const query = `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.final_urls,
      asset_group.final_url_expansion_opt_out,
      campaign.id,
      campaign.name,
      asset_group_asset.field_type,
      asset.id,
      asset.type,
      asset.image_asset.full_size.url,
      asset.text_asset.text,
      asset.youtube_video_asset.youtube_video_id
    FROM asset_group_asset
    WHERE campaign.id IN (${campaignIdList})
      AND asset_group.status = 'ENABLED'
      AND asset_group_asset.status = 'ENABLED'
  `
  const allRows = await runGaql(baseUrl, headers, query)
  console.log(`[Google PMax] asset rows: ${allRows.length}`)

  // Step 3: aggregate by asset_group
  type Bucket = {
    id: string
    name: string
    campaign: string
    imageUrl: string
    imageUrls: string[]
    headlines: string[]
    descriptions: string[]
    destinationUrl?: string
  }
  const buckets = new Map<string, Bucket>()

  for (const row of allRows) {
    const ag    = row.assetGroup     ?? {}
    const camp  = row.campaign       ?? {}
    const aga   = row.assetGroupAsset ?? {}
    const asset = row.asset          ?? {}
    const agId  = String(ag.id ?? '')
    if (!agId) continue

    if (!buckets.has(agId)) {
      // Extract landing page path from asset_group.final_urls[0].
      // If the URL is root-only, fall back to hostname so the chip shows the
      // real domain rather than nothing. Log what we find for diagnostics.
      let pmaxDestUrl: string | undefined
      const pmaxRawUrl: string = (ag.finalUrls ?? [])[0] ?? ''
      const urlExpansion: boolean = ag.finalUrlExpansionOptOut === false
      if (pmaxRawUrl) {
        try {
          const parsed = new URL(pmaxRawUrl)
          const path   = parsed.pathname.replace(/\/$/, '')
          pmaxDestUrl  = path || parsed.hostname.replace(/^www\./, '')
        } catch { /* unparseable — skip */ }
      }
      console.log(
        `[Google PMax] URL for "${ag.name ?? agId}": ` +
        `final_urls[0]=${pmaxRawUrl || '—'} → ${pmaxDestUrl ?? 'none'} ` +
        `(url_expansion=${urlExpansion ? 'ON' : 'OFF'})`
      )
      buckets.set(agId, {
        id: agId,
        name: ag.name || 'PMax Asset Group',
        campaign: camp.name || '',
        imageUrl: '',
        imageUrls: [],
        headlines: [],
        descriptions: [],
        destinationUrl: pmaxDestUrl,
      })
    }
    const b = buckets.get(agId)!

    const fieldType = aga.fieldType ?? ''
    const text  = asset.textAsset?.text ?? ''
    const image = asset.imageAsset?.fullSize?.url ?? ''

    if (fieldType === 'HEADLINE' || fieldType === 'LONG_HEADLINE') {
      if (text && !b.headlines.includes(text)) b.headlines.push(text)
    } else if (fieldType === 'DESCRIPTION') {
      if (text && !b.descriptions.includes(text)) b.descriptions.push(text)
    } else if (
      fieldType === 'MARKETING_IMAGE' ||
      fieldType === 'SQUARE_MARKETING_IMAGE' ||
      fieldType === 'LANDSCAPE_LOGO' ||
      fieldType === 'PORTRAIT_MARKETING_IMAGE' ||
      fieldType === 'LOGO'
    ) {
      // Capture ALL images (deduped), not just first — UI will explode into cards
      if (image && !b.imageUrls.includes(image)) {
        b.imageUrls.push(image)
        if (!b.imageUrl) b.imageUrl = image
      }
    }
  }

  // Step 4: convert buckets → Ad[]
  const out: Ad[] = []
  for (const b of Array.from(buckets.values())) {
    out.push({
      id:             `pmax-${b.id}`,
      name:           b.name,
      status:         'ACTIVE',
      imageUrl:       b.imageUrl,
      imageUrls:      b.imageUrls.length ? b.imageUrls : undefined,
      headline:       b.headlines[0] ?? '',
      headlines:      b.headlines.length    ? b.headlines    : undefined,
      descriptions:   b.descriptions.length ? b.descriptions : undefined,
      campaign:       b.campaign,
      adType:         'PERFORMANCE_MAX',
      channel:        'Performance Max',
      destinationUrl: b.destinationUrl,
    })
  }
  return out
}

// ─── Card explosion ───────────────────────────────────────────────────────────
// Each ad can have many headlines, descriptions, and images. The UI shows one
// of each per card. Goal per user: every unique headline + every unique
// description appears at least once. We make N cards where N = the longest list.
// Shorter lists cycle. Resulting count: ~max(headlines, descriptions, images).
export function explodeAd(ad: Ad): Ad[] {
  const headlines    = Array.from(new Set((ad.headlines    ?? (ad.headline ? [ad.headline] : [])).filter(Boolean)))
  const descriptions = Array.from(new Set((ad.descriptions ?? []).filter(Boolean)))
  const images       = Array.from(new Set((ad.imageUrls    ?? (ad.imageUrl ? [ad.imageUrl] : [])).filter(Boolean)))

  const count = Math.max(1, headlines.length, descriptions.length, images.length)
  if (count <= 1) return [ad]

  const cards: Ad[] = []
  for (let i = 0; i < count; i++) {
    cards.push({
      ...ad,
      id:           `${ad.id}-${i}`,
      headline:     headlines.length    ? headlines[i % headlines.length]       : '',
      headlines:    undefined,
      descriptions: descriptions.length ? [descriptions[i % descriptions.length]] : undefined,
      imageUrl:     images.length       ? images[i % images.length]              : '',
      imageUrls:    undefined,
    })
  }
  return cards
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
    const rdaRows = await runGaql(baseUrl, headers, rdaQuery)

    // Build ad_id → asset resource_name map
    const adAssetMap: Record<string, string> = {}
    for (const row of rdaRows) {
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
    const assetRows = await runGaql(baseUrl, headers, assetQuery)

    const assetUrlMap: Record<string, string> = {}
    for (const row of assetRows) {
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
