/**
 * Diagnostic endpoint — dumps raw Meta creative fields for the first N
 * spending ads this month. Used to verify what the API actually returns
 * for format detection (carousel, video, image).
 *
 * Usage: GET /api/meta-creative-debug?limit=20
 *
 * Gated by the same ADMIN_PASSCODE used by /api/admin-unlock so it is
 * never publicly accessible.
 */

const GRAPH = 'https://graph.facebook.com/v19.0'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Simple passcode gate — same env var as admin-unlock
  const passcode = searchParams.get('passcode')
  const correctPin = process.env.ADMIN_PIN || '1234'
  if (!passcode || passcode !== correctPin) {
    return new Response('unauthorized', { status: 401 })
  }

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  const token     = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID
  if (!token || !accountId) {
    return Response.json({ error: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set' }, { status: 500 })
  }

  // ── Step 1: grab spending ad IDs (same logic as lib/meta.ts) ──────────────
  const insightsUrl =
    `${GRAPH}/${accountId}/insights` +
    `?access_token=${token}` +
    `&level=ad` +
    `&date_preset=this_month` +
    `&fields=ad_id,spend` +
    `&limit=200`

  const insightsRes = await fetch(insightsUrl, { cache: 'no-store' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insightsData: any = await insightsRes.json()
  if (insightsData?.error) {
    return Response.json({ error: insightsData.error.message }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spendingIds: string[] = (insightsData.data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => parseFloat(r.spend ?? '0') > 0 && r.ad_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => r.ad_id as string)
    .slice(0, limit)

  if (!spendingIds.length) {
    return Response.json({ ads: [], message: 'No spending ads found this month' })
  }

  // ── Step 2: fetch creative fields — same fields as lib/meta.ts ────────────
  // We request every field the app uses for format detection so this output
  // is directly comparable to what the production code sees.
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

  const detailUrl =
    `${GRAPH}/?ids=${spendingIds.join(',')}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&access_token=${token}`

  const detailRes  = await fetch(detailUrl, { cache: 'no-store' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailData: any = await detailRes.json()
  if (detailData?.error) {
    return Response.json({ error: detailData.error.message }, { status: 502 })
  }

  // ── Step 3: summarise format-detection signals for each ad ─────────────────
  // Return both the condensed summary AND the full raw creative so nothing is
  // hidden. This lets you spot structural differences between carousel and
  // non-carousel ads at a glance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ads = spendingIds.map((adId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ad: any = detailData?.[adId]
    if (!ad) return { adId, error: 'not found in response' }

    const c   = ad.creative ?? {}
    const oss = c.object_story_spec ?? {}
    const ld  = oss.link_data ?? {}
    const vd  = oss.video_data ?? {}
    const afs = c.asset_feed_spec ?? {}

    // What the current production code derives from this creative:
    let derivedType = 'IMAGE'
    if (vd.video_id || (afs.videos?.length ?? 0) > 0) {
      derivedType = 'VIDEO'
    } else if ((ld.child_attachments?.length ?? 0) > 1) {
      derivedType = 'CAROUSEL'
    }

    return {
      adId,
      name:           ad.name,
      status:         ad.effective_status ?? ad.status,
      campaign:       ad.campaign?.name ?? '—',

      // ── Format detection signals ──────────────────────────────────────────
      signals: {
        has_object_story_spec:  !!c.object_story_spec,
        has_link_data:          !!oss.link_data,
        child_attachments_count: ld.child_attachments?.length ?? 0,
        // Individual cards — shows whether picture/hash/video_id are present
        child_attachments:      (ld.child_attachments ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ch: any) => ({
            has_picture:    !!ch.picture,
            has_image_hash: !!ch.image_hash,
            has_video_id:   !!ch.video_id,
            name:           ch.name ?? null,
          })
        ),
        has_video_data:         !!oss.video_data,
        video_data_video_id:    vd.video_id ?? null,
        asset_feed_images:      afs.images?.length ?? 0,
        asset_feed_videos:      afs.videos?.length ?? 0,
        has_image_hash:         !!c.image_hash,
        has_image_url:          !!c.image_url,
        creative_top_level_keys: Object.keys(c),
        oss_keys:               Object.keys(oss),
        ld_keys:                Object.keys(ld),
      },

      // ── What the app currently classifies this as ─────────────────────────
      derived_adType: derivedType,

      // ── Full raw creative (complete — nothing omitted) ────────────────────
      raw_creative:   c,
    }
  })

  return Response.json({ ads, fetched: ads.length }, {
    headers: { 'Content-Type': 'application/json' },
  })
}
