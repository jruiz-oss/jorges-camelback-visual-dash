/**
 * On-demand Meta video thumbnail fetcher.
 *
 * Usage: /api/meta-thumb?vid={video_id}
 *
 * Instead of caching a thumbnail URL at page-render time (which can expire
 * or be invalidated by URL-modification), this route fetches a fresh thumbnail
 * URL from the Meta API on every browser request, then streams the image bytes
 * back through our server. Result: thumbnails always load, no expiry issues.
 */

const GRAPH = 'https://graph.facebook.com/v19.0'

type Thumb = { uri?: string; width?: number; is_preferred?: boolean }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('vid')

  if (!videoId) return new Response('missing vid param', { status: 400 })

  const token = process.env.META_ACCESS_TOKEN
  if (!token) return new Response('server misconfigured', { status: 500 })

  try {
    // Step 1 — ask Meta for the freshest thumbnail URLs for this video
    const metaRes = await fetch(
      `${GRAPH}/${videoId}?fields=thumbnails%7Buri%2Cwidth%2Cis_preferred%7D&access_token=${token}`,
      { cache: 'no-store' },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await metaRes.json()

    if (data?.error) {
      console.warn('[meta-thumb] API error for', videoId, data.error.message)
      return new Response('meta api error', { status: 502 })
    }

    const thumbs: Thumb[] = data?.thumbnails?.data ?? []
    const usable = thumbs.filter(t => !!t.uri && (t.width ?? 0) >= 400)

    if (!usable.length) {
      console.warn('[meta-thumb] no usable thumbnail for videoId', videoId)
      return new Response('no thumbnail found', { status: 404 })
    }

    // Prefer Meta's "preferred" frame (usually the custom-uploaded cover),
    // then fall back to the largest available frame.
    const best = usable.sort((a, b) => {
      const pa = a.is_preferred ? 1 : 0
      const pb = b.is_preferred ? 1 : 0
      if (pb !== pa) return pb - pa
      return (b.width ?? 0) - (a.width ?? 0)
    })[0]

    // Step 2 — fetch the actual image bytes and pipe back to the browser
    const imgRes = await fetch(best.uri!, { cache: 'no-store' })
    if (!imgRes.ok) {
      console.warn('[meta-thumb] CDN fetch failed', imgRes.status, best.uri!.slice(0, 100))
      return new Response('cdn fetch failed', { status: 502 })
    }

    return new Response(imgRes.body, {
      headers: {
        'Content-Type': imgRes.headers.get('Content-Type') ?? 'image/jpeg',
        // Safe to cache for an hour — the video ID doesn't change, and on next
        // page load (force-dynamic) a fresh request will be made anyway.
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[meta-thumb] error:', err)
    return new Response('internal error', { status: 500 })
  }
}
