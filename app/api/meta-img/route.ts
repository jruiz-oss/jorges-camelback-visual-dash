/**
 * Server-side proxy for Meta CDN image/thumbnail URLs.
 *
 * Meta video thumbnail URLs (fbcdn.net) have Referer/origin restrictions that
 * cause <img> tags to fail when the request comes from a non-Facebook origin.
 * Routing through this proxy means the browser fetches from our own server,
 * and our server fetches from Meta's CDN — no CORS or Referer issues.
 *
 * Usage: /api/meta-img?url=<URL-encoded Meta CDN URL>
 *
 * Security: the upstream URL is constrained to Meta CDN hostnames so this
 * endpoint can't be turned into an open SSRF proxy. Even an authenticated
 * dashboard viewer cannot pivot the server to fetch internal services or
 * cloud-metadata endpoints (e.g. 169.254.169.254). The allowlist mirrors the
 * Meta entries in next.config.mjs `images.remotePatterns`.
 */

// Both endsWith checks and exact matches are handled so we accept e.g.
// `scontent-iad3-1.fbcdn.net` but reject `evil.fbcdn.net.attacker.com`.
const ALLOWED_HOST_SUFFIXES = ['.fbcdn.net', '.facebook.com']
const ALLOWED_HOSTS_EXACT   = ['fbcdn.net',  'facebook.com']

function isAllowedMetaUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (ALLOWED_HOSTS_EXACT.includes(host)) return true
  return ALLOWED_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const metaUrl = searchParams.get('url')

  if (!metaUrl) {
    return new Response('missing url param', { status: 400 })
  }

  // SSRF guard — reject anything that isn't a Meta CDN URL over HTTPS.
  if (!isAllowedMetaUrl(metaUrl)) {
    console.warn('[meta-img] blocked non-Meta URL:', metaUrl.slice(0, 120))
    return new Response('disallowed host', { status: 400 })
  }

  try {
    const upstream = await fetch(metaUrl, {
      cache: 'no-store',
      // Don't follow redirects — a redirect to a non-allowlisted host would
      // silently bypass the allowlist. Treat any 3xx as a failed fetch.
      redirect: 'manual',
      headers: {
        // Impersonate a browser fetch so Meta's CDN doesn't block us
        'User-Agent': 'Mozilla/5.0 (compatible; AdDashboard/1.0)',
      },
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      console.warn('[meta-img] upstream redirected (refusing to follow):', upstream.status)
      return new Response('upstream redirected', { status: 502 })
    }

    if (!upstream.ok) {
      console.warn('[meta-img] upstream failed:', upstream.status, metaUrl.slice(0, 120))
      return new Response('upstream failed', { status: 502 })
    }

    // Only allow image responses through this proxy. Anything else (HTML
    // error page, JSON, etc.) is rejected so the endpoint can't be used to
    // smuggle non-image content into a page that trusts it as an image.
    const contentType = upstream.headers.get('Content-Type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/')) {
      console.warn('[meta-img] non-image content-type from upstream:', contentType)
      return new Response('upstream non-image', { status: 502 })
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        // Belt-and-braces: instruct the browser not to sniff a different type.
        'X-Content-Type-Options': 'nosniff',
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
