import type { Ad } from './types'

const SA_URL = 'https://api.stackadapt.com/graphql'

async function gql(apiKey: string, query: string) {
  const res = await fetch(SA_URL, {
    method: 'POST',
    headers: {
      Authorization:  `token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  })
  return res.json()
}

export async function fetchStackAdaptAds(): Promise<Ad[]> {
  const apiKey = process.env.STACKADAPT_API_KEY
  if (!apiKey) {
    console.warn('[StackAdapt] Missing STACKADAPT_API_KEY')
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
  // Top-level `ads` query rejects our key ("access token invalid") even though
  // introspection works — so the key is scoped to advertiser-level access only.
  // Strategy: list advertisers, introspect Advertiser type to find the ads field,
  // then query ads nested under each advertiser.
  const probe = await gql(apiKey, `{
    advertiserType: __type(name: "Advertiser") {
      fields { name }
    }
    advertisers(first: 50) {
      nodes { id name }
    }
  }`)

  if (probe?.errors) {
    console.error('[StackAdapt] probe errors:', JSON.stringify(probe.errors))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const advertiserFields: string[] = (probe?.data?.advertiserType?.fields ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => f.name)
  console.log('[StackAdapt] Advertiser fields:', advertiserFields.join(', '))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const advertisers: any[] = probe?.data?.advertisers?.nodes ?? []
  console.log(`[StackAdapt] advertisers found: ${advertisers.length}`)
  console.log('[StackAdapt] advertiser names:', advertisers.map(a => a.name).join(' | '))

  if (!advertisers.length) {
    console.warn('[StackAdapt] No advertisers visible to this API key')
    return []
  }

  // Pick the ads-related field name from Advertiser (most likely `ads`)
  const adsField =
    advertiserFields.find(f => f === 'ads') ??
    advertiserFields.find(f => f.toLowerCase() === 'ads') ??
    'ads'

  // Query ads per advertiser, in parallel
  const allAds: Ad[] = []
  await Promise.all(advertisers.map(async (adv) => {
    const advData = await gql(apiKey, `{
      advertiser(id: ${JSON.stringify(adv.id)}) {
        id
        name
        ${adsField}(first: 200) {
          nodes {
            id
            name
            brandname
            channelType
            clickUrl
            creativeSize
            paused
            isArchived
            isDraft
            isRejected
            campaign { id name }
          }
        }
      }
    }`)

    if (advData?.errors) {
      console.error(`[StackAdapt] advertiser ${adv.id} errors:`, JSON.stringify(advData.errors).slice(0, 400))
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = advData?.data?.advertiser?.[adsField]?.nodes ?? []
    console.log(`[StackAdapt] advertiser ${adv.name}: ${nodes.length} total ads`)

    // Active = not paused, not archived, not draft, not rejected
    for (const n of nodes) {
      if (n.paused !== false) continue
      if (n.isArchived === true) continue
      if (n.isDraft === true) continue
      if (n.isRejected === true) continue

      allAds.push({
        id:       String(n.id ?? ''),
        name:     n.name || n.brandname || 'Unnamed',
        status:   'ACTIVE',
        imageUrl: '',
        headline: n.brandname || '',
        campaign: n.campaign?.name || adv.name || '',
      })
    }
  }))

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
