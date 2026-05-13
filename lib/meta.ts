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
  // Ad-level `picture` field with `.width().height()` modifiers — Meta renders
  // a sharp preview at the requested size for *any* ad type (static, boosted,
  // video, carousel, DPA). This is the key fix for the non-boosted-post blur.
  picture?: string
  creative?: AdCreative
  campaign?: { name?: string }
}

type ImageSource =
  | 'creative.image_url'
  | 'ad.picture'
  | 'link_data.picture'
  | 'child_attachments[0].picture'
  | 'video_data.image_url'
  | 'asset_feed_spec.images[0].url'
  | 'creative.thumbnail_url'
  | 'none'

/**
 * Cascade through every known place a Meta ad might expose its image, in
 * best-to-worst quality order. Returns the chosen URL **and** which field
 * served it — so the per-source log breakdown can tell us which path each
 * ad type takes.
 *
 * Field map by ad type, with what each typically returns:
 *   • static image →   creative.image_url (full res)
 *   • boosted post →   object_story_spec.link_data.picture (confirmed sharp)
 *   • video       →   object_story_spec.video_data.image_url (cover)
 *   • carousel    →   object_story_spec.link_data.child_attachments[0].picture
 *   • DPA/feed    →   asset_feed_spec.images[0].url
 *   • any of the above → ad.picture.width(800).height(800) — Meta-rendered
 *     preview at 800px, works as a high-quality fallback for *anything*.
 */
function pickImageUrl(ad: AdDetail): { url: string; source: ImageSource } {
  const c          = ad.creative           ?? {}
  const oss        = c.object_story_spec   ?? {}
  const linkData   = oss.link_data         ?? {}
  const videoData  = oss.video_data        ?? {}
  const carouselFirst = linkData.child_attachments?.[0]?.picture
  const dpaFirst      = c.asset_feed_spec?.images?.[0]?.url

  if (c.image_url)        return { url: c.image_url,        source: 'creative.image_url' }
  if (ad.picture)         return { url: ad.picture,         source: 'ad.picture' }
  if (linkData.picture)   return { url: linkData.picture,   source: 'link_data.picture' }
  if (carouselFirst)      return { url: carouselFirst,      source: 'child_attachments[0].picture' }
  if (videoData.image_url) return { url: videoData.image_url, source: 'video_data.image_url' }
  if (dpaFirst)           return { url: dpaFirst,           source: 'asset_feed_spec.images[0].url' }
  if (c.thumbnail_url)    return { url: c.thumbnail_url,    source: 'creative.thumbnail_url' }
  return { url: '', source: 'none' }
}

async function fetchAdDetails(ids: string[], token: string): Promise<Ad[]> {
  if (!ids.length) return []

  // Broad expansion — ad-level `picture.width(800).height(800)` is the key
  // new piece: it asks Meta to render a sharp 800px preview of *any* ad
  // (boosted, video, carousel, DPA) and exposes it on the ad object. The
  // creative subfields stay as type-specific fallbacks.
  const fields =
    'id,name,status,effective_status,' +
    'picture.width(800).height(800),' +
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

  // Track which field served each ad's image so we can see the breakdown
  // in the Vercel logs. If video/carousel are still blurry after this, the
  // per-source counts will tell us exactly which fallback is dominant.
  const sourceCounts: Partial<Record<ImageSource, number>> = {}
  const sampleUrls: string[] = []

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const url =
      `${GRAPH}/` +
      `?ids=${slice.join(',')}` +
      `&fields=${encodeURIComponent(fields)}` +
      // Belt + suspenders for the thumbnail_url last-resort fallback.
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

    for (const adId of slice) {
      const ad: AdDetail | undefined = data?.[adId]
      if (!ad) continue
      const effective = (ad.effective_status || ad.status || '').toUpperCase()
      // Live-only: ignore ads that spent earlier in the month but are now paused
      if (effective !== 'ACTIVE') continue

      const picked = pickImageUrl(ad)
      sourceCounts[picked.source] = (sourceCounts[picked.source] ?? 0) + 1
      if (sampleUrls.length < 3 && picked.url) sampleUrls.push(picked.url.slice(0, 160))

      ads.push({
        id:       ad.id,
        name:     ad.name || 'Unnamed Ad',
        status:   effective,
        imageUrl: picked.url,
        headline: '',
        campaign: ad.campaign?.name || '',
      })
    }
  }

  console.log('[Meta] image source breakdown:', JSON.stringify(sourceCounts))
  for (const u of sampleUrls) console.log('[Meta] sample picked URL:', u)

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
