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
  // The key rejects both top-level `ads` AND `advertisers`. Introspection works.
  // Step 1: figure out what this key CAN access via tokenInfo + type introspection
  const scopeProbe = await gql(apiKey, `{
    tokenInfoType: __type(name: "TokenInfo") {
      fields { name type { name kind ofType { name } } }
    }
    accountType: __type(name: "Account") {
      fields { name type { name kind ofType { name } } }
    }
    campaignType: __type(name: "Campaign") {
      fields { name }
    }
  }`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenInfoFields: string[] = (scopeProbe?.data?.tokenInfoType?.fields ?? []).map((f: any) => f.name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountFields: string[] = (scopeProbe?.data?.accountType?.fields ?? []).map((f: any) => f.name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignFields: string[] = (scopeProbe?.data?.campaignType?.fields ?? []).map((f: any) => f.name)

  console.log('[StackAdapt] TokenInfo fields:', tokenInfoFields.join(', '))
  console.log('[StackAdapt] Account fields:',   accountFields.join(', '))
  console.log('[StackAdapt] Campaign fields:',  campaignFields.join(', '))

  // Step 2: build a tokenInfo query using only fields that exist (avoids subfield errors)
  const safeTokenInfoFields = tokenInfoFields
    .filter(f => ['id', 'name', 'email', 'scope', 'scopes', 'permissions', 'role', 'userId', 'accountId', 'advertiserId', 'type'].includes(f))
    .join(' ')

  const tokenProbe = await gql(apiKey, `{
    tokenInfo { ${safeTokenInfoFields} }
    account { id name }
    campaigns(first: 5) { nodes { id name } }
  }`)

  console.log('[StackAdapt] tokenInfo:', String(JSON.stringify(tokenProbe?.data?.tokenInfo ?? null)).slice(0, 400))
  console.log('[StackAdapt] account:',   String(JSON.stringify(tokenProbe?.data?.account ?? null)).slice(0, 400))
  console.log('[StackAdapt] campaigns sample:', String(JSON.stringify(tokenProbe?.data?.campaigns ?? null)).slice(0, 600))

  if (tokenProbe?.errors) {
    console.error('[StackAdapt] tokenProbe errors:', JSON.stringify(tokenProbe.errors).slice(0, 600))
  }

  // Step 3: if campaigns work, get the ads via campaigns. If not, bail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignNodes: any[] = tokenProbe?.data?.campaigns?.nodes ?? []
  if (!campaignNodes.length) {
    console.warn('[StackAdapt] No campaigns accessible — key scope too limited or no data')
    return []
  }

  // Check if Campaign type has an `ads` field
  const adsFieldOnCampaign = campaignFields.find(f => f === 'ads' || f === 'creatives' || f.toLowerCase().includes('ad'))
  console.log('[StackAdapt] ads-related field on Campaign:', adsFieldOnCampaign ?? 'NONE')

  if (!adsFieldOnCampaign) {
    console.warn('[StackAdapt] Campaign type has no ads field — need different approach')
    return []
  }

  // Query ads via campaigns (paginated)
  const probe = await gql(apiKey, `{
    campaigns(first: 50) {
      nodes {
        id
        name
        ${adsFieldOnCampaign}(first: 100) {
          nodes {
            id name brandname channelType clickUrl creativeSize
            paused isArchived isDraft isRejected
          }
        }
      }
    }
  }`)

  if (probe?.errors) {
    console.error('[StackAdapt] campaigns->ads probe errors:', JSON.stringify(probe.errors).slice(0, 600))
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaigns: any[] = probe?.data?.campaigns?.nodes ?? []
  console.log(`[StackAdapt] campaigns scanned: ${campaigns.length}`)

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
        imageUrl: '',
        headline: n.brandname || '',
        campaign: camp.name || '',
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
