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

  // ── Step 3: find the image field ─────────────────────────────────────────────
  // DisplayCreative is NOT introspectable on this schema (`__type` returns no
  // fields), so we cannot discover the creative's image field by introspection.
  // But DisplayAd IS introspectable. Strategy:
  //   (a) build candidates from DisplayAd's introspected fields and probe them at
  //       the AD level (reliable — the type introspects);
  //   (b) if that finds nothing, brute-force a fixed list of common creative
  //       field/shape names against real data (the creative type is opaque).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function unwrapKind(t: any): string | null {
    if (!t) return null
    if (t.kind && t.kind !== 'NON_NULL' && t.kind !== 'LIST') return t.kind
    return unwrapKind(t.ofType)
  }
  // Strong image-name match — deliberately excludes bare "url"/"src" so we don't
  // mistake clickUrl / landingUrl / destinationUrl for an image.
  const imgNameRegex = /(image|img|photo|thumb|preview|banner|creative|media|logo|icon|asset|cover|picture|graphic)/i
  const urlScalarRegex = /(url|src|uri|href|path|source)/i

  console.log('[StackAdapt] ad (DisplayAd) fields:', adTypeFields.map((f: any) => f.name).join(', ') || '(none)')

  type Candidate = { selection: string; path: string[] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readPath = (obj: any, path: string[]): any =>
    path.reduce((o, k) => (o == null ? o : o[k]), obj)

  // Build image candidates from an introspected field list (scalar → `name`,
  // object → one-level-nested `name { urlSubfield }`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function buildCandidates(fields: any[]): Promise<Candidate[]> {
    const out: Candidate[] = []
    for (const f of fields) {
      if (!imgNameRegex.test(f.name)) continue
      const kind = unwrapKind(f.type)
      if (kind === 'SCALAR') {
        out.push({ selection: f.name, path: [f.name] })
      } else if (kind === 'OBJECT') {
        const sub = unwrapTypeName(f.type)
        if (!sub) continue
        const subRes = await gql(apiKey, `{ t: __type(name: "${sub}") { fields { name type { name kind ofType { name kind } } } } }`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subFields: any[] = subRes?.data?.t?.fields ?? []
        const urlSub = subFields.find((s: any) => urlScalarRegex.test(s.name) && unwrapKind(s.type) === 'SCALAR')
        if (urlSub) out.push({ selection: `${f.name} { ${urlSub.name} }`, path: [f.name, urlSub.name] })
      }
    }
    return out
  }

  // (a) Ad-level candidates from DisplayAd introspection.
  const adCandidates = await buildCandidates(adTypeFields)
  console.log('[StackAdapt] ad image candidates:', adCandidates.map(c => c.selection).join(' | ') || '(none)')

  let adImagePath: string[] | null = null
  let adImageSelection = ''
  if (adCandidates.length) {
    const combined = adCandidates.map(c => c.selection).join(' ')
    const res = await gql(apiKey, `{ campaigns(first: 25) { nodes { ads(first: 10) { nodes { ${combined} } } } } }`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const camps: any[] = res?.errors ? [] : (res?.data?.campaigns?.nodes ?? [])
    outerAd:
    for (const c of camps) {
      for (const a of c?.ads?.nodes ?? []) {
        for (const cand of adCandidates) {
          const v = readPath(a, cand.path)
          if (typeof v === 'string' && v.length > 0) { adImagePath = cand.path; adImageSelection = cand.selection; break outerAd }
        }
      }
    }
  }
  if (adImagePath) console.log('[StackAdapt] ad image field resolved:', adImagePath.join('.'))

  // (b) Creative brute-force fallback — only if no ad-level image was found.
  let creativeImgPath: string[] | null = null
  let creativeSelection = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creativeHasValue = (data: any, path: string[]): boolean => {
    for (const c of data?.campaigns?.nodes ?? [])
      for (const a of c?.ads?.nodes ?? [])
        for (const cr of a?.creativesConnection?.nodes ?? []) {
          const v = readPath(cr, path)
          if (typeof v === 'string' && v.length > 0) return true
        }
    return false
  }
  if (!adImagePath) {
    const flat = ['imageUrl', 'url', 'src', 'previewUrl', 'thumbnailUrl', 'assetUrl', 'fileUrl', 'secureUrl', 'mediaUrl', 'image']
    for (const f of flat) {
      const r = await gql(apiKey, `{ campaigns(first: 25) { nodes { ads(first: 10) { nodes { creativesConnection { nodes { ${f} } } } } } } }`)
      if (r?.errors) continue
      if (creativeHasValue(r?.data, [f])) { creativeImgPath = [f]; creativeSelection = f; break }
    }
    if (!creativeImgPath) {
      const parents = ['image', 'asset', 'media', 'creative', 'file', 'banner', 'preview', 'thumbnail', 'photo', 'content']
      const subs = ['url', 'src', 'imageUrl', 'fileUrl', 'assetUrl', 'secureUrl', 'href', 'path', 'original', 'large', 'source']
      outerParent:
      for (const p of parents) {
        // Confirm the parent object field exists before probing its subfields.
        const exists = await gql(apiKey, `{ campaigns(first: 1) { nodes { ads(first: 1) { nodes { creativesConnection { nodes { ${p} { __typename } } } } } } } }`)
        if (exists?.errors) continue
        for (const s of subs) {
          const r = await gql(apiKey, `{ campaigns(first: 25) { nodes { ads(first: 10) { nodes { creativesConnection { nodes { ${p} { ${s} } } } } } } } }`)
          if (r?.errors) continue
          if (creativeHasValue(r?.data, [p, s])) { creativeImgPath = [p, s]; creativeSelection = `${p} { ${s} }`; break outerParent }
        }
      }
    }
    if (creativeImgPath) console.log('[StackAdapt] creative image field resolved:', creativeImgPath.join('.'))
  }

  if (!adImagePath && !creativeImgPath) {
    console.log('[StackAdapt] no image field found — images will be blank')
  }

  // Selections spliced into the main campaigns query below.
  const adImageSel = adImageSelection ? `\n            ${adImageSelection}` : ''
  const creativesSelection = creativeSelection
    ? `\n            creativesConnection { nodes { ${creativeSelection} } }`
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
              paused isArchived isDraft isRejected${adImageSel}${creativesSelection}
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

  // Resolve the image URL for an ad: prefer the ad-level field, then fall back to
  // scanning creatives for the first one carrying a value (creatives[0] is
  // sometimes null while a later one holds the asset).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstImageUrl = (n: any): string => {
    if (adImagePath) {
      const v = readPath(n, adImagePath)
      if (typeof v === 'string' && v.length > 0) return v
    }
    if (creativeImgPath) {
      for (const cr of n?.creativesConnection?.nodes ?? []) {
        const v = readPath(cr, creativeImgPath)
        if (typeof v === 'string' && v.length > 0) return v
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
