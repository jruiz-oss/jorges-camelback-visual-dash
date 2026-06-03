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
  // Wrap both fetch and JSON parse so a network error or non-JSON body
  // returns null rather than throwing an unhandled rejection that propagates
  // up through every caller and silently kills the whole StackAdapt lane.
  try {
    const res = await fetch(SA_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    })
    try {
      return await res.json()
    } catch {
      console.warn('[StackAdapt] gql: non-JSON response (status', res.status, ')')
      return null
    }
  } catch (err) {
    console.warn('[StackAdapt] gql: network error —', err)
    return null
  }
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
type CreativeImagePlan = {
  selection: string
  paths: string[][]
  textPaths: { path: string[]; role: 'headline' | 'body' | 'cta' }[]
  useEdges?: boolean
}
// Bump PLAN_CACHE_V whenever the plan shape or discovery logic changes — forces
// warm Lambda instances to re-run discoverCreativeImagePlan rather than serving
// stale plans that may reference the wrong creative fragment types.
const PLAN_CACHE_V = 'v7'
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
  if (!connectionTypeName) return { selection: '', paths: [], textPaths: [] }
  // Need 4 levels of ofType depth: [T!]! = NON_NULL→LIST→NON_NULL→T
  const connRes = await gql(apiKey, `{ t: __type(name: "${connectionTypeName}") { fields { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } } }`)
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
      const edgeRes = await gql(apiKey, `{ t: __type(name: "${edgeTypeName}") { fields { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } } }`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeField = (edgeRes?.data?.t?.fields ?? []).find((f: any) => f.name === 'node')
      nodeTypeName = unwrapTypeName(nodeField?.type)
      useEdges = true
    }
  }

  if (!nodeTypeName) {
    console.log(`[StackAdapt] ${connectionTypeName}: cannot resolve node type — skipping`)
    return { selection: '', paths: [], textPaths: [] }
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
  const textFieldRoles: Record<string, 'headline' | 'body' | 'cta'> = {
    // StackAdapt NativeAd actual field names
    heading: 'headline',
    tagline: 'body',
    cta: 'cta',
    // Generic / fallback names
    title: 'headline',
    headline: 'headline',
    name: 'headline',
    body: 'body',
    description: 'body',
    message: 'body',
    text: 'body',
    callToAction: 'cta',
  }

  const fragments: string[] = []
  const paths: string[][] = []
  const textPaths: { path: string[]; role: 'headline' | 'body' | 'cta' }[] = []
  for (const typeName of concreteTypes) {
    const fr = await gql(apiKey, `{ t: __type(name: "${typeName}") { fields { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } } }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: any[] = fr?.data?.t?.fields ?? []
    console.log(`[StackAdapt] ${typeName} ALL fields:`, fields.map((f: any) => f.name).join(', ') || '(none)')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matched: { selection: string; path: string[]; imageNamed: boolean }[] = []
    const textMatched: { selection: string; path: string[]; role: 'headline' | 'body' | 'cta' }[] = []
    for (const f of fields) {
      const k = unwrapKind(f.type)
      const textRole = textFieldRoles[f.name]
      // Accept ENUM as well as SCALAR — StackAdapt's callToAction is an ENUM value
      // (e.g. "LEARN_MORE") that GraphQL returns as a string when selected.
      if (textRole && (k === 'SCALAR' || k === 'ENUM')) {
        textMatched.push({ selection: f.name, path: [f.name], role: textRole })
      }
      if (!fieldIsImageish(f.name)) continue
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
    console.log(`[StackAdapt] ${typeName} text fields:`, textMatched.map(m => m.selection).join(' | ') || '(none)')
    for (const m of matched) paths.push(m.path)
    for (const m of textMatched) textPaths.push({ path: m.path, role: m.role })
    const selectionFields = Array.from(new Set([
      ...matched.map(m => m.selection),
      ...textMatched.map(m => m.selection),
    ]))
    if (selectionFields.length) fragments.push(`... on ${typeName} { ${selectionFields.join(' ')} }`)
  }

  const inner = `__typename ${fragments.join(' ')}`
  const creativeNodes = useEdges
    ? `edges { node { ${inner} } }`
    : `nodes { ${inner} }`
  const selection = fragments.length
    ? `\n            creativesConnection { ${creativeNodes} }`
    : ''
  return { selection, paths, textPaths, useEdges }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function unwrapArgTypeName(t: any): string | null {
    if (!t) return null
    if (t.name) return t.name
    return unwrapArgTypeName(t.ofType)
  }
  const discoveryRes = await gql(apiKey, `{
    campaigns(first: 1) {
      nodes { ads(first: 1) { nodes { __typename } } }
    }
    queryType: __type(name: "Query") {
      fields {
        name
        type { name kind ofType { name kind ofType { name kind } } }
        args { name type { name kind ofType { name kind ofType { name kind } } } }
      }
    }
    dateRangeType: __type(name: "DateRangeInput") {
      inputFields { name }
    }
  }`)
  const adTypeName: string =
    discoveryRes?.data?.campaigns?.nodes?.[0]?.ads?.nodes?.[0]?.__typename ?? 'DisplayAd'
  console.log('[StackAdapt] ad __typename:', adTypeName)

  // Find what args campaignDelivery actually accepts + their type names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFields: any[] = discoveryRes?.data?.queryType?.fields ?? []
  const deliveryField = queryFields.find((f: any) => f.name === 'campaignDelivery')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveryArgs: { name: string; typeName: string | null }[] = (deliveryField?.args ?? []).map((a: any) => ({
    name: a.name,
    typeName: unwrapArgTypeName(a.type),
  }))
  console.log('[StackAdapt] campaignDelivery args:', deliveryArgs.map(a => `${a.name}(${a.typeName})`).join(', '))

  // Find the actual field names on DateRangeInput
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dateRangeFields: string[] = (discoveryRes?.data?.dateRangeType?.inputFields ?? []).map((f: any) => f.name)
  console.log('[StackAdapt] DateRangeInput fields:', dateRangeFields.join(', '))

  // Introspect campaignDelivery input/return types so we can build the spend-check query.
  // We need: filterBy input fields, dataType enum values, granularity enum values,
  // and the return type's row/node fields.
  const filterByTypeName   = deliveryArgs.find(a => a.name === 'filterBy')?.typeName   ?? null
  const dataTypeTypeName   = deliveryArgs.find(a => a.name === 'dataType')?.typeName   ?? null
  const granularityTypeName = deliveryArgs.find(a => a.name === 'granularity')?.typeName ?? null
  // Return type: look up the campaignDelivery field's return type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveryReturnTypeName: string | null = unwrapArgTypeName(
    (deliveryField as any)?.type ?? null
  )
  console.log(`[StackAdapt] campaignDelivery types — filterBy:${filterByTypeName} dataType:${dataTypeTypeName} granularity:${granularityTypeName} return:${deliveryReturnTypeName}`)

  // Batch-introspect all the types we need in one call (only the ones that resolved)
  const typeIntrospections: Record<string, string> = {}
  const typesToIntrospect = [filterByTypeName, dataTypeTypeName, granularityTypeName, deliveryReturnTypeName].filter(Boolean) as string[]
  if (typesToIntrospect.length) {
    const batchQuery = `{ ${typesToIntrospect.map(t => `${t.replace(/[^a-zA-Z0-9_]/g, '_')}: __type(name: "${t}") { kind fields { name type { name kind ofType { name kind } } } inputFields { name } enumValues { name } }`).join('\n')} }`
    const typeRes = await gql(apiKey, batchQuery)
    for (const t of typesToIntrospect) {
      const key = t.replace(/[^a-zA-Z0-9_]/g, '_')
      const info = typeRes?.data?.[key]
      if (info) typeIntrospections[t] = info
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterByFields: string[]  = filterByTypeName   ? ((typeIntrospections[filterByTypeName] as any)?.inputFields ?? []).map((f: any) => f.name) : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataTypeValues: string[]  = dataTypeTypeName   ? ((typeIntrospections[dataTypeTypeName] as any)?.enumValues  ?? []).map((v: any) => v.name) : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const granularityValues: string[] = granularityTypeName ? ((typeIntrospections[granularityTypeName] as any)?.enumValues ?? []).map((v: any) => v.name) : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveryReturnFields: string[] = deliveryReturnTypeName ? ((typeIntrospections[deliveryReturnTypeName] as any)?.fields ?? []).map((f: any) => f.name) : []
  console.log('[StackAdapt] delivery filterBy fields:', filterByFields.join(', ') || '(none)')
  console.log('[StackAdapt] delivery dataType values:', dataTypeValues.join(', ') || '(none)')
  console.log('[StackAdapt] delivery granularity values:', granularityValues.join(', ') || '(none)')
  console.log('[StackAdapt] delivery return fields:', deliveryReturnFields.join(', ') || '(none)')


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
  // Require an HTTPS URL that isn't a known non-image file type.
  // Video/VAST files render as broken <img> tags → filter completely.
  // Audio files are captured separately in audioMap so the card can show a listen link.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const looksLikeUrl = (v: any): boolean => {
    if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) return false
    const path = v.split('?')[0].toLowerCase()
    return !/\.(mp4|webm|mov|avi|flv|mp3|aac|ogg|flac|wav|xml|m3u8|ts)$/.test(path)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const looksLikeAudioUrl = (v: any): boolean => {
    if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) return false
    return /\.(mp3|aac|ogg|flac|wav)$/i.test(v.split('?')[0])
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const looksLikeVideoUrl = (v: any): boolean => {
    if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) return false
    return /\.(mp4|webm|mov|avi|flv|m3u8|ts)$/i.test(v.split('?')[0])
  }

  const KNOWN_AD_TYPES = ['DisplayAd', 'NativeAd', 'CtvAd', 'AudioAd', 'DoohAd']
  const adTypesBatch = await gql(apiKey, `{
    ${KNOWN_AD_TYPES.map(t => `${t}: __type(name: "${t}") {
      fields { name type { name kind ofType { name kind ofType { name } } } }
    }`).join('\n    ')}
  }`)

  async function gqlWithRateLimit(query: string, label: string, attempts = 4) {
    let result: any
    for (let attempt = 0; attempt < attempts; attempt++) {
      result = await gql(apiKey, query)
      const waitMs = rateLimitWaitMs(result)
      if (waitMs == null) return result
      console.warn(`[StackAdapt] rate limited on ${label}; waiting ${waitMs}ms (attempt ${attempt + 1})`)
      await sleep(waitMs)
    }
    return result
  }

  const creativeImagePaths: string[][] = []
  const creativeTextPaths: { path: string[]; role: 'headline' | 'body' | 'cta' }[] = []
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
      creativeTextPaths.push(...plan.textPaths)
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

  // Detect text fields on NativeAd so copy shows in the tile.
  // The adTypesBatch result is already in memory — no extra API call needed.
  // StackAdapt NativeAd uses: heading (headline), tagline (body), cta (CTA).
  // The generic names (title, headline, body, etc.) are kept as fallbacks for
  // other API token scopes or future schema changes.
  const NATIVE_TEXT_CANDIDATES = ['heading', 'tagline', 'cta', 'title', 'headline', 'body', 'description', 'message', 'text', 'callToAction']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeAdAllFields: any[] = adTypesBatch?.data?.['NativeAd']?.fields ?? []
  // Log all NativeAd schema fields so we can diagnose missing text without guessing.
  console.log('[StackAdapt] NativeAd ALL schema fields:', nativeAdAllFields.map((f: any) => `${f.name}(${adUnwrapKind(f.type)})`).join(', ') || '(type not in schema)')
  const nativeTextFieldNames: string[] = nativeAdAllFields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((f: any) => {
      const k = adUnwrapKind(f.type)
      // Accept SCALAR and ENUM — callToAction is typically an ENUM in StackAdapt's schema.
      return NATIVE_TEXT_CANDIDATES.includes(f.name) && (k === 'SCALAR' || k === 'ENUM')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => f.name as string)
  // Log regardless so we can tell the difference between "found none" and "schema missing".
  console.log('[StackAdapt] NativeAd text fields discovered:', nativeTextFieldNames.join(', ') || '(none — check schema)')
  const nativeTextFragment = nativeTextFieldNames.length > 0
    ? `\n              ... on NativeAd { ${nativeTextFieldNames.join(' ')} }`
    : ''

  // ── Step 3a: introspect CampaignStatusType enum values + CampaignFlight fields ─
  // We know from schema discovery that Campaign has `campaignStatus(CampaignStatusType)`
  // and `currentFlight(CampaignFlight)`. Introspect both so we know the exact enum
  // values and flight date field names before querying live data.
  const schemaDiscRes = await gql(apiKey, `{
    statusType:   __type(name: "CampaignStatusType") {
      kind enumValues { name } fields { name type { name kind ofType { name kind } } }
    }
    flightType:   __type(name: "CampaignFlight")     { fields { name type { name kind ofType { name kind } } } }
    campaignType: __type(name: "Campaign")           { fields { name type { name kind ofType { name kind } } } }
  }`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusEnumValues: string[] = (schemaDiscRes?.data?.statusType?.enumValues ?? []).map((v: any) => v.name as string)
  const statusTypeKind: string = schemaDiscRes?.data?.statusType?.kind ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusTypeObjFields: any[] = schemaDiscRes?.data?.statusType?.fields ?? []
  console.log(`[StackAdapt] CampaignStatusType kind=${statusTypeKind || '(unknown)'} enumValues=[${statusEnumValues.join(', ') || 'none'}]`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flightFields: string[] = (schemaDiscRes?.data?.flightType?.fields ?? []).map((f: any) => f.name as string)
  console.log('[StackAdapt] CampaignFlight fields:', flightFields.join(', ') || '(none)')

  // Find the field on Campaign whose type resolves to CampaignStatusType.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignTypeFields: any[] = schemaDiscRes?.data?.campaignType?.fields ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrapCampTypeName = (t: any): string | null => (!t ? null : (t.name ?? unwrapCampTypeName(t.ofType)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrapCampFieldKind = (t: any): string | null =>
    !t ? null : (t.kind && t.kind !== 'NON_NULL' && t.kind !== 'LIST' ? t.kind : unwrapCampFieldKind(t.ofType))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignStatusFieldName: string | null = (campaignTypeFields.find((f: any) => unwrapCampTypeName(f.type) === 'CampaignStatusType') ?? null)?.name ?? null
  console.log(`[StackAdapt] Campaign status field: ${campaignStatusFieldName ?? '(not found in schema)'}`)

  // Build the GraphQL selection fragment for campaignStatus and the JS path to read it back.
  // ENUM   → select as plain scalar
  // OBJECT → need sub-selection; find a scalar/enum sub-field that looks like a state value
  // Other  → skip entirely (don't add to the campaign query — a bare field on an OBJECT breaks GQL)
  let campaignStatusSel = ''
  let campaignStatusPath: string[] = []
  if (campaignStatusFieldName) {
    if (statusTypeKind === 'ENUM') {
      campaignStatusSel = campaignStatusFieldName
      campaignStatusPath = [campaignStatusFieldName]
    } else if (statusTypeKind === 'OBJECT') {
      // Prefer a scalar/enum field with a state-like name; fall back to any scalar.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stateSubField = statusTypeObjFields.find((f: any) => {
        const k = unwrapCampFieldKind(f.type)
        return /^(state|status|value|name)$/i.test(f.name) && (k === 'SCALAR' || k === 'ENUM')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) ?? statusTypeObjFields.find((f: any) => {
        const k = unwrapCampFieldKind(f.type)
        return k === 'SCALAR' || k === 'ENUM'
      })
      if (stateSubField) {
        campaignStatusSel = `${campaignStatusFieldName} { ${stateSubField.name} }`
        campaignStatusPath = [campaignStatusFieldName, stateSubField.name]
      } else {
        console.log(`[StackAdapt] campaignStatus is OBJECT but no scalar subfield found — skipping`)
      }
    }
    // SCALAR, UNION, INTERFACE, etc. → omit from query to avoid parse errors
  }
  console.log(`[StackAdapt] campaignStatus GQL selection: "${campaignStatusSel || '(skipped)'}"`)

  // Collect enum values that mean "active/running".
  // For ENUM types these come from enumValues. For OBJECT types the sub-field may be an enum
  // whose values we haven't yet introspected — the filter guard below handles that gracefully.
  const activeStatusValues = new Set(statusEnumValues.filter(v => /^active$/i.test(v)))

  // Detect which date fields actually exist on CampaignFlight before querying them.
  const flightEndField   = flightFields.find(f => /end/i.test(f))
  const flightStartField = flightFields.find(f => /start/i.test(f))
  console.log(`[StackAdapt] CampaignFlight date fields — start: ${flightStartField ?? '(none)'}, end: ${flightEndField ?? '(none)'}`)

  // Build the currentFlight sub-selection only with fields that actually exist.
  const flightDateSel = [flightStartField, flightEndField].filter(Boolean).join(' ')
  const currentFlightSel = flightDateSel ? `currentFlight { ${flightDateSel} }` : ''

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
          ${campaignStatusSel}
          ${currentFlightSel}
          advertiser { id name }
          campaignGroup { id name }
          ads(first: 200) {
            nodes {
              id name brandname channelType clickUrl creativeSize
              paused isArchived isDraft isRejected${nativeTextFragment}
            }
          }
        }
      }
    }`

    // Each page costs ~half the rate-limit budget, so a full account can get
    // throttled mid-pagination. When that happens StackAdapt tells us how long
    // to wait — honor it and retry the same page rather than returning partial
    // results (which would silently drop the target advertiser's campaigns).
    const probe = await gqlWithRateLimit(query, `campaign page ${page}`)

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

  // ── Step 4b: filter campaigns by advertiser + isArchived/isDraft + status + end date ──
  const now4b = new Date()
  const candidateCampaigns = allCampaigns.filter(c => {
    if (c.isArchived !== false || c.isDraft !== false) return false
    if (advertiserId && String(c.advertiser?.id) !== String(advertiserId)) return false

    // Filter out campaigns whose StackAdapt status is not ACTIVE.
    // Uses the introspected path (handles both ENUM scalar and OBJECT sub-field).
    if (campaignStatusPath.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusVal = String(campaignStatusPath.reduce((obj: any, key) => obj?.[key], c) ?? '').toUpperCase()
      if (statusVal) {
        // Primary: exact match against known active enum values (works for ENUM types)
        // Fallback: pattern match — catches ENDED, ENDED_EARLY, COMPLETED, EXPIRED, etc.
        // even when the schema returned no enum values (OBJECT type with string state).
        const knownEnded = /END|COMPLET|EXPIR|FINISH|CANCEL|INACTIV/i.test(statusVal)
        const knownActive = activeStatusValues.size > 0
          ? activeStatusValues.has(statusVal)
          : /^ACTIVE$|^RUNNING$|^LIVE$/i.test(statusVal)
        if (knownEnded || !knownActive) {
          console.log(`[StackAdapt] skipping campaign "${c.name}" — status=${statusVal}`)
          return false
        }
      }
    }

    // Filter out campaigns whose flight end date is in the past.
    if (flightEndField && c.currentFlight?.[flightEndField]) {
      const endDate = new Date(c.currentFlight[flightEndField])
      if (!isNaN(endDate.getTime()) && endDate < now4b) {
        console.log(`[StackAdapt] skipping campaign "${c.name}" — flight ended ${c.currentFlight[flightEndField]}`)
        return false
      }
    }

    return true
  })
  console.log(`[StackAdapt] campaigns: ${allCampaigns.length} total, ${candidateCampaigns.length} for this advertiser (after status + end-date filter)`)

  // ── Step 4c: spend-check — only campaigns that delivered in the last 24h ─────
  // Query campaignDelivery with yesterday→today date range and keep only campaigns
  // whose spend > 0. This is the most reliable signal that a campaign is actively
  // running (approved-but-future and ended-by-date campaigns both show $0 here).
  // We use the introspected type info to build the query safely; if any part fails
  // we fall back to the full candidate list.
  let campaigns = candidateCampaigns  // default: no spend filter
  try {
    // Resolve date arg field names (usually "from"/"to")
    const fromField = dateRangeFields.find(f => /^from|^start/i.test(f)) ?? 'from'
    const toField   = dateRangeFields.find(f => /^to|^end/i.test(f))   ?? 'to'

    // Build date strings: yesterday and today (server local time)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const dateArg = `{ ${fromField}: "${fmt(yesterday)}", ${toField}: "${fmt(now)}" }`

    // Pick a daily granularity enum value (try common names)
    const granArg = granularityValues.find(v => /^daily|^day$/i.test(v)) ?? 'DAILY'

    // Pick a spend/cost data type (try common names; omit if no enum or if arg not present)
    const hasDataTypeArg = deliveryArgs.some(a => a.name === 'dataType')
    const dataTypeArg = hasDataTypeArg
      ? (dataTypeValues.find(v => /spend|cost/i.test(v)) ?? dataTypeValues[0] ?? null)
      : null

    // Build filterBy arg — look for a campaign-level or advertiser-level ID filter field.
    // StackAdapt uses `ids` (not `campaignIds`) and `advertiserIds` (plural, array).
    // Prefer campaign IDs so we only check our advertiser's campaigns.
    const campaignIdsFieldName = filterByFields.find(f => /^(campaign)?ids?$/i.test(f)) ?? null
    const advertiserIdsFieldName = filterByFields.find(f => /^advertiserIds?$/i.test(f)) ?? null
    let filterByArg = ''
    if (campaignIdsFieldName && candidateCampaigns.length) {
      // Validate that every ID is numeric before injecting into the GraphQL
      // query string. API-returned IDs should always be numeric, but a
      // malformed response could otherwise inject arbitrary GraphQL.
      const ids = candidateCampaigns
        .map(c => String(c.id))
        .filter(id => /^\d+$/.test(id))
        .join(', ')
      if (ids) filterByArg = `filterBy: { ${campaignIdsFieldName}: [${ids}] }`
    } else if (advertiserIdsFieldName && advertiserId) {
      // Same guard for the advertiser ID (may come from env or static config).
      const safeAdvertiserId = String(advertiserId).replace(/\D/g, '')
      if (safeAdvertiserId) filterByArg = `filterBy: { ${advertiserIdsFieldName}: [${safeAdvertiserId}] }`
    }

    // Pick the return field that contains rows/nodes
    const rowsField = deliveryReturnFields.find(f => /^rows?|^nodes?|^data/i.test(f)) ?? 'rows'
    // Common field names for campaign ID and spend in delivery rows
    const spendCandidates = ['spend', 'cost', 'totalSpend', 'totalCost']
    const campIdCandidates = ['campaignId', 'campaign_id', 'id']

    const dataTypeClause = dataTypeArg ? `dataType: ${dataTypeArg}` : ''
    const deliveryQuery = `{
      campaignDelivery(
        ${filterByArg}
        date: ${dateArg}
        granularity: ${granArg}
        ${dataTypeClause}
      ) {
        ${rowsField} {
          ${campIdCandidates.join(' ')}
          ${spendCandidates.join(' ')}
        }
      }
    }`

    console.log('[StackAdapt] spend-check query (summarised):', `campaignDelivery(filterBy:${filterByArg ? 'set' : 'none'}, date:${fmt(yesterday)}→${fmt(now)}, gran:${granArg})`)
    const deliveryRes = await gqlWithRateLimit(deliveryQuery, 'spend-check')

    if (deliveryRes?.errors) {
      console.warn('[StackAdapt] spend-check query failed — keeping all candidate campaigns:', JSON.stringify(deliveryRes.errors).slice(0, 400))
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = deliveryRes?.data?.campaignDelivery?.[rowsField] ?? []
      console.log(`[StackAdapt] spend-check rows returned: ${rows.length}`)

      // Build set of campaign IDs that had any spend in the window
      const spendingIds = new Set<string>()
      for (const row of rows) {
        // Find which campaign ID field and spend field are present in this row
        const idVal = campIdCandidates.map(f => row[f]).find(v => v != null)
        const spendVal = spendCandidates.map(f => row[f]).find(v => v != null)
        if (idVal != null && Number(spendVal) > 0) {
          spendingIds.add(String(idVal))
        }
      }
      console.log(`[StackAdapt] campaigns with spend in last 24h: ${spendingIds.size} — ids: ${Array.from(spendingIds).join(', ')}`)

      if (rows.length === 0) {
        // No rows returned at all — likely a token scope or API issue.
        // Fall back to showing all candidates rather than a blank wall.
        console.log('[StackAdapt] spend-check returned no rows — keeping all candidates as fallback (possible token scope issue)')
      } else {
        // Rows came back — apply strict spend filter.
        // Campaigns with $0 spend in the last 24h are hidden regardless.
        const before = candidateCampaigns.length
        campaigns = candidateCampaigns.filter(c => {
          const active = spendingIds.has(String(c.id))
          if (!active) console.log(`[StackAdapt] skipping campaign "${c.name}" — $0 spend in last 24h`)
          return active
        })
        console.log(`[StackAdapt] campaigns after spend filter: ${campaigns.length} / ${before}`)
      }
    }
  } catch (err) {
    console.warn('[StackAdapt] spend-check failed — keeping all candidate campaigns:', err)
  }

  // Build active-ad list first (no images yet — step 5 fills them in)
  const allAds: Ad[] = []
  const firstCleanText = (values: unknown[]): string => {
    for (const value of values) {
      if (typeof value !== 'string') continue
      const text = value.trim()
      if (text) return text
    }
    return ''
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeDescriptions = (n: any, headline: string): string[] => {
    // tagline = StackAdapt's actual body-copy field; generic names kept as fallback
    const fields = ['tagline', 'body', 'description', 'message', 'text']
    const parts: string[] = []
    for (const field of fields) {
      const text = firstCleanText([n[field]])
      if (text && text !== headline && !parts.includes(text)) parts.push(text)
    }
    // cta = StackAdapt's actual CTA field; callToAction kept as fallback
    const cta = firstCleanText([n.cta, n.callToAction])
    if (cta && !parts.includes(cta)) parts.push(`CTA: ${cta}`)
    return parts
  }
  for (const camp of campaigns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adNodes: any[] = camp?.ads?.nodes ?? []

    for (const n of adNodes) {
      if (n.paused !== false) continue
      if (n.isArchived === true) continue
      if (n.isDraft === true) continue
      if (n.isRejected === true) continue

      // Only pull headline from genuine copy fields; don't fall back to brandname/name here.
      // CreativeTile already uses ad.name as its display fallback, so leaving ad.headline
      // empty lets creative-node text (step 5) fill it in without being blocked by a
      // brandname like "Camelback Resort" that would satisfy the !ad.headline guard.
      const headline = firstCleanText([n.heading, n.title, n.headline])
      const descriptions = nativeDescriptions(n, headline)

      // Extract destination path from clickUrl — same pattern as Meta/Google.
      // Show the URL path (e.g. "/aquatopia-waterpark") in the brand chip; fall
      // back to just the hostname if the path is root-only.
      let destinationUrl: string | undefined
      if (n.clickUrl) {
        try {
          const parsed = new URL(n.clickUrl)
          const path = parsed.pathname.replace(/\/$/, '')
          destinationUrl = path || parsed.hostname.replace(/^www\./, '')
        } catch { /* not a valid URL — skip */ }
      }

      allAds.push({
        id:          String(n.id ?? ''),
        name:        n.name || n.brandname || 'Unnamed',
        status:      'ACTIVE',
        imageUrl:    '',  // filled by step 5
        // NativeAd: prefer native copy when StackAdapt exposes it; display ads
        // generally fall back to brand/ad names because they carry copy in art.
        headline,
        campaign:    camp.name || '',
        channel:     saChannelLabel(n.channelType),
        ...(destinationUrl ? { destinationUrl } : {}),
        ...(descriptions.length ? { descriptions } : {}),
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
      // Fetch creative data in small paginated campaign batches. The old
      // `ads(first: 10)` shortcut silently missed active ads in campaign-heavy
      // clients, causing listed tiles with blank images. Keep each request cheap
      // enough for StackAdapt's cost limit while paging until every campaign's
      // ad connection is exhausted.
      const adNodeFields = `id${creativesSelection}${directAdSelection}`
      const activeAdIds = new Set(allAds.map(a => a.id))
      const imageMap = new Map<string, string>()
      const audioMap = new Map<string, string>()
      const videoMap = new Map<string, string>()
      const textMap = new Map<string, { headline?: string; descriptions: string[] }>()
      const campaignStates = campaigns.map(c => ({
        id: String(c.id),
        cursor: null as string | null,
        done: false,
      }))
      const CREATIVE_ADS_PER_PAGE = 100
      const CREATIVE_CAMPAIGNS_PER_BATCH = 2

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readCreativeNode = (n: any) => {
        const id = String(n?.id ?? '')
        if (!id || !activeAdIds.has(id)) return
        const existingText = textMap.get(id) ?? { descriptions: [] }

        // ── Path A: creativesConnection ─────────────────────────────────────
        // StackAdapt uses edges { node } — flatten into a list of creative nodes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const creativeNodes: any[] = n?.creativesConnection?.edges
          ? n.creativesConnection.edges.map((e: any) => e?.node).filter(Boolean)
          : (n?.creativesConnection?.nodes ?? [])
        for (const cr of creativeNodes) {
          for (const { path, role } of creativeTextPaths) {
            const text = firstCleanText([readPath(cr, path)])
            if (!text) continue
            if (role === 'headline') {
              existingText.headline ??= text
            } else {
              const value = role === 'cta' ? `CTA: ${text}` : text
              if (!existingText.descriptions.includes(value)) {
                existingText.descriptions.push(value)
              }
            }
          }
          for (const path of creativeImagePaths) {
            const v = readPath(cr, path)
            if (looksLikeUrl(v)) { imageMap.set(id, v); break }
            // Capture audio URLs so the card can show a listen link
            if (!audioMap.has(id) && looksLikeAudioUrl(v)) {
              audioMap.set(id, v)
            }
            // Capture video URLs (mp4/m3u8/etc.) so CTV tiles get click-to-play
            if (!videoMap.has(id) && looksLikeVideoUrl(v)) {
              videoMap.set(id, v)
            }
          }
          if (imageMap.has(id) && creativeTextPaths.length === 0) break
        }
        if (existingText.headline || existingText.descriptions.length) {
          textMap.set(id, existingText)
        }

        // ── Path B: direct scalar fields on the ad node (fallback) ──────────
        if (!imageMap.has(id)) {
          for (const [typeName, fields] of Array.from(directAdImageFields.entries())) {
            // __typename present only when directAdSelection is non-empty
            if (n.__typename && n.__typename !== typeName) continue
            for (const fieldName of fields) {
              const v = n[fieldName]
              if (looksLikeUrl(v)) { imageMap.set(id, v); break }
              if (!audioMap.has(id) && looksLikeAudioUrl(v)) {
                audioMap.set(id, v)
              }
              if (!videoMap.has(id) && looksLikeVideoUrl(v)) {
                videoMap.set(id, v)
              }
            }
            if (imageMap.has(id)) break
          }
        }
      }

      while (campaignStates.some(c => !c.done)) {
        const batch = campaignStates
          .filter(c => !c.done)
          .slice(0, CREATIVE_CAMPAIGNS_PER_BATCH)
        const aliases = batch.map((c, i) => {
          const afterArg = c.cursor ? `, after: "${c.cursor}"` : ''
          return `c${i}: campaign(id: ${c.id}) {
            ads(first: ${CREATIVE_ADS_PER_PAGE}${afterArg}) {
              pageInfo { hasNextPage endCursor }
              nodes {
                ${adNodeFields}
              }
            }
          }`
        }).join('\n')

        const creativesRes = await gqlWithRateLimit(`{ ${aliases} }`, 'creative batch')

        if (creativesRes?.errors) {
          console.warn('[StackAdapt] creatives query errors:', JSON.stringify(creativesRes.errors).slice(0, 600))
          break
        }

        batch.forEach((state, i) => {
          const conn = creativesRes?.data?.[`c${i}`]?.ads
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const n of (conn?.nodes ?? [] as any[])) {
            readCreativeNode(n)
          }
          if (conn?.pageInfo?.hasNextPage && conn?.pageInfo?.endCursor) {
            state.cursor = conn.pageInfo.endCursor
          } else {
            state.done = true
          }
        })
      }

      const noImage = allAds.filter(a => !imageMap.has(a.id))
      console.log(`[StackAdapt] creative images resolved: ${imageMap.size} / ${allAds.length} | audio: ${audioMap.size} | video: ${videoMap.size} | no-asset: ${noImage.length - audioMap.size - videoMap.size} (${noImage.filter(a => !audioMap.has(a.id) && !videoMap.has(a.id)).map(a => a.name).slice(0, 5).join(', ')}${noImage.length > 5 ? '…' : ''})`)
      for (const ad of allAds) {
        const url = imageMap.get(ad.id)
        if (url) ad.imageUrl = url
        const aUrl = audioMap.get(ad.id)
        if (aUrl) ad.audioUrl = aUrl
        const vUrl = videoMap.get(ad.id)
        if (vUrl) ad.videoUrl = vUrl
        const creativeText = textMap.get(ad.id)
        if (creativeText?.headline && !ad.headline) {
          ad.headline = creativeText.headline
        }
        if (creativeText?.descriptions.length) {
          const existing = ad.descriptions ?? []
          const merged = [...existing]
          for (const desc of creativeText.descriptions) {
            if (desc !== ad.headline && !merged.includes(desc)) merged.push(desc)
          }
          if (merged.length) ad.descriptions = merged
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
