import type { Ad } from './types'

const SA_URL = 'https://api.stackadapt.com/graphql'

// StackAdapt channelType strings → human-readable labels.
// channelType is a field on the native ad node (e.g. "native", "display", "video", "audio").
// Unknown values are title-cased and shown as-is so new channel types surface automatically.
function saChannelLabel(channelType: string | undefined): string | undefined {
  if (!channelType) return undefined
  const map: Record<string, string> = {
    native:        'Native',
    display:       'Display',
    video:         'Video',
    audio:         'Audio',
    connected_tv:  'CTV',
    ctv:           'CTV',
    in_game:       'In-Game',
    digital_out_of_home: 'DOOH',
    dooh:          'DOOH',
  }
  return map[channelType.toLowerCase()] ??
    channelType.charAt(0).toUpperCase() + channelType.slice(1).toLowerCase()
}

async function gql(apiKey: string, query: string) {
  const res = await fetch(SA_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  })
  return res.json()
}

export async function fetchStackAdaptAds(creds: { apiKey: string; advertiserId?: string }): Promise<Ad[]> {
  const apiKey = creds.apiKey
  if (!apiKey) {
    console.warn('[StackAdapt] Missing apiKey')
    return []
  }

  // First: introspect to find available top-level query fields
  const introspect = `{
    __schema {
      queryType {
        fields { name }
      }
    }
  }`

  try {
    const schema = await gql(apiKey, introspect)
    const fields: string[] = (schema?.data?.__schema?.queryType?.fields ?? [])
      .map((f: { name: string }) => f.name)

    console.log('[StackAdapt] Available queries:', fields.join(', '))

    // Pick the right query based on what's available
    if (fields.includes('nativeLineItems')) {
      return await queryNativeLineItems(apiKey)
    } else if (fields.includes('lineItems')) {
      return await queryLineItems(apiKey)
    } else if (fields.includes('nativeAds')) {
      return await queryNativeAds(apiKey)
    } else if (fields.includes('ads')) {
      return await queryAds(apiKey, creds.advertiserId)
    } else {
      console.error('[StackAdapt] No known query field found. Available:', fields.join(', '))
      return []
    }
  } catch (err) {
    console.error('[StackAdapt] Failed:', err)
    return []
  }
}

async function queryNativeLineItems(apiKey: string): Promise<Ad[]> {
  const data = await gql(apiKey, `{
    nativeLineItems {
      id name status
      imageUrl: image_url
    }
  }`)
  return parseFlat(data?.data?.nativeLineItems)
}

async function queryLineItems(apiKey: string): Promise<Ad[]> {
  const data = await gql(apiKey, `{
    lineItems {
      id name status
      imageUrl: image_url
    }
  }`)
  return parseFlat(data?.data?.lineItems)
}

async function queryNativeAds(apiKey: string): Promise<Ad[]> {
  const data = await gql(apiKey, `{
    nativeAds {
      id name status
      imageUrl: image_url
    }
  }`)
  return parseFlat(data?.data?.nativeAds)
}

