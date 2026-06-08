/**
 * Google Ads OAuth callback handler.
 *
 * Google redirects here after the user authorises the app. This route:
 *   1. Verifies the CSRF state parameter (clientSlug + timestamp + HMAC).
 *   2. Exchanges the one-time code for tokens.
 *   3. Patches {PREFIX}_GOOGLE_REFRESH_TOKEN in Vercel's environment variables via the
 *      Vercel API (requires VERCEL_API_TOKEN to be set as an env var).
 *   4. Triggers a new Vercel production deployment so the new token takes effect.
 *   5. Returns an HTML page that says "Successfully reconnected" and auto-
 *      redirects to the client dashboard once the deploy is underway (~30 s).
 *
 * Required env vars (add to Vercel project settings):
 *   VERCEL_API_TOKEN  — a Vercel personal access token with project write access
 *
 * Auto-provided by Vercel (no action needed):
 *   VERCEL_PROJECT_ID    — set automatically by Vercel
 *   VERCEL_DEPLOYMENT_ID — set automatically by Vercel
 */

import crypto from 'crypto'
import { CLIENTS } from '@/lib/clients'

// ─── HTML response helper ─────────────────────────────────────────────────────
function htmlPage(opts: {
  title: string
  heading: string
  body: string
  /** 'success' = green, 'warning' = yellow, 'error' = red */
  tone?: 'success' | 'warning' | 'error'
  /** @deprecated use tone instead */
  success?: boolean
  redirectHome?: boolean
  redirectTo?: string
  /** Seconds before auto-redirect fires. Defaults to 180 (3 min) when redirectHome=true. */
  redirectDelay?: number
}): Response {
  const { title, heading, body, redirectHome, redirectTo, redirectDelay } = opts
  // Resolve tone: new 'tone' param wins; fall back to legacy 'success' boolean.
  const tone   = opts.tone ?? (opts.success ? 'success' : 'error')
  const accent = tone === 'success' ? '#4ade80' : tone === 'warning' ? '#facc15' : '#f87171'
  const redirectPath = redirectTo ? `/${redirectTo}` : '/'
  // Default delay is 180 s (3 min) so Vercel's deploy has time to complete before
  // the user lands on the dashboard. 35 s was too short and caused confusion.
  const delay  = redirectDelay ?? 180
  const meta   = redirectHome
    ? `<meta http-equiv="refresh" content="${delay};url=${redirectPath}">`
    : ''
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${meta}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      background: #0a0a0a; color: ${accent};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; flex-direction: column; gap: 14px; padding: 32px;
      text-align: center;
    }
    h2  { font-size: 22px; font-weight: 600 }
    p   { color: #888; font-size: 14px; line-height: 1.5; max-width: 440px }
    a   { color: #555; font-size: 13px; margin-top: 8px; display: inline-block }
    a:hover { color: #aaa }
    #timer { color: #444; font-size: 12px; margin-top: 4px }
  </style>
</head>
<body>
  <h2>${heading}</h2>
  <p>${body}</p>
  ${redirectHome
    ? `<p id="timer">Redirecting in <span id="countdown">${delay}</span>s — or <a href="${redirectPath}">go now</a> once Vercel shows the deployment as Ready.</p>
       <script>
         var s=${delay},el=document.getElementById('countdown');
         var t=setInterval(function(){s--;el.textContent=s;if(s<=0)clearInterval(t);},1000);
       </script>`
    : `<a href="${redirectPath}">← Back to dashboard</a>`}
</body>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// ─── Vercel API helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateVercelEnvVar(key: string, value: string): Promise<void> {
  const token     = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID

  if (!token)     throw new Error('VERCEL_API_TOKEN is not set')
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is not set')

  // List env vars to find the existing entry for this key (production target).
  const listRes  = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=false&limit=100`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listData: any = await listRes.json()
  if (!listRes.ok) throw new Error(`Vercel list env failed: ${JSON.stringify(listData).slice(0, 200)}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (listData.envs as any[])?.find(
    (e) => e.key === key && (e.target as string[])?.includes('production'),
  )

  if (existing) {
    const patchRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ value }),
        cache:   'no-store',
      },
    )
    if (!patchRes.ok) {
      const err = await patchRes.text()
      throw new Error(`Vercel PATCH env failed: ${err.slice(0, 200)}`)
    }
  } else {
    // Env var doesn't exist yet — create it.
    const postRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key, value, type: 'encrypted', target: ['production'] }),
        cache:   'no-store',
      },
    )
    if (!postRes.ok) {
      const err = await postRes.text()
      throw new Error(`Vercel POST env failed: ${err.slice(0, 200)}`)
    }
  }
}

