/**
 * Server-side proxy for Meta CDN image/thumbnail URLs.
 *
 * Meta video thumbnail URLs (fbcdn.net) have Referer/origin restrictions that
 * cause <img> tags to fail when the request comes from a non-Facebook origin.
 * Routing through this proxy means the browser fetches from our own server,
 * and our server fetches from Meta's CDN — no CORS or Referer issues.
 *
 * Usage: /api/meta-img?url=<URL-encoded Meta CDN URL>
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const metaUrl = searchParams.get('url')

  if (!metaUrl) {
    return new Response('missing url param', { status: 400 })
  }

  try {
    const upstream = await fetch(metaUrl, {
      cache: 'no-store',
      headers: {
        // Impersonate a browser fetch so Meta's CDN doesn't block us
        'User-Agent': 'Mozilla/5.0 (compatible; AdDashboard/1.0)',
      },
    })

    if (!upstream.ok) {
      console.warn('[meta-img] upstream failed:', upstream.status, metaUrl.slice(0, 120))
      return new Response('upstream failed', { status: 502 })
    }

    const contentType = upstream.headers.get('Content-Type') ?? 'image/jpeg'
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        // Cache for 1 hour — Meta URLs are fresh on every page load (force-dynamic)
        // so the proxy URL itself changes on each render; caching the content is safe.
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[meta-img] proxy error:', err)
    return new Response('proxy error', { status: 500 })
  }
}
