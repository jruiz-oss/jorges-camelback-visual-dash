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
  // Real Ad type fields (from prior introspection):
  // brandname, campaign, channelType, clickUrl, creativeSize, creativeStatus,
  // id, impressionTrackers, isArchived, isDraft, isRejected, name, paused,
  // rejectReasons, userMetadata
  //
  // Note: no image field on Ad — preview imagery likely lives in adTag or a
  // sub-resource. Skipping image for now; can add later by querying adTag(id: ...)
  const data = await gql(apiKey, `{
    ads(first: 200) {
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
  }`)

  console.log('[StackAdapt] ads response (first 800):', JSON.stringify(data).slice(0, 800))

  if (data?.errors) {
    console.error('[StackAdapt] GraphQL errors:', JSON.stringify(data.errors))
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] =
    data?.data?.ads?.nodes ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?.data?.ads?.edges?.map((e: any) => e.node) ?? []

  console.log(`[StackAdapt] total nodes: ${nodes.length}`)

  // Active = not paused, not archived, not draft, not rejected
  const active = nodes.filter(n =>
    n.paused === false &&
    n.isArchived === false &&
    n.isDraft === false &&
    n.isRejected === false
  )

  console.log(`[StackAdapt] active ads: ${active.length}`)

  return active.map(n => ({
    id:       String(n.id ?? ''),
    name:     n.name || n.brandname || 'Unnamed',
    status:   'ACTIVE',
    imageUrl: '', // no image field on Ad — add later via adTag if needed
    headline: n.brandname || '',
    campaign: n.campaign?.name || '',
  }))
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
