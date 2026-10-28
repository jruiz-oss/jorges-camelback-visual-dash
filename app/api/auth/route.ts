import { NextResponse } from 'next/server'
import { rateLimit, refundAttempt, clientIp } from '@/lib/rate-limit'
import { CLIENTS } from '@/lib/clients'
import { findCredentialCollision } from '@/lib/credential-guard'
import { makeSessionToken, safeStringEqual, sessionCookieName, sessionCookieOptions } from '@/lib/session'

/**
 * Login endpoint. Compares the submitted password against each client's
 * {PREFIX}_PASSWORD in constant time, and — on success — sets that client's
 * timestamped, HMAC-signed session cookie (format + idle timeout: lib/session.ts).
 *
 * The cookie never contains the password, and it carries its own timestamp, so
 * the server rejects it after SESSION_IDLE_SEC without a visit even if the
 * browser kept it.
 *
 * Rate-limited to 5 FAILED attempts per IP per 15 minutes (Postgres when configured,
 * in-memory otherwise; see lib/rate-limit.ts) to make online brute-force
 * impractical without eliminating the need for a strong password.
 *
 * Env:
 *   {PREFIX}_PASSWORD      — one per client (lib/clients.ts)
 *   DASHBOARD_AUTH_SECRET  — strong random string used (with the client's
 *                            password) to sign the cookie. Rotating the secret
 *                            or a password logs out every session for it.
 */

// Force Node runtime so the in-memory rate-limit Map persists across requests
// on the same warm instance. Edge runtime instances are too short-lived for
// this to be useful.
export const runtime = 'nodejs'

// Standard headers applied to every auth response — `no-store` so a shared
// proxy never caches a 401/200 keyed on the password attempt.
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(ip, 'auth')
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'too many attempts' },
      { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const password = typeof (body as { password?: unknown })?.password === 'string'
    ? (body as { password: string }).password
    : ''

  // Check password against all registered clients
  for (const client of CLIENTS) {
    const clientPassword = process.env[`${client.envPrefix}_PASSWORD`]
    if (!clientPassword) continue
    if (!safeStringEqual(password, clientPassword)) continue

    // Same password on two clients would always log into the first one.
    if (findCredentialCollision(client)?.includes('_PASSWORD ')) {
      console.error(`[auth] ${client.envPrefix}_PASSWORD is shared with another client — login refused`)
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers: NO_CACHE })
    }

    // Match found — set per-client cookie and return the slug
    // Correct password: don't count it toward the rate limit (failures only).
    await refundAttempt(ip, 'auth')

    const token = await makeSessionToken(client)
    if (!token) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers: NO_CACHE })

    const response = NextResponse.json({ ok: true, client: client.slug }, { headers: NO_CACHE })
    // Idle timeout + sliding renewal live in lib/session.ts / middleware.ts.
    response.cookies.set(sessionCookieName(client.slug), token, sessionCookieOptions())
    return response
  }

  // No client matched
  return NextResponse.json({ error: 'Wrong password' }, { status: 401, headers: NO_CACHE })
}
