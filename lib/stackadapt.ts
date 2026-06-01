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

export async function fetchStackAdaptAds(creds: { apiKey: string }): Promise<Ad[]> {
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
      return await queryAds(apiKey)
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

async function queryAds(apiKey: string): Promise<Ad[]> {
  // Introspect the Ad type to find the real image field name before querying.
  const adTypeProbe = await gql(apiKey, `{ adType: __type(name: "Ad") { fields { name } } }`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adFields: string[] = (adTypeProbe?.data?.adType?.fields ?? []).map((f: any) => f.name)
  console.log('[StackAdapt] Ad type fields:', adFields.join(', '))

  // Pick whichever image field the schema actually exposes
  const imgField = ['image_url', 'imageUrl', 'previewUrl', 'preview_url', 'thumbnailUrl', 'thumbnail_url']
    .find(f => adFields.includes(f)) ?? null
  console.log('[StackAdapt] image field:', imgField)

  const imageSelection = imgField ? `\n            ${imgField}` : ''

  const probe = await gql(apiKey, `{
    campaigns(first: 100) {
      nodes {
        id
        name
        isArchived
        isDraft
        ads(first: 200) {
          nodes {
            id name brandname channelType clickUrl creativeSize
            paused isArchived isDraft isRejected${imageSelection}
          }
        }
      }
    }
  }`)

  if (probe?.errors) {
    const errStr = JSON.stringify(probe.errors).slice(0, 600)
    const isTokenInvalid = /access token is invalid|unauthor|forbidden/i.test(errStr)
    if (isTokenInvalid) {
      console.error(
        '[StackAdapt] Token can introspect schema but cannot read campaign data.\n' +
        '  → Regenerate STACKADAPT_API_KEY in the StackAdapt UI with full read scope ' +
        'on the target advertiser(s). The current key is scoped too narrowly.'
      )
    } else {
      console.error('[StackAdapt] campaigns->ads errors:', errStr)
    }
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCampaigns: any[] = probe?.data?.campaigns?.nodes ?? []
  // Skip archived/draft campaigns — their ads aren't running
  const campaigns = allCampaigns.filter(c => c.isArchived === false && c.isDraft === false)
  console.log(`[StackAdapt] campaigns: ${allCampaigns.length} total, ${campaigns.length} active`)

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
        imageUrl: (imgField ? n[imgField] : null) || '',
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
