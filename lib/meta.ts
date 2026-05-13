import type { Ad } from './types'

const META_API_VERSION = 'v19.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

// ─── Step 1: spend-first ──────────────────────────────────────────────────────
// /insights returns just ad_id + spend — a tiny payload. We can paginate the
// whole month without ever hitting the "reduce the amount of data" throttle
// that bit the old /ads listing.
type InsightsRow  = { ad_id: string; spend?: string }
type InsightsResp = {
  data?:   InsightsRow[]
  paging?: { next?: string }
  error?:  { message: string; code?: number }
}

async function fetchSpendingAdIds(accountId: string, token: string): Promise<Set<string>> {
  const spendingIds = new Set<string>()
  const fields = 'ad_id,spend'

  let url: string | null =
    `${GRAPH}/${accountId}/insights` +
    `?access_token=${token}` +
    `&level=ad` +
    `&date_preset=this_month` +
    `&fields=${encodeURIComponent(fields)}` +
    `&limit=500`

  while (url) {
    const res:  Response       = await fetch(url, { cache: 'no-store' })
    const data: InsightsResp   = await res.json()

    if (data.error) {
      console.error('[Meta] insights error:', data.error.message)
      break
    }

    for (const row of data.data ?? []) {
      const spend = parseFloat(row.spend ?? '0')
      if (spend > 0 && row.ad_id) spendingIds.add(row.ad_id)
    }
    url = data.paging?.next ?? null
  }

  console.log(`[Meta] ads with spend this month: ${spendingIds.size}`)
  return spendingIds
}

// ─── Step 2: batch ad details by ID ───────────────────────────────────────────
// Meta's `?ids=` endpoint lets us pull up to ~50 objects per call. We only
// fetch details for ads we already know spent money this month.
type AdCreative = {
  image_url?: string
  thumbnail_url?: string
  image_hash?: string
  object_story_spec?: {
    link_data?: {
      picture?: string
      image_hash?: string
      child_attachments?: Array<{ picture?: string; image_hash?: string }>
    }
    video_data?: { image_url?: string; image_hash?: string }
  }
  asset_feed_spec?: {
    images?: Array<{ url?: string; hash?: string }>
  }
}
type AdDetail = {
  id: string
  name?: string
  status?: string
  effective_status?: string
  creative?: AdCreative
  campaign?: { name?: string }
}

/**
 * Walk every known place a Meta ad creative might hide its image, in
 * roughly best-to-worst-quality order. Returns the first non-empty URL.
 *
 * Most boosted page posts only expose `object_story_spec.link_data.picture`.
 * Most video ads only expose `object_story_spec.video_data.image_url` or
 * the (now sized) `thumbnail_url`. DPA / dynamic creatives expose
 * `asset_feed_spec.images[].url`. Carousel ads have child_attachments.
 * Static image ads expose `image_url` outright.
 *
 * Previous fixes only checked image_url and thumbnail_url — explains why
 * blur stuck around for the dominant ad types on most accounts.
 */
function pickCreativeImage(c: AdCreative | undefined): string {
  if (!c) return ''
  const oss        = c.object_story_spec ?? {}
  const linkData   = oss.link_data       ?? {}
  const videoData  = oss.video_data      ?? {}
  const carouselFirst = linkData.child_attachments?.[0]?.picture
  const dpaFirst      = c.asset_feed_spec?.images?.[0]?.url

  return (
    c.image_url        ||
    linkData.picture   ||
    carouselFirst      ||
    videoData.image_url||
    dpaFirst           ||
    c.thumbnail_url    ||
    ''
  )
}

async function fetchAdDetails(ids: string[], token: string): Promise<Ad[]> {
  if (!ids.length) return []

  // Broad creative expansion — covers static / boosted-post / video /
  // carousel / dynamic creatives. The cascade in pickCreativeImage() picks
  // whichever one Meta actually returned for each ad type.
  const fields =
    'id,name,status,effective_status,' +
    'creative{' +
      'image_url,thumbnail_url,image_hash,' +
      'object_story_spec{' +
        'link_data{picture,image_hash,child_attachments{picture,image_hash}},' +
        'video_data{image_url,image_hash}' +
      '},' +
      'asset_feed_spec{images{url,hash}}' +
    '},' +
    'campaign{name}'
  const THUMB_SIZE = 600
  const ads: Ad[] = []
  const CHUNK = 50

  let loggedSample = false

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const url =
      `${GRAPH}/` +
      `?ids=${slice.join(',')}` +
      `&fields=${encodeURIComponent(fields)}` +
      // Belt + suspenders: the URL-level thumbnail size params resize
      // thumbnail_url at the source. Field-level `.width()` modifiers were
      // unreliable inside batch ?ids= requests in testing.
      `&thumbnail_width=${THUMB_SIZE}` +
      `&thumbnail_height=${THUMB_SIZE}` +
      `&access_token=${token}`

    const res = await fetch(url, { cache: 'no-store' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()

    if (data?.error) {
      console.error('[Meta] details error:', data.error.message)
      continue
    }

    // One-time diagnostic: dump the first ad's creative shape so we can
    // *see* which field Meta is actually populating. This is the missing
    // step from prior fixes — we were assuming, not verifying.
    if (!loggedSample) {
      const sampleId = slice[0]
      const sample   = data?.[sampleId]
      if (sample?.creative) {
        const c = sample.creative as AdCreative
        console.log('[Meta] sample creative fields:', JSON.stringify({
          image_url:         !!c.image_url,
          thumbnail_url:     !!c.thumbnail_url,
          link_picture:      !!c.object_story_spec?.link_data?.picture,
          carousel_first:    !!c.object_story_spec?.link_data?.child_attachments?.[0]?.picture,
          video_image_url:   !!c.object_story_spec?.video_data?.image_url,
          dpa_first:         !!c.asset_feed_spec?.images?.[0]?.url,
        }))
        const picked = pickCreativeImage(c)
        console.log('[Meta] sample picked URL:', picked.slice(0, 160) || '(none)')
      }
      loggedSample = true
    }

    for (const adId of slice) {
      const ad: AdDetail | undefined = data?.[adId]
      if (!ad) continue
      const effective = (ad.effective_status || ad.status || '').toUpperCase()
      // Live-only: ignore ads that spent earlier in the month but are now paused
      if (effective !== 'ACTIVE') continue
      ads.push({
        id:       ad.id,
        name:     ad.name || 'Unnamed Ad',
        status:   effective,
        imageUrl: pickCreativeImage(ad.creative),
        headline: '',
        campaign: ad.campaign?.name || '',
      })
    }
  }

  return ads
}

// ─── Public entry point ───────────────────────────────────────────────────────
export async function fetchMetaAds(): Promise<Ad[]> {
  const token     = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  if (!token || !accountId) {
    console.warn('[Meta] Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID')
    return []
  }

  try {
    const spendingIds = await fetchSpendingAdIds(accountId, token)
    if (!spendingIds.size) {
      console.log('[Meta] no ads spent this month — nothing to show')
      return []
    }

    const ads = await fetchAdDetails(Array.from(spendingIds), token)
    console.log(`[Meta] live ads with spend this month: ${ads.length}`)
    return ads
  } catch (err) {
    console.error('[Meta] Fetch failed:', err)
    return []
  }
}
