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

  // Primary query (flat list style)
  const q1 = `{
    campaigns(nativeFilter: {status: {eq: "active"}}) {
      id name status
      lineItems {
        id name status
        creatives {
          id name type status
          imageUrl: image_url
        }
      }
    }
  }`

  // Fallback (nodes/edges pagination style)
  const q2 = `{
    campaigns {
      nodes {
        id name status
        lineItems {
          nodes {
            id name status
            creatives {
              nodes {
                id name type status
                imageUrl
              }
            }
          }
        }
      }
    }
  }`

  try {
    let data = await gql(apiKey, q1)

    if (data.errors?.length) {
      console.warn('[StackAdapt] Primary query failed, trying fallback...')
      data = await gql(apiKey, q2)
    }

    if (data.errors?.length) {
      console.error('[StackAdapt] API error:', data.errors[0]?.message)
      return []
    }

    const campaignsRaw = data.data?.campaigns ?? []
    const campaigns    = Array.isArray(campaignsRaw)
      ? campaignsRaw
      : (campaignsRaw.nodes ?? [])

    for (const camp of campaigns) {
      const lineItemsRaw = camp.lineItems ?? []
      const lineItems    = Array.isArray(lineItemsRaw)
        ? lineItemsRaw
        : (lineItemsRaw.nodes ?? [])

      for (const li of lineItems) {
        const creativesRaw = li.creatives ?? []
        const creatives    = Array.isArray(creativesRaw)
          ? creativesRaw
          : (creativesRaw.nodes ?? [])

        for (const cr of creatives) {
          const imageUrl =
            cr.imageUrl   ??
            cr.image_url  ??
            cr.imageURL   ??
            ''

          const status = (
            cr.status ?? li.status ?? camp.status ?? 'ACTIVE'
          ).toUpperCase()

          ads.push({
            id:       String(cr.id ?? ''),
            name:     cr.name || li.name || camp.name || 'Unnamed',
            status,
            imageUrl,
            headline: camp.name ?? '',
            campaign: camp.name ?? '',
          })
        }
      }
    }
  } catch (err) {
    console.error('[StackAdapt] Fetch failed:', err)
  }

  return ads
}
