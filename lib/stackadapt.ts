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

  // ── Step 3: introspect the creative node type to find the image field ────────
  // Earlier code guessed flat scalar names (imageUrl, url, …) and accepted the
  // first that didn't error. On this schema none of those names exist on the
  // creative node — the URL lives under a nested object — so every guess errored
  // and images were always blank. Instead, introspect the real type and pick a
  // field (scalar or one-level-nested object) whose name looks image/URL-ish.

  // Resolve the creative node type name from the connection type's `nodes` field.
  let creativeNodeTypeName = 'DisplayCreative'
  if (creativeConnectionTypeName) {
    const connRes = await gql(apiKey, `{
      t: __type(name: "${creativeConnectionTypeName}") {
        fields { name type { name kind ofType { name kind ofType { name kind } } } }
      }
    }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connFields: any[] = connRes?.data?.t?.fields ?? []
    const nodesField = connFields.find((f: any) => f.name === 'nodes')
    creativeNodeTypeName = unwrapTypeName(nodesField?.type) ?? creativeNodeTypeName
  }
  console.log('[StackAdapt] creative node type:', creativeNodeTypeName)

  // Introspect that type's fields.
  const nodeRes = await gql(apiKey, `{
    t: __type(name: "${creativeNodeTypeName}") {
      fields { name type { name kind ofType { name kind ofType { name kind } } } }
    }
  }`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeFields: any[] = nodeRes?.data?.t?.fields ?? []
  console.log('[StackAdapt] creative fields:', nodeFields.map((f: any) => f.name).join(', ') || '(none — type not introspectable)')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function unwrapKind(t: any): string | null {
    if (!t) return null
    if (t.kind && t.kind !== 'NON_NULL' && t.kind !== 'LIST') return t.kind
    return unwrapKind(t.ofType)
  }

  const imgNameRegex = /(image|photo|thumb|preview|asset|media|banner|display|creative|file|src|url|icon|logo)/i
  const urlScalarRegex = /(url|src|uri|href|link|path)/i

  // Build candidate selections: scalar fields → `name`; object fields → `name { urlSubfield }`.
  // Each candidate records the GraphQL selection and the JS path to read the value.
  type Candidate = { selection: string; path: string[] }
  const candidates: Candidate[] = []
  for (const f of nodeFields) {
    if (!imgNameRegex.test(f.name)) continue
    const kind = unwrapKind(f.type)
    if (kind === 'SCALAR') {
      candidates.push({ selection: f.name, path: [f.name] })
    } else if (kind === 'OBJECT') {
      const subTypeName = unwrapTypeName(f.type)
      if (!subTypeName) continue
      const subRes = await gql(apiKey, `{
        t: __type(name: "${subTypeName}") { fields { name type { name kind ofType { name kind } } } }
      }`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subFields: any[] = subRes?.data?.t?.fields ?? []
      const urlSub = subFields.find((s: any) => urlScalarRegex.test(s.name) && unwrapKind(s.type) === 'SCALAR')
      if (urlSub) candidates.push({ selection: `${f.name} { ${urlSub.name} }`, path: [f.name, urlSub.name] })
    }
  }
  // Prefer fields that explicitly look like a URL.
  candidates.sort((a, b) =>
    (urlScalarRegex.test(b.path[b.path.length - 1]) ? 1 : 0) -
    (urlScalarRegex.test(a.path[a.path.length - 1]) ? 1 : 0))
  console.log('[StackAdapt] creative image candidates:', candidates.map(c => c.selection).join(' | ') || '(none)')

  // Probe candidates against real data: fetch a batch of creatives and pick the
  // first candidate that yields a non-null value (a field can exist but be null).
  let creativeImgPath: string[] | null = null
  if (candidates.length) {
    const combined = candidates.map(c => c.selection).join(' ')
    const sampleRes = await gql(apiKey, `{
      campaigns(first: 25) {
        nodes { ads(first: 10) { nodes { creativesConnection { nodes { ${combined} } } } } }
      }
    }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readPath = (obj: any, path: string[]): any =>
      path.reduce((o, k) => (o == null ? o : o[k]), obj)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sampleCampaigns: any[] = sampleRes?.data?.campaigns?.nodes ?? []
    outer:
    for (const c of sampleCampaigns) {
      for (const a of c?.ads?.nodes ?? []) {
        for (const cr of a?.creativesConnection?.nodes ?? []) {
          for (const cand of candidates) {
            const v = readPath(cr, cand.path)
            if (typeof v === 'string' && v.length > 0) { creativeImgPath = cand.path; break outer }
          }
        }
      }
    }
  }

  if (creativeImgPath) {
    console.log('[StackAdapt] creative image field resolved:', creativeImgPath.join('.'))
  } else {
    console.log('[StackAdapt] no creative image field found — images will be blank')
  }

  // Build the selection used in the main campaigns query from the resolved path.
  const selectedCandidate = creativeImgPath
    ? candidates.find(c => c.path.join('.') === creativeImgPath!.join('.'))
    : null
  const creativesSelection = selectedCandidate
    ? `\n            creativesConnection { nodes { ${selectedCandidate.selection} } }`
    : ''

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
  for (let page = 0; page < MAX_PAGES; page++) {
    const afterArg: string = cursor ? `, after: "${cursor}"` : ''
    const probe = await gql(apiKey, `{
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
    }`)

    if (probe?.errors) {
      const errStr = JSON.stringify(probe.errors).slice(0, 600)
      const isTokenInvalid = /access token is invalid|unauthor|forbidden/i.test(errStr)
      if (isTokenInvalid) {
        console.error('[StackAdapt] Token too narrow — regenerate with full read scope.')
      } else {
        console.error('[StackAdapt] campaigns->ads errors:', errStr)
      }
      // Return whatever we've gathered so far rather than dropping everything.
      break
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

  // Read the resolved image path off the first creative that actually has a value
  // (creatives[0] is sometimes null while a later one carries the asset).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstImageUrl = (n: any): string => {
    if (!creativeImgPath) return ''
    for (const cr of n?.creativesConnection?.nodes ?? []) {
      const v = creativeImgPath.reduce((o: any, k: string) => (o == null ? o : o[k]), cr)
      if (typeof v === 'string' && v.length > 0) return v
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
