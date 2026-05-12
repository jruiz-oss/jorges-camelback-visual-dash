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

  const ads: Ad[] = []

  // Try querying creatives directly (flat schema)
  const q1 = `{
    creatives {
      id
      name
      type
      status
      imageUrl
    }
  }`

  // Fallback with nodes pagination
  const q2 = `{
    creatives {
      nodes {
        id
        name
        type
        status
        imageUrl
      }
    }
  }`

  // Second fallback — image_url alias
  const q3 = `{
    creatives {
      nodes {
        id
        name
        type
        status
        imageUrl: image_url
      }
    }
  }`

  try {
    let data = await gql(apiKey, q1)

    if (data.errors?.length) {
      console.warn('[StackAdapt] q1 failed, trying q2...')
      data = await gql(apiKey, q2)
    }

    if (data.errors?.length) {
      console.warn('[StackAdapt] q2 failed, trying q3...')
      data = await gql(apiKey, q3)
    }

    if (data.errors?.length) {
      console.error('[StackAdapt] All queries failed:', data.errors[0]?.message)
      return []
    }

    const creativesRaw = data.data?.creatives ?? []
    const creatives = Array.isArray(creativesRaw)
      ? creativesRaw
      : (creativesRaw.nodes ?? [])

    for (const cr of creatives) {
      const imageUrl =
        cr.imageUrl  ??
        cr.image_url ??
        cr.imageURL  ??
        ''

      const status = (cr.status ?? 'ACTIVE').toUpperCase()

      ads.push({
        id:       String(cr.id ?? ''),
        name:     cr.name || 'Unnamed Creative',
        status,
        imageUrl,
        headline: '',
        campaign: '',
      })
    }
  } catch (err) {
    console.error('[StackAdapt] Fetch failed:', err)
  }

  return ads
}
