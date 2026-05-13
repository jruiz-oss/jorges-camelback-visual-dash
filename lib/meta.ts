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
  // Top-level fallback text fields
  title?: string
  body?: string
  object_story_spec?: {
    link_data?: {
      picture?: string
      image_hash?: string
      // Text fields — `message` is the post body (the "caption" above the image)
      // `name` is the headline (below image), `description` is the sub-headline
      name?: string
      message?: string
      description?: string
      child_attachments?: Array<{
        picture?: string
        image_hash?: string
        video_id?: string
        name?: string
        description?: string
      }>
    }
    video_data?: {
      image_url?: string
      image_hash?: string
      video_id?: string
      title?: string
      message?: string
      description?: string
    }
  }
  asset_feed_spec?: {
    images?: Array<{ url?: string; hash?: string }>
    videos?: Array<{ video_id?: string; thumbnail_url?: string; thumbnail_hash?: string }>
    // Dynamic creative variants — every "asset" the advertiser uploaded.
    // We treat each as a separate card, same way PMax explodes asset groups.
    bodies?:       Array<{ text?: string }>
    titles?:       Array<{ text?: string }>
    descriptions?: Array<{ text?: string }>
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

type ImageSource =
  | 'adimages(creative.image_hash)'
  | 'adimages(link_data.image_hash)'
  | 'adimages(video_data.image_hash)'
  | 'adimages(carousel.image_hash)'
  | 'adimages(dpa.hash)'
  | 'adimages(asset_feed_video.thumbnail_hash)'
  | 'video.thumbnails(video_data)'
  | 'video.thumbnails(carousel)'
  | 'video.thumbnails(asset_feed)'
  | 'creative.image_url'
  | 'link_data.picture'
  | 'child_attachments[0].picture'
  | 'video_data.image_url'
  | 'asset_feed_spec.images[0].url'
  | 'asset_feed_spec.videos[0].thumbnail_url'
  | 'creative.thumbnail_url'
  | 'none'

// Walk every creative subfield that might carry an image_hash, populating the
// out set in place. Hashes get batch-looked-up via /adimages later — that
// endpoint returns the original full-resolution URL for every uploaded image.
function collectHashes(ad: AdDetail, out: Set<string>): void {
  const c   = ad.creative; if (!c) return
  if (c.image_hash) out.add(c.image_hash)
  const oss = c.object_story_spec
  if (oss) {
    const ld = oss.link_data
    if (ld?.image_hash) out.add(ld.image_hash)
    for (const ch of ld?.child_attachments ?? []) {
      if (ch.image_hash) out.add(ch.image_hash)
    }
    const vd = oss.video_data
    if (vd?.image_hash) out.add(vd.image_hash)
  }
  for (const img of c.asset_feed_spec?.images ?? []) {
    if (img.hash) out.add(img.hash)
  }
  for (const vid of c.asset_feed_spec?.videos ?? []) {
    if (vid.thumbnail_hash) out.add(vid.thumbnail_hash)
  }
}

// Walk every creative subfield that might carry a video_id. We need these so we
// can fetch the video's `thumbnails` edge — which exposes multiple sizes including
// originals (~720p+). Without this, video ads fall back to `video_data.image_url`,
// a low-res auto-thumbnail (~400px) that looks pixelated in the dashboard.
function collectVideoIds(ad: AdDetail, out: Set<string>): void {
  const c = ad.creative; if (!c) return
  const oss = c.object_story_spec
  if (oss) {
    const vd = oss.video_data
    if (vd?.video_id) out.add(vd.video_id)
    const ld = oss.link_data
    for (const ch of ld?.child_attachments ?? []) {
      if (ch.video_id) out.add(ch.video_id)
    }
  }
  for (const v of c.asset_feed_spec?.videos ?? []) {
    if (v.video_id) out.add(v.video_id)
  }
}

/**
 * Batch-lookup every uploaded image in the account by hash. `/{account_id}/adimages`
 * returns { hash, url } for each, where `url` is the original-upload URL
 * (typically 1080p+). This is the *same source* Meta uses internally for
 * Ads Manager thumbnails and is the cleanest way to get a sharp image for
 * any ad type — boosted post, video, carousel, DPA.
 *
 * Chunked to 100 hashes per request to keep the URL size sane.
 */
async function fetchAdImageUrls(
  accountId: string, token: string, hashes: Set<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (hashes.size === 0) return map
  const all = Array.from(hashes)
  const CHUNK = 100

  for (let i = 0; i < all.length; i += CHUNK) {
    const slice  = all.slice(i, i + CHUNK)
    const param  = encodeURIComponent(JSON.stringify(slice))
    const url    = `${GRAPH}/${accountId}/adimages?hashes=${param}&fields=hash,url&access_token=${token}`
    try {
      const res = await fetch(url, { cache: 'no-store' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data?.error) {
        console.warn('[Meta] adimages error:', data.error.message)
        continue
      }
      for (const img of data.data ?? []) {
        if (img.hash && img.url) map.set(img.hash, img.url)
      }
    } catch (err) {
      console.warn('[Meta] adimages fetch threw:', err)
    }
  }
  console.log(`[Meta] adimages resolved ${map.size}/${hashes.size} hashes`)
  return map
}

/**
 * Batch-resolve `video_id` → best available thumbnail URL.
 *
 * The `thumbnails` edge on a Video node returns several sizes (Meta generates
 * frames at multiple resolutions when a video is uploaded). The largest one
 * is typically the full source-frame ~720–1080px wide — vastly better than
 * `video_data.image_url`, which is the legacy ~400px square auto-thumbnail.
 *
 * This is THE fix for the persistent "video ad previews look pixelated" bug:
 * video creatives usually don't have a custom-cover `image_hash`, so without
 * fetching the video's own thumbnails edge there's nothing high-res to fall
 * back to.
 *
 * Batched with `?ids=` so N videos cost 1 request per 50.
 */
type VideoThumbnail = {
  uri?: string
  width?: number
  height?: number
  is_preferred?: boolean
}
async function fetchVideoThumbnails(
  videoIds: Set<string>, token: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (videoIds.size === 0) return map
  const all = Array.from(videoIds)
  const CHUNK = 50

  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK)
    const url =
      `${GRAPH}/?ids=${slice.join(',')}` +
      `&fields=${encodeURIComponent('thumbnails{uri,width,height,is_preferred}')}` +
      `&access_token=${token}`
    try {
      const res = await fetch(url, { cache: 'no-store' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data?.error) {
        console.warn('[Meta] video thumbnails error:', data.error.message)
        continue
      }
      for (const videoId of slice) {
        const node = data?.[videoId]
        const thumbs: VideoThumbnail[] = node?.thumbnails?.data ?? []
        const usable = thumbs.filter(t => !!t.uri)
        if (!usable.length) continue
        // Largest by width wins; on ties prefer is_preferred=true.
        const best = usable.sort((a, b) => {
          const wa = a.width ?? 0
          const wb = b.width ?? 0
          if (wb !== wa) return wb - wa
          return (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0)
        })[0]
        if (best?.uri) map.set(videoId, best.uri)
      }
    } catch (err) {
      console.warn('[Meta] video thumbnails fetch threw:', err)
    }
  }
  console.log(`[Meta] video thumbnails resolved ${map.size}/${videoIds.size}`)
  return map
}

/**
 * Cascade through every known place a Meta ad might expose its image. Hash-
 * resolved URLs (originals via /adimages) come first because they're the
 * highest quality available, then video.thumbnails (originals), then direct
 * URL fields as last-ditch fallbacks.
 */
function pickImageUrl(
  ad: AdDetail,
  hashToUrl: Map<string, string>,
  videoIdToThumb: Map<string, string>,
): { url: string; source: ImageSource } {
  const c        = ad.creative           ?? {}
  const oss      = c.object_story_spec   ?? {}
  const ld       = oss.link_data         ?? {}
  const vd       = oss.video_data        ?? {}

  // Priority 1: hash-resolved originals (always full-res uploads).
  if (c.image_hash && hashToUrl.get(c.image_hash)) {
    return { url: hashToUrl.get(c.image_hash)!, source: 'adimages(creative.image_hash)' }
  }
  if (ld.image_hash && hashToUrl.get(ld.image_hash)) {
    return { url: hashToUrl.get(ld.image_hash)!, source: 'adimages(link_data.image_hash)' }
  }
  if (vd.image_hash && hashToUrl.get(vd.image_hash)) {
    return { url: hashToUrl.get(vd.image_hash)!, source: 'adimages(video_data.image_hash)' }
  }
  for (const ch of ld.child_attachments ?? []) {
    if (ch.image_hash && hashToUrl.get(ch.image_hash)) {
      return { url: hashToUrl.get(ch.image_hash)!, source: 'adimages(carousel.image_hash)' }
    }
  }
  for (const img of c.asset_feed_spec?.images ?? []) {
    if (img.hash && hashToUrl.get(img.hash)) {
      return { url: hashToUrl.get(img.hash)!, source: 'adimages(dpa.hash)' }
    }
  }
  for (const v of c.asset_feed_spec?.videos ?? []) {
    if (v.thumbnail_hash && hashToUrl.get(v.thumbnail_hash)) {
      return {
        url: hashToUrl.get(v.thumbnail_hash)!,
        source: 'adimages(asset_feed_video.thumbnail_hash)',
      }
    }
  }

  // Priority 2: video.thumbnails — full-frame ~720–1080p auto thumbnails.
  // Vastly better than the legacy `video_data.image_url` low-res fallback.
  if (vd.video_id && videoIdToThumb.get(vd.video_id)) {
    return { url: videoIdToThumb.get(vd.video_id)!, source: 'video.thumbnails(video_data)' }
  }
  for (const ch of ld.child_attachments ?? []) {
    if (ch.video_id && videoIdToThumb.get(ch.video_id)) {
      return { url: videoIdToThumb.get(ch.video_id)!, source: 'video.thumbnails(carousel)' }
    }
  }
  for (const v of c.asset_feed_spec?.videos ?? []) {
    if (v.video_id && videoIdToThumb.get(v.video_id)) {
      return { url: videoIdToThumb.get(v.video_id)!, source: 'video.thumbnails(asset_feed)' }
    }
  }

  // Priority 3: direct URL fields exposed by the creative.
  if (c.image_url)         return { url: c.image_url,        source: 'creative.image_url' }
  if (ld.picture)          return { url: ld.picture,         source: 'link_data.picture' }
  const carouselFirst = ld.child_attachments?.[0]?.picture
  if (carouselFirst)       return { url: carouselFirst,      source: 'child_attachments[0].picture' }
  if (vd.image_url)        return { url: vd.image_url,       source: 'video_data.image_url' }
  const dpaFirst = c.asset_feed_spec?.images?.[0]?.url
  if (dpaFirst)            return { url: dpaFirst,           source: 'asset_feed_spec.images[0].url' }
  const dpaVideoThumb = c.asset_feed_spec?.videos?.[0]?.thumbnail_url
  if (dpaVideoThumb)       return { url: dpaVideoThumb,      source: 'asset_feed_spec.videos[0].thumbnail_url' }
  if (c.thumbnail_url)     return { url: c.thumbnail_url,    source: 'creative.thumbnail_url' }
  return { url: '', source: 'none' }
}

/**
 * Pull every piece of ad copy out of a Meta creative and split it into two
 * buckets: headlines (the short title/link name shown under the image) and
 * descriptions (the longer post body / caption — where the offer usually is).
 *
 * We check every place Meta might stash text: top-level creative, link_data,
 * video_data, and asset_feed_spec (dynamic creative variants). De-duped
 * because the same copy often repeats across fields. Order matters: the most
 * "primary" source for each bucket goes first so headlines[0]/descriptions[0]
 * is what shows when an ad has only one card.
 */
function extractCreativeText(ad: AdDetail): {
  headlines: string[]
  descriptions: string[]
} {
  const headlines: string[] = []
  const descriptions: string[] = []
  const push = (arr: string[], val?: string) => {
    const v = (val ?? '').trim()
    if (v && !arr.includes(v)) arr.push(v)
  }

  const c   = ad.creative           ?? {}
  const oss = c.object_story_spec   ?? {}
  const ld  = oss.link_data         ?? {}
  const vd  = oss.video_data        ?? {}
  const afs = c.asset_feed_spec     ?? {}

  // ── Headlines (short title shown under the image) ──
  push(headlines, ld.name)
  push(headlines, vd.title)
  push(headlines, c.title)
  for (const t of afs.titles ?? []) push(headlines, t.text)
  for (const ch of ld.child_attachments ?? []) push(headlines, ch.name)

  // ── Descriptions / captions (the body copy — what the user wants visible) ──
  // Order: post body/message first (this is the caption with offers),
  // then dynamic-creative bodies, then short sub-descriptions last.
  push(descriptions, ld.message)
  push(descriptions, vd.message)
  push(descriptions, c.body)
  for (const b of afs.bodies ?? []) push(descriptions, b.text)
  push(descriptions, ld.description)
  push(descriptions, vd.description)
  for (const d of afs.descriptions ?? []) push(descriptions, d.text)
  for (const ch of ld.child_attachments ?? []) push(descriptions, ch.description)

  return { headlines, descriptions }
}

async function fetchAdDetails(
  ids: string[], token: string, accountId: string,
): Promise<Ad[]> {
  if (!ids.length) return []

  // Removed the previously-broken `picture` field — that's a Page-level
  // field, not Ad-level, and including it caused Meta to error the entire
  // batch with (#100) Tried accessing nonexisting field (picture).
  //
  // Text fields added so the UI can show the caption (post body) + headline,
  // matching how PMax displays its headlines/descriptions on Google. Pulled
  // from every place Meta might stash them: top-level creative, link_data,
  // video_data, and asset_feed_spec (for dynamic creative variants).
  const fields =
    'id,name,status,effective_status,' +
    'creative{' +
      'image_url,thumbnail_url,image_hash,' +
      'title,body,' +
      'object_story_spec{' +
        'link_data{picture,image_hash,name,message,description,' +
          'child_attachments{picture,image_hash,video_id,name,description}},' +
        'video_data{image_url,image_hash,video_id,title,message,description}' +
      '},' +
      'asset_feed_spec{' +
        'images{url,hash},' +
        'videos{video_id,thumbnail_url,thumbnail_hash},' +
        'bodies{text},titles{text},descriptions{text}' +
      '}' +
    '},' +
    'campaign{name}'
  // Fallback thumbnail size — bumped from 600 → 1080 so the last-resort
  // `creative.thumbnail_url` path returns a sharp image too. Meta caps this
  // for some ad types but ignoring a too-large request is safe.
  const THUMB_SIZE = 1080
  const CHUNK = 50

  // Pass 1 — pull raw ad details in batches.
  const rawDetails: AdDetail[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const url =
      `${GRAPH}/` +
      `?ids=${slice.join(',')}` +
      `&fields=${encodeURIComponent(fields)}` +
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
      const ad = data?.[adId] as AdDetail | undefined
      if (ad) rawDetails.push(ad)
    }
  }

  // Pass 2 — collect every image_hash and video_id referenced anywhere.
  const hashes   = new Set<string>()
  const videoIds = new Set<string>()
  for (const ad of rawDetails) {
    collectHashes(ad, hashes)
    collectVideoIds(ad, videoIds)
  }

  // Pass 3 — batch-resolve in parallel:
  //   • hashes   → original-upload URLs (image creatives, custom video covers)
  //   • videoIds → largest available frame thumbnail (auto-generated covers)
  const [hashToUrl, videoIdToThumb] = await Promise.all([
    fetchAdImageUrls(accountId, token, hashes),
    fetchVideoThumbnails(videoIds, token),
  ])

  // Pass 4 — build final Ad[] using the hash map + video thumbnail map + cascade.
  const ads: Ad[] = []
  const sourceCounts: Partial<Record<ImageSource, number>> = {}
  const sampleUrls: string[] = []

  for (const ad of rawDetails) {
    const effective = (ad.effective_status || ad.status || '').toUpperCase()
    // Live-only: drop ads that spent earlier in the month but are now paused
    if (effective !== 'ACTIVE') continue

    const picked = pickImageUrl(ad, hashToUrl, videoIdToThumb)
    sourceCounts[picked.source] = (sourceCounts[picked.source] ?? 0) + 1
    if (sampleUrls.length < 3 && picked.url) sampleUrls.push(picked.url.slice(0, 160))

    const { headlines, descriptions } = extractCreativeText(ad)

    ads.push({
      id:           ad.id,
      name:         ad.name || 'Unnamed Ad',
      status:       effective,
      imageUrl:     picked.url,
      headline:     headlines[0] ?? '',
      headlines:    headlines.length    ? headlines    : undefined,
      descriptions: descriptions.length ? descriptions : undefined,
      campaign:     ad.campaign?.name || '',
    })
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

    const ads = await fetchAdDetails(Array.from(spendingIds), token, accountId)
    console.log(`[Meta] live ads with spend this month: ${ads.length}`)
    return ads
  } catch (err) {
    console.error('[Meta] Fetch failed:', err)
    return []
  }
}
