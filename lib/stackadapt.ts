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
  // Step 1: introspect the Ad type to see real field names. The error messages
  // told us `state`, `imageUrl`, `previewUrl`, `creativeType` don't exist.
  // `creativeStatus` is suggested. Let's see what else is there before guessing.
  const typeQuery = `{
    __type(name: "Ad") {
      fields { name type { name kind ofType { name } } }
    }
  }`
  const typeData = await gql(apiKey, typeQuery)
  const adFields: Array<{ name: string }> = typeData?.data?.__type?.fields ?? []
  const fieldNames = adFields.map(f => f.name)
  console.log('[StackAdapt] Ad type fields:', fieldNames.join(', '))

  // Pick fields we know exist, fall back gracefully
  const has = (n: string) => fieldNames.includes(n)
  const safeFields = [
    'id',
    has('name')           ? 'name' : null,
    has('creativeStatus') ? 'creativeStatus' : null,
    has('creativeSize')   ? 'creativeSize' : null,
    // Try common image field names — only include ones that exist
    has('thumbnailUrl')   ? 'thumbnailUrl' : null,
    has('mediaUrl')       ? 'mediaUrl' : null,
    has('imageUrl')       ? 'imageUrl' : null,
    has('previewUrl')     ? 'previewUrl' : null,
    has('image')          ? 'image' : null,
    has('asset')          ? 'asset' : null,
    has('destinationUrl') ? 'destinationUrl' : null,
    has('headline')       ? 'headline' : null,
    has('title')          ? 'title' : null,
  ].filter(Boolean).join('\n        ')

  // Step 2: actually query the ads
  const data = await gql(apiKey, `{
    ads(first: 200) {
      nodes {
        ${safeFields}
      }
    }
  }`)

  console.log('[StackAdapt] ads response:', JSON.stringify(data).slice(0, 1200))

  if (data?.errors) {
    console.error('[StackAdapt] GraphQL errors:', JSON.stringify(data.errors))
    return []
  }

  const nodes = data?.data?.ads?.nodes ?? data?.data?.ads?.edges?.map((e: any) => e.node) ?? []

  // Active only — `creativeStatus` is StackAdapt's status field
  return nodes
    .filter((n: any) => {
      const status = (n.creativeStatus ?? '').toString().toLowerCase()
      return status === 'active' || status === 'enabled' || status === 'live'
    })
    .map((n: any) => {
      // Try multiple field shapes for the image
      const imageUrl =
        n.thumbnailUrl ||
        n.mediaUrl ||
        n.imageUrl ||
        n.previewUrl ||
        n.image?.url ||
        n.asset?.url ||
        ''
      return {
        id:       String(n.id ?? ''),
        name:     n.name || n.headline || n.title || 'Unnamed',
        status:   (n.creativeStatus ?? 'ACTIVE').toString().toUpperCase(),
        imageUrl,
        headline: n.headline || n.title || '',
        campaign: '',
      }
    })
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
