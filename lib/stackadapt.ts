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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// StackAdapt enforces a cost-based rate limit (the `campaigns` query alone costs
// ~20k of a 40k budget, restoring 8k/s). When throttled the API returns the
// number of seconds to wait under extensions.cost.throttle.retryAfterInSeconds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rateLimitWaitMs(res: any): number | null {
  const errs = res?.errors
  if (!Array.isArray(errs)) return null
  const hit = errs.find((e: any) => /rate limit/i.test(e?.message ?? ''))
  if (!hit) return null
  const secs = hit?.extensions?.cost?.throttle?.retryAfterInSeconds
  return Math.max(1, Number(secs) || 3) * 1000
}

// The creative image plan (which inline fragments + fields hold the URL) is a
// function of the schema, not the data, so discover it once per API key and
// cache it across requests. This avoids re-running introspection — and the old
// per-request data-probes — on every page render, which was burning the rate
// limit budget and intermittently starving the main campaigns query.
type CreativeImagePlan = { selection: string; paths: string[][] }
const creativePlanCache = new Map<string, CreativeImagePlan>()

// Discover how to select a creative's image URL. DisplayCreative is a UNION
// (ImageCreative | Tag), so its fields live on concrete member types reachable
// only via inline fragments. Introspect each member, find image/URL fields, and
// build an inline-fragment selection plus the JS paths to read the value back.
// Introspection-only (no data queries) so it's cheap and rate-limit friendly.
async function discoverCreativeImagePlan(apiKey: string, connectionTypeName: string | null): Promise<CreativeImagePlan> {
  const imgNameRegex = /(image|img|photo|thumb|preview|banner|media|logo|icon|asset|cover|picture|graphic)/i
  const urlScalarRegex = /(url|src|uri|href|path|source)/i
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrapTypeName = (t: any): string | null => (t ? (t.name ?? unwrapTypeName(t.ofType)) : null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrapKind = (t: any): string | null =>
    !t ? null : (t.kind && t.kind !== 'NON_NULL' && t.kind !== 'LIST' ? t.kind : unwrapKind(t.ofType))

  // Resolve the node type name from the connection's `nodes` field.
  let nodeTypeName = 'DisplayCreative'
  if (connectionTypeName) {
    const connRes = await gql(apiKey, `{ t: __type(name: "${connectionTypeName}") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodesField = (connRes?.data?.t?.fields ?? []).find((f: any) => f.name === 'nodes')
    nodeTypeName = unwrapTypeName(nodesField?.type) ?? nodeTypeName
  }

  // If the node type is a UNION/INTERFACE, the image fields live on its members.
  const typeRes = await gql(apiKey, `{ t: __type(name: "${nodeTypeName}") { kind possibleTypes { name } } }`)
  const kind = typeRes?.data?.t?.kind
  const concreteTypes: string[] = (kind === 'UNION' || kind === 'INTERFACE')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (typeRes?.data?.t?.possibleTypes ?? []).map((p: any) => p.name)
    : [nodeTypeName]
  console.log('[StackAdapt] creative concrete types:', concreteTypes.join(', ') || '(none)')

  const fragments: string[] = []
  const paths: string[][] = []
  for (const typeName of concreteTypes) {
    const fr = await gql(apiKey, `{ t: __type(name: "${typeName}") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: any[] = fr?.data?.t?.fields ?? []
    const inner: string[] = []
    for (const f of fields) {
      if (!imgNameRegex.test(f.name)) continue
      const k = unwrapKind(f.type)
      if (k === 'SCALAR') {
        inner.push(f.name); paths.push([f.name])
      } else if (k === 'OBJECT') {
        const sub = unwrapTypeName(f.type)
        if (!sub) continue
        const sr = await gql(apiKey, `{ t: __type(name: "${sub}") { fields { name type { name kind ofType { name kind } } } } }`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const urlSub = (sr?.data?.t?.fields ?? []).find((s: any) => urlScalarRegex.test(s.name) && unwrapKind(s.type) === 'SCALAR')
        if (urlSub) { inner.push(`${f.name} { ${urlSub.name} }`); paths.push([f.name, urlSub.name]) }
      }
    }
    console.log(`[StackAdapt] ${typeName} image fields:`, inner.join(' | ') || '(none)')
    if (inner.length) fragments.push(`... on ${typeName} { ${inner.join(' ')} }`)
  }

  const selection = fragments.length
    ? `\n            creativesConnection { nodes { __typename ${fragments.join(' ')} } }`
    : ''
  return { selection, paths }
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

  // ── Step 3: resolve the creative image selection (cached per API key) ────────
  // DisplayCreative is a UNION (ImageCreative | Tag); image fields live on the
  // concrete members and are reachable only via inline fragments. The plan
  // (fragment selection + read paths) depends on the schema, not the data, so
  // discover it once per API key — keeps the rate-limit budget for the real query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readPath = (obj: any, path: string[]): any =>
    path.reduce((o, k) => (o == null ? o : o[k]), obj)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const looksLikeUrl = (v: any): boolean => typeof v === 'string' && /^https?:\/\//i.test(v)

  let plan = creativePlanCache.get(apiKey)
  if (!plan) {
    plan = await discoverCreativeImagePlan(apiKey, creativeConnectionTypeName)
    creativePlanCache.set(apiKey, plan)
  }
  const creativeImagePaths = plan.paths
  const creativesSelection = plan.selection
  if (!creativesSelection) console.log('[StackAdapt] no creative image selection — images will be blank')

  // ── Step 3b: list ALL advertisers in the account ─────────────────────────────
  // The campaign-derived map below only sees advertisers present in the first 100
  // campaigns, so a client whose campaigns fall outside that window never appears.
  // Query the top-level `advertisers` field directly so every advertiser ID is
  // logged — this is how you find a client's actual advertiser ID.
  const advRes = await gql(apiKey, `{
    advertisers(first: 200) { nodes { id name } }
  }`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAdvertisers: any[] = advRes?.data?.advertisers?.nodes ?? []
  if (allAdvertisers.length) {
    console.log('[StackAdapt] ALL advertisers in account:',
      allAdvertisers.map((a: any) => `${a.id}=${a.name}`).join(', '))
  } else if (advRes?.errors) {
    console.log('[StackAdapt] advertisers query errored:', JSON.stringify(advRes.errors).slice(0, 300))
  }

  // ── Step 4: fetch campaigns + ads (paginated) ────────────────────────────────
  // The account has 20+ advertisers sharing one API key, so a single
  // campaigns(first: 100) page rarely contains the target client's campaigns —
  // they sort outside the first page and the advertiser filter then matches 0.
  // Page through the whole connection (cursor-based) and accumulate, with a
  // safety cap so a huge account can't loop forever.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCampaigns: any[] = []
  let cursor: string | null = null
  const MAX_PAGES = 25 // 25 × 100 = 2500 campaigns ceiling
  pageLoop:
  for (let page = 0; page < MAX_PAGES; page++) {
    const afterArg: string = cursor ? `, after: "${cursor}"` : ''
    const query = `{
      campaigns(first: 100${afterArg}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id name isArchived isDraft
          advertiser { id name }
          campaignGroup { id name }
          ads(first: 200) {
            nodes {
              id name brandname channelType clickUrl creativeSize
              paused isArchived isDraft isRejected${creativesSelection}
            }
          }
        }
      }
    }`

    // Each page costs ~half the rate-limit budget, so a full account can get
    // throttled mid-pagination. When that happens StackAdapt tells us how long
    // to wait — honor it and retry the same page rather than returning partial
    // results (which would silently drop the target advertiser's campaigns).
    let probe: any
    for (let attempt = 0; attempt < 4; attempt++) {
      probe = await gql(apiKey, query)
      const waitMs = rateLimitWaitMs(probe)
      if (waitMs == null) break
      console.warn(`[StackAdapt] rate limited on page ${page}; waiting ${waitMs}ms (attempt ${attempt + 1})`)
      await sleep(waitMs)
    }

    if (probe?.errors) {
      const errStr = JSON.stringify(probe.errors).slice(0, 600)
      const isTokenInvalid = /access token is invalid|unauthor|forbidden/i.test(errStr)
      if (isTokenInvalid) {
        console.error('[StackAdapt] Token too narrow — regenerate with full read scope.')
      } else {
        console.error('[StackAdapt] campaigns->ads errors:', errStr)
      }
      // Return whatever we've gathered so far rather than dropping everything.
      break pageLoop
    }

    const conn = probe?.data?.campaigns
    allCampaigns.push(...(conn?.nodes ?? []))
    if (!conn?.pageInfo?.hasNextPage || !conn?.pageInfo?.endCursor) break
    cursor = conn.pageInfo.endCursor
  }

  // Keep only campaigns that are not archived/draft AND belong to this advertiser
  const campaigns = allCampaigns.filter(c => {
    if (c.isArchived !== false || c.isDraft !== false) return false
    if (advertiserId && String(c.advertiser?.id) !== String(advertiserId)) return false
    return true
  })
  console.log(`[StackAdapt] campaigns: ${allCampaigns.length} total, ${campaigns.length} for this advertiser`)

  const adsFieldOnCampaign = 'ads'

  // Resolve an ad's image URL by scanning its creatives for the first one whose
  // value (at any discovered fragment path) is an http(s) URL. A DisplayCreative
  // is either an ImageCreative (has the URL) or a Tag (HTML — no image), so some
  // creatives legitimately yield nothing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstImageUrl = (n: any): string => {
    if (!creativeImagePaths.length) return ''
    for (const cr of n?.creativesConnection?.nodes ?? []) {
      for (const path of creativeImagePaths) {
        const v = readPath(cr, path)
        if (looksLikeUrl(v)) return v
      }
    }
    return ''
  }

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
        imageUrl: firstImageUrl(n),
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
