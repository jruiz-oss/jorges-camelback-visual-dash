/**
 * RETIRED — nothing in the app calls this route any more (video thumbnails
 * come from the Graph API at render time and go through /api/meta-img).
 *
 * It was also a cross-client leak: it used the global Meta system-user token
 * to fetch ANY video ID, so a viewer logged into one client's dashboard could
 * pull another client's video thumbnails. Returns 410 Gone, same pattern as
 * /api/meta-creative-debug.
 */

export async function GET() {
  return new Response('gone', { status: 410 })
}
