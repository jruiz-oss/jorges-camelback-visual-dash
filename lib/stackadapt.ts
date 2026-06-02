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
type CreativeImagePlan = { selection: string; paths: string[][]; useEdges?: boolean }
// Bump PLAN_CACHE_V whenever the plan shape or discovery logic changes — forces
// warm Lambda instances to re-run discoverCreativeImagePlan rather than serving
// stale plans that may reference the wrong creative fragment types.
const PLAN_CACHE_V = 'v5'
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

  // Resolve the node type name. StackAdapt connections use the Relay `edges { node }`
  // pattern — none of them expose a top-level `nodes` field. Strategy:
  //   1. Check `nodes` (future-proof)
  //   2. Fall back to `edges → EdgeType → node`
  // Bail out with an empty plan if neither resolves — avoids the old `'DisplayCreative'`
  // fallback that caused wrong `... on ImageCreative` fragments on VideoCreativeConnection.
  if (!connectionTypeName) return { selection: '', paths: [] }
  const connRes = await gql(apiKey, `{ t: __type(name: "${connectionTypeName}") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connFields: any[] = connRes?.data?.t?.fields ?? []
  console.log(`[StackAdapt] ${connectionTypeName} raw fields:`, connFields.map((f: any) => f.name).join(', ') || '(none — introspection returned nothing)')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodesField = connFields.find((f: any) => f.name === 'nodes')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edgesField = connFields.find((f: any) => f.name === 'edges')

  let nodeTypeName: string | null = null
  let useEdges = false

  if (nodesField) {
    nodeTypeName = unwrapTypeName(nodesField.type)
  } else if (edgesField) {
    // Relay edges pattern: edges returns [EdgeType], EdgeType has a `node` field
    const edgeTypeName = unwrapTypeName(edgesField.type)
    if (edgeTypeName) {
      const edgeRes = await gql(apiKey, `{ t: __type(name: "${edgeTypeName}") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeField = (edgeRes?.data?.t?.fields ?? []).find((f: any) => f.name === 'node')
      nodeTypeName = unwrapTypeName(nodeField?.type)
      useEdges = true
    }
  }

  if (!nodeTypeName) {
    console.log(`[StackAdapt] ${connectionTypeName}: cannot resolve node type — skipping`)
    return { selection: '', paths: [] }
  }
  console.log(`[StackAdapt] ${connectionTypeName}: node type = ${nodeTypeName} (via ${useEdges ? 'edges' : 'nodes'})`)

  // If the node type is a UNION/INTERFACE, the image fields live on its members.
  const typeRes = await gql(apiKey, `{ t: __type(name: "${nodeTypeName}") { kind possibleTypes { name } } }`)
  const kind = typeRes?.data?.t?.kind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPossibleTypes: string[] = (typeRes?.data?.t?.possibleTypes ?? []).map((p: any) => p.name)
  console.log(`[StackAdapt] ${nodeTypeName} kind=${kind} possibleTypes=[${rawPossibleTypes.join(', ') || 'empty'}]`)
  let concreteTypes: string[] = (kind === 'UNION' || kind === 'INTERFACE') ? rawPossibleTypes : [nodeTypeName]

  // Some StackAdapt API tokens don't expose possibleTypes in introspection.
  // When the UNION member list comes back empty, fall back to known type names.
  // This is the most common reason plans are cached as empty on first cold start.
  const KNOWN_UNION_MEMBERS: Record<string, string[]> = {
    DisplayCreative:  ['ImageCreative', 'TagCreative', 'HtmlCreative'],
    NativeCreative:   ['ImageCreative'],
  }
  if ((kind === 'UNION' || kind === 'INTERFACE') && concreteTypes.length === 0) {
    const fallback = KNOWN_UNION_MEMBERS[nodeTypeName] ?? [nodeTypeName]
    console.log(`[StackAdapt] ${nodeTypeName}: possibleTypes empty — using fallback: [${fallback.join(', ')}]`)
    concreteTypes = fallback
  }

  console.log('[StackAdapt] creative concrete types:', concreteTypes.join(', ') || '(none)')

  // A non-image URL field we never want to treat as the creative image.
  const nonImageUrlRegex = /(click|track|landing|destination|final|redirect|exit|pixel|beacon)/i
  // Inside a concrete creative type, a field named just `url`/`src` is the image,
  // so accept image-named OR url-ish names here (the clickUrl concern that made
  // us exclude bare url/src only applies at the ad level).
  const fieldIsImageish = (name: string) =>
    !nonImageUrlRegex.test(name) && (imgNameRegex.test(name) || urlScalarRegex.test(name))

  const fragments: string[] = []
  const paths: string[][] = []
  for (const typeName of concreteTypes) {
    const fr = await gql(apiKey, `{ t: __type(name: "${typeName}") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: any[] = fr?.data?.t?.fields ?? []
    console.log(`[StackAdapt] ${typeName} ALL fields:`, fields.map((f: any) => f.name).join(', ') || '(none)')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matched: { selection: string; path: string[]; imageNamed: boolean }[] = []
    for (const f of fields) {
      if (!fieldIsImageish(f.name)) continue
      const k = unwrapKind(f.type)
      if (k === 'SCALAR') {
        matched.push({ selection: f.name, path: [f.name], imageNamed: imgNameRegex.test(f.name) })
      } else if (k === 'OBJECT') {
        const sub = unwrapTypeName(f.type)
        if (!sub) continue
        const sr = await gql(apiKey, `{ t: __type(name: "${sub}") { fields { name type { name kind ofType { name kind } } } } }`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const urlSub = (sr?.data?.t?.fields ?? []).find((s: any) => urlScalarRegex.test(s.name) && unwrapKind(s.type) === 'SCALAR')
        if (urlSub) matched.push({ selection: `${f.name} { ${urlSub.name} }`, path: [f.name, urlSub.name], imageNamed: imgNameRegex.test(f.name) })
      }
    }
    // Prefer explicitly image-named fields over generic url/src.
    matched.sort((a, b) => (b.imageNamed ? 1 : 0) - (a.imageNamed ? 1 : 0))
    console.log(`[StackAdapt] ${typeName} image fields:`, matched.map(m => m.selection).join(' | ') || '(none)')
    for (const m of matched) paths.push(m.path)
    if (matched.length) fragments.push(`... on ${typeName} { ${matched.map(m => m.selection).join(' ')} }`)
  }

  const inner = `__typename ${fragments.join(' ')}`
  const creativeNodes = useEdges
    ? `edges { node { ${inner} } }`
    : `nodes { ${inner} }`
  const selection = fragments.length
    ? `\n            creativesConnection { ${creativeNodes} }`
    : ''
  return { selection, paths, useEdges }
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


  // ── Step 2+3: batch-introspect all known ad types, build multi-type fragment ──
  // The first-campaign __typename is only ONE type (DisplayAd). NativeAd, CtvAd,
  // AudioAd, DoohAd each have their own creativesConnection with different creative
  // union types. We introspect all five in one batched query, run discoverCreativeImagePlan
  // for each that has a creativesConnection, and combine the fragments so the
  // step-5 query covers every ad type the advertiser runs.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function unwrapTypeName(t: any): string | null {
    if (!t) return null
    if (t.name) return t.name
    return unwrapTypeName(t.ofType)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readPath = (obj: any, path: string[]): any =>
    path.reduce((o, k) => (o == null ? o : o[k]), obj)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const looksLikeUrl = (v: any): boolean => typeof v === 'string' && /^https?:\/\//i.test(v)

  const KNOWN_AD_TYPES = ['DisplayAd', 'NativeAd', 'CtvAd', 'AudioAd', 'DoohAd']
  const adTypesBatch = await gql(apiKey, `{
    ${KNOWN_AD_TYPES.map(t => `${t}: __type(name: "${t}") {
      fields { name type { name kind ofType { name kind ofType { name } } } }
    }`).join('\n    ')}
  }`)

  const creativeImagePaths: string[][] = []
  const perTypeFragments: string[] = []

  for (const typeName of KNOWN_AD_TYPES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: any[] = adTypesBatch?.data?.[typeName]?.fields ?? []
    if (!fields.length) continue  // type not in schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connField = fields.find((f: any) => f.name === 'creativesConnection')
    if (!connField) continue  // ad type has no creativesConnection
    const connTypeName = unwrapTypeName(connField.type)
    console.log(`[StackAdapt] ${typeName} creativesConnection type:`, connTypeName)

    // Cache per connection type (not per API key) so DisplayCreativeConnection
    // and NativeCreativeConnection get their own separate plans.
    const cacheKey = `${PLAN_CACHE_V}:${apiKey}:${connTypeName}`
    let plan = creativePlanCache.get(cacheKey)
    if (!plan) {
      plan = await discoverCreativeImagePlan(apiKey, connTypeName)
      creativePlanCache.set(cacheKey, plan)
    }
    if (plan.selection) {
      perTypeFragments.push(`... on ${typeName} {${plan.selection}\n            }`)
      creativeImagePaths.push(...plan.paths)
    }
  }

  const creativesSelection = perTypeFragments.length > 0
    ? '\n            ' + perTypeFragments.join('\n            ')
    : ''

  // Secondary fallback: look for scalar image URL fields directly on the ad node.
  // This works even when creativesConnection introspection fails entirely.
  // The adTypesBatch fields were already fetched above, so this is free.
  const adImgNameRx  = /(image|img|photo|thumb|preview|banner|media|logo|icon|asset|cover|picture|graphic)/i
  const adUrlNameRx  = /(url|src|uri|href|path|source)/i
  const adNonImgRx   = /(click|track|landing|destination|final|redirect|exit|pixel|beacon)/i
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adUnwrapKind = (t: any): string | null =>
    !t ? null : (t.kind && t.kind !== 'NON_NULL' && t.kind !== 'LIST' ? t.kind : adUnwrapKind(t.ofType))

  const directAdImageFields = new Map<string, string[]>()
  for (const typeName of KNOWN_AD_TYPES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: any[] = adTypesBatch?.data?.[typeName]?.fields ?? []
    const imgFields = fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((f: any) => {
        const nm: string = f.name
        return !adNonImgRx.test(nm) && (adImgNameRx.test(nm) || adUrlNameRx.test(nm)) && adUnwrapKind(f.type) === 'SCALAR'
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => f.name as string)
    if (imgFields.length) {
      directAdImageFields.set(typeName, imgFields)
      console.log(`[StackAdapt] ${typeName} direct scalar image fields:`, imgFields.join(', '))
    }
  }

  const directAdParts = Array.from(directAdImageFields.entries())
    .map(([typeName, fields]) => `... on ${typeName} { __typename ${fields.join(' ')} }`)
  const directAdSelection = directAdParts.length > 0
    ? '\n            ' + directAdParts.join('\n            ')
    : ''

  const hasAnySelection = Boolean(creativesSelection || directAdSelection)
  if (!hasAnySelection) console.log('[StackAdapt] no creative image selection — images will be blank')
  else console.log('[StackAdapt] image selection ready — creativesConnection:', Boolean(creativesSelection), '| direct fields:', Boolean(directAdSelection))

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

  // ── Step 4: fetch campaigns + ads (paginated, NO creativesConnection) ────────
  // Nesting creativesConnection inside campaigns(100)×ads(200) explodes query
  // cost to ~2M (max is 40k). Fetch the structure cheaply here, then resolve
  // creative images in a separate scoped query in step 5.
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
              paused isArchived isDraft isRejected
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

  // Build active-ad list first (no images yet — step 5 fills them in)
  const allAds: Ad[] = []
  for (const camp of campaigns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adNodes: any[] = camp?.ads?.nodes ?? []

    for (const n of adNodes) {
      if (n.paused !== false) continue
      if (n.isArchived === true) continue
      if (n.isDraft === true) continue
      if (n.isRejected === true) continue

      allAds.push({
        id:       String(n.id ?? ''),
        name:     n.name || n.brandname || 'Unnamed',
        status:   'ACTIVE',
        imageUrl: '',  // filled by step 5
        headline: n.brandname || '',
        campaign: camp.name || '',
        channel:  saChannelLabel(n.channelType),
      })
    }
  }

  console.log(`[StackAdapt] active ads total: ${allAds.length}`)

  // ── Step 5: fetch creatives via batched campaign(id:) aliases ─────────────────
  // We already know exactly which campaigns belong to this advertiser (step 4),
  // so query only those N campaigns with ads+creatives in one aliased request.
  // Cost ∝ N_campaigns × ads_per_campaign — stays well under the 40k limit.
  // (Advertiser type has no `campaigns` field, so advertiser(id:X){campaigns} fails.)
  if (campaigns.length && hasAnySelection) {
    try {
      // ads(first: 10): 25 campaigns × 10 ads × creative_cost ≈ 25k < 40k budget.
      // Camelback averages ~5 active ads/campaign so first:10 captures all of them.
      // Combine creativesConnection fragments (when discovered) with direct scalar
      // fields on the ad node (fallback) so at least one path resolves an image.
      const adNodeFields = `id${creativesSelection}${directAdSelection}`
      const aliases = campaigns.map((c, i) =>
        `c${i}: campaign(id: ${c.id}) {
          ads(first: 10) {
            nodes {
              ${adNodeFields}
            }
          }
        }`
      ).join('\n')

      const creativesRes = await gql(apiKey, `{ ${aliases} }`)

      if (creativesRes?.errors) {
        console.warn('[StackAdapt] creatives query errors:', JSON.stringify(creativesRes.errors).slice(0, 600))
      } else {
        const imageMap = new Map<string, string>()
        for (let i = 0; i < campaigns.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const n of (creativesRes?.data?.[`c${i}`]?.ads?.nodes ?? [] as any[])) {
            if (imageMap.has(String(n.id))) continue

            // ── Path A: creativesConnection ─────────────────────────────────────
            // StackAdapt uses edges { node } — flatten into a list of creative nodes
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const creativeNodes: any[] = n?.creativesConnection?.edges
              ? n.creativesConnection.edges.map((e: any) => e?.node).filter(Boolean)
              : (n?.creativesConnection?.nodes ?? [])
            for (const cr of creativeNodes) {
              for (const path of creativeImagePaths) {
                const v = readPath(cr, path)
                if (looksLikeUrl(v)) { imageMap.set(String(n.id), v); break }
              }
              if (imageMap.has(String(n.id))) break
            }

            // ── Path B: direct scalar fields on the ad node (fallback) ──────────
            if (!imageMap.has(String(n.id))) {
              for (const [typeName, fields] of directAdImageFields.entries()) {
                // __typename present only when directAdSelection is non-empty
                if (n.__typename && n.__typename !== typeName) continue
                for (const fieldName of fields) {
                  const v = n[fieldName]
                  if (looksLikeUrl(v)) { imageMap.set(String(n.id), v); break }
                }
                if (imageMap.has(String(n.id))) break
              }
            }
          }
        }
        console.log(`[StackAdapt] creative images resolved: ${imageMap.size}`)
        for (const ad of allAds) {
          const url = imageMap.get(ad.id)
          if (url) ad.imageUrl = url
        }
      }
    } catch (err) {
      console.warn('[StackAdapt] creatives fetch failed (images will be blank):', err)
    }
  }

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