async function queryAds(apiKey: string, advertiserId?: string): Promise<Ad[]> {
  // ── Step 1: discover ad __typename + delivery args + DateRangeInput fields ────
  const discoveryRes = await gql(apiKey, `{
    campaigns(first: 1) {
      nodes { ads(first: 1) { nodes { __typename } } }
    }
    queryType: __type(name: "Query") {
      fields { name args { name } }
    }
    dateRangeType: __type(name: "DateRangeInput") {
      inputFields { name }
    }
    deliveryPayloadType: __type(name: "CampaignDeliveryPayload") {
      fields { name }
    }
  }`)
  const adTypeName: string =
    discoveryRes?.data?.campaigns?.nodes?.[0]?.ads?.nodes?.[0]?.__typename ?? 'DisplayAd'
  console.log('[StackAdapt] ad __typename:', adTypeName)

  // Find what args campaignDelivery actually accepts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFields: any[] = discoveryRes?.data?.queryType?.fields ?? []
  const deliveryField = queryFields.find((f: any) => f.name === 'campaignDelivery')
  const deliveryArgNames: string[] = (deliveryField?.args ?? []).map((a: any) => a.name)
  console.log('[StackAdapt] campaignDelivery args:', deliveryArgNames.join(', '))

  // Find the actual field names on DateRangeInput
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dateRangeFields: string[] = (discoveryRes?.data?.dateRangeType?.inputFields ?? []).map((f: any) => f.name)
  console.log('[StackAdapt] DateRangeInput fields:', dateRangeFields.join(', '))

  // Find fields on CampaignDeliveryPayload to build the right response selection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveryPayloadFields: string[] = (discoveryRes?.data?.deliveryPayloadType?.fields ?? []).map((f: any) => f.name)
  console.log('[StackAdapt] CampaignDeliveryPayload fields:', deliveryPayloadFields.join(', '))

  // ── Step 2: introspect the concrete ad type for creative connection type ──────
  const adTypeRes = await gql(apiKey, `{
    adType: __type(name: "${adTypeName}") {
      fields {
        name
        type { name kind ofType { name kind ofType { name } } }
      }
    }
  }`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adTypeFields: any[] = adTypeRes?.data?.adType?.fields ?? []

  // Find the creativesConnection return type name
  const creativesConnField = adTypeFields.find((f: any) => f.name === 'creativesConnection')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function unwrapTypeName(t: any): string | null {
    if (!t) return null
    if (t.name) return t.name
    return unwrapTypeName(t.ofType)
  }
  const creativeConnectionTypeName = unwrapTypeName(creativesConnField?.type)
  console.log('[StackAdapt] creativesConnection type:', creativeConnectionTypeName)

  // Derive node type name from connection type (DisplayCreativeConnection → DisplayCreative)
  // Then introspect that type directly for image fields.
  let creativeImgField: string | null = null
  if (creativeConnectionTypeName) {
    const nodeTypeName = creativeConnectionTypeName.replace(/Connection$/, '')
    console.log('[StackAdapt] creative node type:', nodeTypeName)
    const nodeRes = await gql(apiKey, `{ __type(name: "${nodeTypeName}") { fields { name } } }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeFields: string[] = (nodeRes?.data?.__type?.fields ?? []).map((f: any) => f.name)
    console.log('[StackAdapt] creative node fields:', nodeFields.join(', '))
    creativeImgField = ['imageUrl', 'image_url', 'url', 'mediaUrl', 'thumbnailUrl', 'previewUrl']
      .find(f => nodeFields.includes(f)) ?? null
    console.log('[StackAdapt] creative image field:', creativeImgField)
  }

  const creativesSelection = creativeImgField
    ? `\n            creativesConnection { nodes { ${creativeImgField} } }`
    : ''

  // ── Step 3: get this month's spending campaign IDs ────────────────────────────
  const now = new Date()
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().slice(0, 10)
  let spendingCampaignIds: Set<string> | null = null

  // Build the date range and response selection dynamically from introspected field names
  const startKey    = dateRangeFields.find(f => ['startDate', 'start', 'from', 'dateFrom'].includes(f)) ?? 'startDate'
  const endKey      = dateRangeFields.find(f => ['endDate', 'end', 'to', 'dateTo'].includes(f)) ?? 'endDate'
  const campIdField = deliveryPayloadFields.find(f => /campaign/i.test(f) && /id/i.test(f)) ?? 'campaignId'
  const spendField  = deliveryPayloadFields.find(f => /spend|cost|impressions/i.test(f)) ?? 'spend'
  console.log('[StackAdapt] delivery fields to fetch:', campIdField, spendField)

  if (deliveryPayloadFields.length > 0) {
    try {
      const deliveryRes = await gql(apiKey, `{
        campaignDelivery(
          date: { ${startKey}: "${startOfMonth}", ${endKey}: "${today}" }
          granularity: TOTAL
        ) {
          ${campIdField}
          ${spendField}
        }
      }`)
      if (!deliveryRes?.errors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = deliveryRes?.data?.campaignDelivery ?? []
        spendingCampaignIds = new Set(
          rows.filter((r: any) => (r[spendField] ?? 0) > 0).map((r: any) => String(r[campIdField]))
        )
        console.log(`[StackAdapt] campaigns with spend this month: ${spendingCampaignIds.size}`)
      } else {
        console.warn('[StackAdapt] campaignDelivery error:', JSON.stringify(deliveryRes.errors).slice(0, 300))
      }
    } catch (e) {
      console.warn('[StackAdapt] campaignDelivery threw:', e)
    }
  } else {
    console.warn('[StackAdapt] CampaignDeliveryPayload has no fields — skipping spend filter')
  }

  // ── Step 4: fetch campaigns + ads ────────────────────────────────────────────
  const probe = await gql(apiKey, `{
    campaigns(first: 100) {
      nodes {
        id name isArchived isDraft
        advertiser { id }
        ads(first: 200) {
          nodes {
            id name brandname channelType clickUrl creativeSize
            paused isArchived isDraft isRejected${creativesSelection}
          }
        }
      }
    }
  }`)

  if (probe?.errors) {
    const errStr = JSON.stringify(probe.errors).slice(0, 600)
    const isTokenInvalid = /access token is invalid|unauthor|forbidden/i.test(errStr)
    if (isTokenInvalid) {
      console.error('[StackAdapt] Token too narrow — regenerate with full read scope.')
    } else {
      console.error('[StackAdapt] campaigns->ads errors:', errStr)
    }
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCampaigns: any[] = probe?.data?.campaigns?.nodes ?? []

  // Log sample advertiser IDs so we can verify the configured advertiserId is correct
  const sampleAdvertiserIds = [...new Set(allCampaigns.slice(0, 10).map((c: any) => String(c.advertiser?.id)))]
  console.log('[StackAdapt] sample advertiser IDs:', sampleAdvertiserIds.join(', '), '| configured:', advertiserId ?? 'none')

  // Keep only campaigns that are:
  // 1. Not archived/draft
  // 2. Belong to this client's advertiser (if advertiserId configured)
  // 3. Had spend this month (if delivery data available)
  const campaigns = allCampaigns.filter(c => {
    if (c.isArchived !== false || c.isDraft !== false) return false
    if (advertiserId && String(c.advertiser?.id) !== String(advertiserId)) return false
    if (spendingCampaignIds !== null && !spendingCampaignIds.has(String(c.id))) return false
    return true
  })
  console.log(`[StackAdapt] campaigns: ${allCampaigns.length} total, ${campaigns.length} for this advertiser+spending`)

  const adsFieldOnCampaign = 'ads'

  const allAds: Ad[] = []
  for (const camp of campaigns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adNodes: any[] = camp?.[adsFieldOnCampaign]?.nodes ?? []

    for (const n of adNodes) {
      if (n.paused !== false) continue
      if (n.isArchived === true) continue
      if (n.isDraft === true) continue
      if (n.isRejected === true) continue

      allAds.push({
        id:       String(n.id ?? ''),
        name:     n.name || n.brandname || 'Unnamed',
        status:   'ACTIVE',
        imageUrl: (creativeImgField ? n?.creativesConnection?.nodes?.[0]?.[creativeImgField] : null) || '',
        headline: n.brandname || '',
        campaign: camp.name || '',
        channel:  saChannelLabel(n.channelType),
      })
    }
  }

  console.log(`[StackAdapt] active ads total: ${allAds.length}`)
  return allAds
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFlat(raw: any): Ad[] {
  if (!raw) return []
  const items = Array.isArray(raw) ? raw : (raw.nodes ?? raw.edges ?? [])
  return items.map((item: Record<string, string>) => ({
    id:       String(item.id ?? ''),
    name:     item.name || 'Unnamed',
    status:   (item.status ?? 'ACTIVE').toUpperCase(),
    imageUrl: item.imageUrl || item.image_url || item.imageURL || '',
    headline: '',
    campaign: '',
  }))
}
