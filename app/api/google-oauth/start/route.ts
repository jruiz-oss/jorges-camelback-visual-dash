/**
 * Initiates Google Ads OAuth re-authentication.
 *
 * Visited when the dashboard banner detects an expired refresh token.
 * Redirects the browser to Google's consent screen with access_type=offline
 * and prompt=consent so Google always issues a fresh refresh_token.
 *
 * CSRF protection: the `state` parameter is a timestamp + HMAC(timestamp)
 * signed with DASHBOARD_AUTH_SECRET. The callback verifies this before
 * processing any code.
 */

import crypto from 'crypto'

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const secret   = process.env.DASHBOARD_AUTH_SECRET || process.env.DASHBOARD_PASSWORD

  if (!clientId || !secret) {
    return new Response('Server misconfigured: missing GOOGLE_CLIENT_ID or auth secret', { status: 500 })
  }

  // Build a signed CSRF state: "<timestamp>.<hmac>" — verified in the callback.
  const timestamp = Date.now().toString()
  const hmac      = crypto.createHmac('sha256', secret).update(timestamp).digest('hex')
  const state     = `${timestamp}.${hmac}`

  // Use the same origin as this request so it works on both Vercel prod and local dev.
  const origin      = new URL(request.url).origin
  const redirectUri = `${origin}/api/google-oauth/callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/adwords',
    access_type:   'offline',
    // `prompt=consent` forces Google to return a refresh_token even if the
    // user previously authorized this app. Without it, subsequent re-auths
    // return only an access_token and the refresh_token field is absent.
    prompt:        'consent',
    state,
  })

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    302,
  )
}
