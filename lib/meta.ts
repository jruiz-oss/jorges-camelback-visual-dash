import type { Ad } from './types'

const META_API_VERSION = 'v19.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

// ─── Step 1: spend-first ──────────────────────────────────────────────────────
// /insights returns just ad_id + spend — a tiny payload. We can paginate the
// whole month without ever hitting the "reduce the amount of data" throttle
// that bit the old /ads listing.
type InsightsRow  = { ad_id: string; spend?: string; adset_id?: string; campaign_id?: string }
type InsightsResp = {
  data?:   InsightsRow[]
  paging?: { next?: string }
  error?:  { message: string; code?: number }
}

async function fetchSpendingAdIds(accountId: string, token: string): Promise<Set<string>> {
  // Fetch ad_id + adset_id + campaign_id so we can deduplicate to one adset per campaign.
  const rows: Array<{ adId: string; adsetId: string; campaignId: string }> = []
  const fields = 'ad_id,adset_id,campaign_id,spend'

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
      if (spend > 0 && row.ad_id && row.adset_id && row.campaign_id) {
        rows.push({ adId: row.ad_id, adsetId: row.adset_id, campaignId: row.campaign_id })
      }
    }
    url = data.paging?.next ?? null
  }

  // Keep only the first adset seen per campaign, then collect all ad IDs from those adsets.
  const campaignToAdset = new Map<string, string>()
  const allowedAdsets   = new Set<string>()
  for (const { adsetId, campaignId } of rows) {
    if (!campaignToAdset.has(campaignId)) {
      campaignToAdset.set(campaignId, adsetId)
      allowedAdsets.add(adsetId)
    }
  }

  const spendingIds = new Set<string>()
  for (const { adId, adsetId } of rows) {
    if (allowedAdsets.has(adsetId)) spendingIds.add(adId)
  }

  console.log(
    `[Meta] campaigns: ${campaignToAdset.size}, ` +
    `adsets kept (1/campaign): ${allowedAdsets.size}, ` +
    `ads: ${spendingIds.size}`
  )
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
  // Top-level creative URL — returned for some older ad formats as a fallback
  // when neither link_data.link nor video_data CTA carries the destination.
  object_url?: string
  object_story_spec?: {
    link_data?: {
      picture?: string
      image_hash?: string
      // Text fields — `message` is the post body (the "caption" above the image)
      // `name` is the headline (below image), `description` is the sub-headline
      name?: string
      message?: string
      description?: string
      link?: string   // destination URL for image/link ads
      call_to_action?: { value?: { link?: string } } // CTA button destination (may differ from link)
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
      call_to_action?: { value?: { link?: string } } // destination URL for video ads
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
    // Destination URL for asset_feed_spec (dynamic creative) ads. This is
    // the ONLY place Meta exposes the landing page for this format — it is
    // not present in object_story_spec or creative.object_url.
    link_urls?: Array<{ website_url?: string }>
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
 * Batch-resolve `video_id` → playable MP4 source URL.
 *
 * Meta's Video node exposes a `source` field containing a direct CDN MP4 link.
 * These URLs are CDN-signed and playable in a browser `<video>` tag — no
 * access token required once the URL is fetched server-side.
 *
 * Chunked 50/request using `?ids=`, same pattern as video thumbnails.
 */
async function fetchVideoSourceUrls(
  videoIds: Set<string>, token: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (videoIds.size === 0) return map
  const all   = Array.from(videoIds)
  const CHUNK = 50

  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK)
    const url =
      `${GRAPH}/?ids=${slice.join(',')}` +
      `&fields=source` +
      `&access_token=${token}`
    try {
      const res = await fetch(url, { cache: 'no-store' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data?.error) {
        console.warn('[Meta] video source error:', data.error.message)
        continue
      }
      for (const videoId of slice) {
        const src: string | undefined = data?.[videoId]?.source
        if (src) map.set(videoId, src)
      }
    } catch (err) {
      console.warn('[Meta] video source fetch threw:', err)
    }
  }
  console.log(`[Meta] video sources resolved ${map.size}/${videoIds.size}`)
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
        // Filter to thumbs that are both (a) usable URIs and (b) at least
        // 400px wide. Anything smaller is the legacy ~150px auto thumbnail
        // and renders pixelated in a 220px card.
        const usable = thumbs.filter(t => !!t.uri && (t.width ?? 0) >= 400)
        if (!usable.length) continue
        // Sort priority changed: `is_preferred=true` first (Meta marks these
        // as the cleanest representative frame — usually the custom-uploaded
        // cover, NOT the M-watermarked auto-thumb), then largest by width.
        // The old ordering preferred raw size, which sometimes picked a big
        // watermarked auto-frame over a smaller clean custom cover.
        const best = usable.sort((a, b) => {
          const pa = a.is_preferred ? 1 : 0
          const pb = b.is_preferred ? 1 : 0
          if (pb !== pa) return pb - pa
          return (b.width ?? 0) - (a.width ?? 0)
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
 * Meta CDN fallback URLs (creative.thumbnail_url, asset_feed_spec.videos[0].thumbnail_url,
 * video_data.image_url) often contain a `stp=dst-jpg_s160x160_tt6` parameter that
 * caps the served image at 160×160. The `stp` param is a CDN transformation instruction,
 * not a signature, so stripping it causes the CDN to serve the original upload resolution.
 *
 * Applied only to last-resort fallback fields — high-priority paths (adimages, video.thumbnails)
 * already return full-res URLs.
 */
function upgradeFbThumbnailUrl(url: string | undefined): string | undefined {
  if (!url) return url
  try {
    const u = new URL(url)
    const stp = u.searchParams.get('stp')
    if (stp && /s\d+x\d+/.test(stp)) {
      // Remove the size constraint (e.g. s160x160) from the stp transform chain.
      // Result: CDN serves the original stored resolution instead of a downscaled copy.
      const upgraded = stp.replace(/_?s\d+x\d+_?/g, '_').replace(/^_|_$/g, '')
      if (upgraded) {
        u.searchParams.set('stp', upgraded)
      } else {
        u.searchParams.delete('stp')
      }
      return u.toString()
    }
  } catch {
    // Not a parseable URL — return as-is
  }
  return url
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
  if (vd.image_url)        return { url: upgradeFbThumbnailUrl(vd.image_url)!,       source: 'video_data.image_url' }
  const dpaFirst = c.asset_feed_spec?.images?.[0]?.url
  if (dpaFirst)            return { url: dpaFirst,           source: 'asset_feed_spec.images[0].url' }
  const dpaVideoThumb = c.asset_feed_spec?.videos?.[0]?.thumbnail_url
  if (dpaVideoThumb)       return { url: upgradeFbThumbnailUrl(dpaVideoThumb)!,      source: 'asset_feed_spec.videos[0].thumbnail_url' }
  if (c.thumbnail_url)     return { url: upgradeFbThumbnailUrl(c.thumbnail_url)!,    source: 'creative.thumbnail_url' }
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

/**
 * Batch-fetch Meta ad preview iframe URLs using the Graph API batch endpoint.
 *
 * `/{ad_id}/previews?ad_format=DESKTOP_FEED_STANDARD` returns an HTML snippet
 * containing an <iframe> that renders the live ad — video plays, carousels work,
 * no special permissions needed beyond ads_read. We extract just the iframe src
 * so AdCard can embed it directly.
 *
 * Uses the /batch endpoint (50 ops/call) to avoid per-ad HTTP overhead.
 */
async function fetchAdPreviews(
  adIds: string[], token: string,
): Promise<Map<string, string>> {
  const map   = new Map<string, string>()
  if (!adIds.length) return map
  const CHUNK = 50

  for (let i = 0; i < adIds.length; i += CHUNK) {
    const slice = adIds.slice(i, i + CHUNK)
    const batch = slice.map(id => ({
      method:       'GET',
      relative_url: `${id}/previews?ad_format=DESKTOP_FEED_STANDARD`,
    }))
    try {
      // Batch endpoint MUST be the root graph.facebook.com — NOT the versioned
      // v19.0 path. Using the versioned URL here causes a 400 / empty response.
      const res = await fetch(
        `https://graph.facebook.com/?access_token=${token}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    `batch=${encodeURIComponent(JSON.stringify(batch))}`,
          cache:   'no-store',
        },
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = await res.json()
      for (let j = 0; j < slice.length; j++) {
        const adId  = slice[j]
        const item  = results[j]
        if (!item || item.code !== 200) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: { data?: Array<{ body?: string }> } = JSON.parse(item.body ?? '{}')
        const html  = body.data?.[0]?.body ?? ''
        // Extract the src="..." from the <iframe> tag in the preview HTML
        const match = html.match(/src="([^"]+)"/)
        if (match?.[1]) map.set(adId, match[1].replace(/&amp;/g, '&'))
      }
    } catch (err) {
      console.warn('[Meta] preview batch threw:', err)
    }
  }
  console.log(`[Meta] ad previews resolved ${map.size}/${adIds.length}`)
  return map
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
      'title,body,object_url,' +
      'object_story_spec{' +
        'link_data{picture,image_hash,name,message,description,link,' +
          'call_to_action{value{link}},' +
          'child_attachments{picture,image_hash,video_id,name,description}},' +
        'video_data{image_url,image_hash,video_id,title,message,description,' +
          'call_to_action{value{link}}}' +
      '},' +
      'asset_feed_spec{' +
        'images{url,hash},' +
        'videos{video_id,thumbnail_url,thumbnail_hash},' +
        'bodies{text},titles{text},descriptions{text},' +
        'link_urls{website_url}' +
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
  //   • hashes       → original-upload URLs (image creatives, custom video covers)
  //   • videoIds     → largest available frame thumbnail (auto-generated covers)
  //   • videoSources → playable MP4 source URLs (best-effort; needs video_read perm)
  //   • previews     → embeddable iframe src for every ad (always works with ads_read)
  const activeIds = rawDetails
    .filter(ad => (ad.effective_status || ad.status || '').toUpperCase() === 'ACTIVE')
    .map(ad => ad.id)

  const [hashToUrl, videoIdToThumb, videoIdToSource, adIdToPreview] = await Promise.all([
    fetchAdImageUrls(accountId, token, hashes),
    fetchVideoThumbnails(videoIds, token),
    fetchVideoSourceUrls(videoIds, token),
    fetchAdPreviews(activeIds, token),
  ])

  // Pass 4 — build final Ad[] using the hash map + video thumbnail map + cascade.
  const ads: Ad[] = []
  const sourceCounts: Partial<Record<ImageSource, number>> = {}
  const sampleUrls: string[] = []
  // Sources that historically produce low-res / watermarked thumbnails.
  // We log these per-ad so the user can identify which specific creatives
  // need a custom cover uploaded in Ads Manager.
  const LOW_QUALITY_SOURCES: ImageSource[] = [
    'video_data.image_url',
    'asset_feed_spec.videos[0].thumbnail_url',
    'creative.thumbnail_url',
  ]

  for (const ad of rawDetails) {
    const effective = (ad.effective_status || ad.status || '').toUpperCase()
    // Live-only: drop ads that spent earlier in the month but are now paused
    if (effective !== 'ACTIVE') continue

    const picked = pickImageUrl(ad, hashToUrl, videoIdToThumb)
    sourceCounts[picked.source] = (sourceCounts[picked.source] ?? 0) + 1
    if (sampleUrls.length < 3 && picked.url) sampleUrls.push(picked.url.slice(0, 160))

    // Flag ads using fallback sources so the marketer knows which ones
    // need a custom thumbnail uploaded on Meta's side.
    if (LOW_QUALITY_SOURCES.includes(picked.source)) {
      console.log(
        `[Meta] LOW-RES ad "${ad.name ?? ad.id}" (campaign: ${ad.campaign?.name ?? '—'}) ` +
        `using ${picked.source} — upload a custom cover in Ads Manager to fix`
      )
    }

    const { headlines, descriptions } = extractCreativeText(ad)

    // Find the first video_id in this ad's creative (same traversal order as
    // collectVideoIds). Used for both the MP4 source URL and the on-demand
    // thumbnail route (/api/meta-thumb?vid=...).
    let videoUrl: string | undefined
    let firstVideoId: string | undefined
    const c2   = ad.creative
    const oss2 = c2?.object_story_spec
    const vd2  = oss2?.video_data
    const ld2  = oss2?.link_data

    if (vd2?.video_id) {
      firstVideoId = vd2.video_id
      if (videoIdToSource.get(vd2.video_id)) videoUrl = videoIdToSource.get(vd2.video_id)
    } else if (ld2?.child_attachments) {
      for (const ch of ld2.child_attachments) {
        if (ch.video_id) {
          firstVideoId = ch.video_id
          if (videoIdToSource.get(ch.video_id)) videoUrl = videoIdToSource.get(ch.video_id)
          break
        }
      }
    }
    if (!firstVideoId) {
      for (const v of c2?.asset_feed_spec?.videos ?? []) {
        if (v.video_id) {
          firstVideoId = v.video_id
          if (videoIdToSource.get(v.video_id)) videoUrl = videoIdToSource.get(v.video_id)
          break
        }
      }
    }

    // Collect all carousel card images for client-side navigation.
    // All Camelback ads use asset_feed_spec (Advantage+ creative) — object_story_spec
    // and child_attachments are never populated. We keep the child_attachments path
    // as a fallback for any legacy creatives, but the real carousel detection is
    // asset_feed_spec.images.length > 2.
    //
    // Threshold rationale: static A/B-test ads always upload exactly 2 image
    // variants so Meta can optimise between them — that is NOT a carousel.
    // Carousel ads upload one image per card, so they have 3+ images (in
    // practice 8–10 for Camelback campaigns). "= 2" → Static, "> 2" → Carousel.
    let carouselImages: string[] | undefined
    const carouselCards = ld2?.child_attachments ?? []

    // Path A: classic carousel via child_attachments (legacy / non-Advantage+ ads)
    if (carouselCards.length > 1) {
      const imgs: string[] = []
      for (const ch of carouselCards) {
        if (ch.image_hash && hashToUrl.get(ch.image_hash)) {
          imgs.push(proxied(hashToUrl.get(ch.image_hash)!))
        } else if (ch.video_id && videoIdToThumb.get(ch.video_id)) {
          imgs.push(proxied(videoIdToThumb.get(ch.video_id)!))
        } else if (ch.picture) {
          imgs.push(proxied(ch.picture))
        }
      }
      console.log(`[Meta] carousel (child_attachments) "${ad.name ?? ad.id}": ${carouselCards.length} cards → ${imgs.length} resolved`)
      if (imgs.length > 1) carouselImages = imgs
    }

    // Path B: Advantage+ carousel via asset_feed_spec.images (all current Camelback ads)
    if (!carouselImages) {
      const afsImgs = c2?.asset_feed_spec?.images ?? []
      if (afsImgs.length > 2) {
        const imgs: string[] = []
        for (const img of afsImgs) {
          if (img.hash && hashToUrl.get(img.hash)) {
            imgs.push(proxied(hashToUrl.get(img.hash)!))
          } else if (img.url) {
            imgs.push(proxied(img.url))
          }
        }
        console.log(`[Meta] carousel (asset_feed_spec) "${ad.name ?? ad.id}": ${afsImgs.length} images → ${imgs.length} resolved`)
        if (imgs.length > 1) carouselImages = imgs
      }
    }

    // Derive structural ad format — drives the type badge and carousel navigator.
    //   VIDEO    — asset_feed_spec.videos present OR object_story_spec.video_data
    //   CAROUSEL — child_attachments > 1 OR asset_feed_spec.images > 2
    //   STATIC   — asset_feed_spec.images === 2 (A/B-test variants, single image ad)
    const afsImageCount = c2?.asset_feed_spec?.images?.length ?? 0
    let metaAdType = 'IMAGE'
    if (vd2?.video_id || (c2?.asset_feed_spec?.videos?.length ?? 0) > 0) {
      metaAdType = 'VIDEO'
    } else if (carouselCards.length > 1 || afsImageCount > 2) {
      metaAdType = 'CAROUSEL'
    }

    // Use the cascade-picked URL for both image and video ads. The previous
    // version forced video ads through /api/meta-thumb, which calls the Video
    // object's `thumbnails` edge — that requires "Content" permission on the
    // Page that owns the video. The system user only has "Ads" + "Insights"
    // right now, so every video thumb request returned (#10) → 502.
    //
    // Falling through the cascade gets us `video_data.image_url` (legacy
    // ~400px auto-thumb — blurry but reliably accessible with just Ads perms).
    // Once Content permission is granted on the Page, swap this back to the
    // /api/meta-thumb route for sharp thumbnails.
    const finalImageUrl = proxied(picked.url)

    // Extract the landing page URL path. Meta stores the destination in different
    // fields depending on ad format, so we cascade through all known locations:
    //   1. asset_feed_spec.link_urls   — dynamic creative ads (most Commit campaigns)
    //   2. link_data.link              — image/link ads
    //   3. link_data.call_to_action    — CTA button may override the link field
    //   4. video_data.call_to_action   — video ads with a CTA button
    //   5. creative.object_url         — older ad formats / fallback
    // Strip trailing slash. If a URL is present but the path is root-only ("/"),
    // fall back to the hostname so we can distinguish "Meta returned a URL that
    // points to the homepage" from "Meta returned no URL at all for this ad type".
    // Skip facebook.com URLs — those are event/page links, not landing pages.
    let destinationUrl: string | undefined
    const urlCandidates = [
      c2?.asset_feed_spec?.link_urls?.[0]?.website_url,
      ld2?.link,
      ld2?.call_to_action?.value?.link,
      vd2?.call_to_action?.value?.link,
      c2?.object_url,
    ]
    const urlLabels = [
      'asset_feed_spec.link_urls[0]',
      'link_data.link',
      'link_data.cta.link',
      'video_data.cta.link',
      'creative.object_url',
    ]
    console.log(
      `[Meta] URL candidates for "${ad.name ?? ad.id}":`,
      urlCandidates.map((u, i) => `${urlLabels[i]}=${u ?? '—'}`).join(' | ')
    )
    for (const rawLink of urlCandidates) {
      if (!rawLink) continue
      try {
        const parsed = new URL(rawLink)
        // Skip facebook.com / fb.com URLs — these are event or page links,
        // not external landing pages. They'd show "/events/..." which is
        // meaningless as a destination chip.
        if (/facebook\.com|fb\.com/i.test(parsed.hostname)) continue
        const path = parsed.pathname.replace(/\/$/, '')
        if (path) {
          destinationUrl = path
        } else {
          // URL is valid but points to the root — use hostname so the chip
          // shows the real domain rather than the hardcoded fallback string.
          destinationUrl = parsed.hostname.replace(/^www\./, '')
        }
        break
      } catch { /* not a valid URL — skip */ }
    }
    if (!destinationUrl) {
      console.log(`[Meta] No URL found for "${ad.name ?? ad.id}" — all candidates missing or unparseable`)
    }

    ads.push({
      id:             ad.id,
      name:           ad.name || 'Unnamed Ad',
      status:         effective,
      imageUrl:       finalImageUrl,
      videoUrl,
      videoId:        firstVideoId,
      previewUrl:     adIdToPreview.get(ad.id),
      headline:       headlines[0] ?? '',
      headlines:      headlines.length    ? headlines    : undefined,
      descriptions:   descriptions.length ? descriptions : undefined,
      campaign:       ad.campaign?.name || '',
      destinationUrl,
      carouselImages,
      adType:         metaAdType,
    })
  }

  console.log('[Meta] image source breakdown:', JSON.stringify(sourceCounts))
  for (const u of sampleUrls) console.log('[Meta] sample picked URL:', u)

  return ads
}

/**
 * Wrap a Meta CDN URL so it routes through our server-side image proxy.
 * This avoids Referer/CORS issues when the browser loads <img> tags pointing
 * directly at fbcdn.net — the proxy fetches on the server's behalf instead.
 */
function proxied(url: string): string {
  if (!url) return ''
  return `/api/meta-img?url=${encodeURIComponent(url)}`
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