async function triggerVercelRedeploy(): Promise<void> {
  const token        = process.env.VERCEL_API_TOKEN
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID

  if (!token)        throw new Error('VERCEL_API_TOKEN is not set')
  if (!deploymentId) throw new Error('VERCEL_DEPLOYMENT_ID is not set (should be auto-set by Vercel)')

  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${deploymentId}/redeploy`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ target: 'production' }),
      cache:   'no-store',
    },
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Vercel redeploy failed: ${err.slice(0, 200)}`)
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  // User denied consent or another OAuth-level error occurred.
  if (oauthError) {
    return htmlPage({
      title:   'Google Ads — Access Denied',
      heading: 'Access denied',
      body:    `Google returned: <strong>${oauthError}</strong>. Please try again and approve the permissions request.`,
      success: false,
    })
  }

  // ── CSRF verification ───────────────────────────────────────────────────────
  const secret = process.env.DASHBOARD_AUTH_SECRET
  if (!secret || !state) {
    return htmlPage({ title: 'Error', heading: 'Invalid request', body: 'Missing state or auth secret.', success: false })
  }

  // State format: "{clientSlug}.{timestamp}.{hmac}"
  const lastDot       = state.lastIndexOf('.')
  const secondLastDot = state.lastIndexOf('.', lastDot - 1)
  const clientSlug    = state.slice(0, secondLastDot)
  const timestamp     = state.slice(secondLastDot + 1, lastDot)
  const receivedHmac  = state.slice(lastDot + 1)
  const expectedHmac  = crypto.createHmac('sha256', secret).update(`${clientSlug}.${timestamp}`).digest('hex')

  let hmacMatch = false
  try {
    hmacMatch = crypto.timingSafeEqual(
      Buffer.from(receivedHmac.padEnd(64, '0')),
      Buffer.from(expectedHmac.padEnd(64, '0')),
    ) && receivedHmac.length === expectedHmac.length
  } catch { /* length mismatch — hmacMatch stays false */ }

  if (!hmacMatch) {
    return htmlPage({ title: 'Error', heading: 'Invalid state', body: 'CSRF check failed. Please try reconnecting again.', success: false })
  }

  // Reject if the OAuth dance took longer than 10 minutes (stale state).
  if (Date.now() - parseInt(timestamp, 10) > 10 * 60 * 1000) {
    return htmlPage({ title: 'Error', heading: 'Session expired', body: 'The reconnect link expired. Please click "Reconnect Google Ads" again.', success: false })
  }

  // Look up the client from the slug embedded in state.
  const client = CLIENTS.find(c => c.slug === clientSlug)
  if (!client) {
    return htmlPage({ title: 'Error', heading: 'Unknown client', body: 'Unrecognized client slug in state.', success: false })
  }

  if (!code) {
    return htmlPage({ title: 'Error', heading: 'Missing code', body: 'No authorization code returned by Google.', success: false, redirectTo: clientSlug })
  }

  // ── Token exchange ──────────────────────────────────────────────────────────
  const origin      = new URL(request.url).origin
  const redirectUri = `${origin}/api/google-oauth/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      // Shared OAuth-app credential (same Google Cloud project for all clients),
      // matching lib/google-ads.ts and .env.example. Per-client value is the
      // refresh_token saved below.
      client_id:     process.env.GOOGLE_CLIENT_ID     ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
    cache: 'no-store',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenData: any = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.refresh_token) {
    console.error('[google-oauth] token exchange failed:', JSON.stringify(tokenData).slice(0, 300))
    return htmlPage({
      title:   'Google Ads — Token Error',
      heading: 'Token exchange failed',
      body:    tokenData.error_description ?? tokenData.error ?? 'Google did not return a refresh token. Make sure prompt=consent is set and try again.',
      success: false,
      redirectTo: clientSlug,
    })
  }

  // ── Save new token + redeploy ───────────────────────────────────────────────
  const refreshTokenKey = `${client.envPrefix}_GOOGLE_REFRESH_TOKEN`
  try {
    await updateVercelEnvVar(refreshTokenKey, tokenData.refresh_token)
    console.log(`[google-oauth] ${refreshTokenKey} updated in Vercel`)
  } catch (err) {
    console.error('[google-oauth] Failed to update Vercel env var:', err)
    return htmlPage({
      title:   'Partially connected',
      heading: 'Connected, but token not saved',
      body:    'Google authorised successfully, but the token could not be saved automatically. ' +
               `Please copy the token below and add it as ${refreshTokenKey} in Vercel environment variables, then redeploy.<br><br>` +
               `<code style="color:#4ade80;font-size:11px;word-break:break-all">${tokenData.refresh_token}</code>`,
      success: false,
      redirectTo: clientSlug,
    })
  }

  try {
    await triggerVercelRedeploy()
    console.log('[google-oauth] Vercel redeploy triggered')
  } catch (err) {
    // Token saved but auto-redeploy failed. Show a clear warning (yellow) so the
    // user knows they must manually redeploy — previously this showed green "✓"
    // which masked the issue.
    console.warn('[google-oauth] Redeploy trigger failed (token was saved):', err)
    return htmlPage({
      title:   'Action required — manual redeploy needed',
      heading: '⚠ Token saved — manual redeploy required',
      body:    'Google credentials were saved to Vercel, but the automatic redeploy failed. ' +
               'Go to <strong>Vercel dashboard → this project → Deployments</strong> and click ' +
               '<strong>Redeploy</strong> on the latest deployment. The dashboard will work once it finishes.',
      tone:       'warning',
      redirectTo: clientSlug,
    })
  }

  return htmlPage({
    title:        'Google Ads Reconnected',
    heading:      'Successfully reconnected ✓',
    body:         'New credentials saved. The dashboard is redeploying now — this takes about 2–3 minutes. ' +
                  'The page will redirect automatically, or click the link below once Vercel shows the deployment as Ready.',
    tone:         'success',
    redirectHome: true,
    redirectTo:   clientSlug,
  })
}
