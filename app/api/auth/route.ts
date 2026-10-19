import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { CLIENTS } from '@/lib/clients'
import { findCredentialCollision } from '@/lib/credential-guard'

/**
 * Login endpoint. Compares the submitted password against each client's
 * {PREFIX}_PASSWORD in constant time, and — on success — sets that client's
 * HMAC-signed cookie token.
 *
 * The cookie value is NOT the password itself. Previous versions stored the
 * raw password as the cookie value, which meant any leaked cookie (server
 * logs, third-party tooling, browser-side error reporters) handed the
 * password directly to the attacker. We now store HMAC-SHA256(password,
 * secret) so compromising the cookie does not reveal the password, and
 * rotating the secret invalidates all sessions at once.
 *
 * Rate-limited to 5 attempts per IP per 15 minutes (Redis when configured,
 * in-memory otherwise; see lib/rate-limit.ts) to make online brute-force
 * impractical without eliminating the need for a strong password.
 *
 * Env:
 *   {PREFIX}_PASSWORD      — one per client (lib/clients.ts)
 *   DASHBOARD_AUTH_SECRET  — strong random string used to sign the cookie.
 *                            Falls back to the client's password if unset
 *                            (still hides the raw password from the cookie).
 *                            Rotating the secret or a password logs out
 *                            every session for it.
 */

// Force Node runtime so the in-memory rate-limit Map persists across requests
// on the same warm instance. Edge runtime instances are too short-lived for
// this to be useful.
export const runtime = 'nodejs'

async function hmacHex(value: string, secret: string): Promise<string> {
  // Web Crypto so this code path matches middleware.ts (edge runtime) and
  // doesn't depend on Node's `crypto` module being available.
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Constant-time string equality. Length-leak is acceptable for fixed-shape
// secrets; the attacker would still need to brute-force the byte sequence.
function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

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
    const secret = process.env.DASHBOARD_AUTH_SECRET || clientPassword
    const token  = await hmacHex(clientPassword, secret)
    const cookieName = `dashboard_auth_${client.slug}`

    const response = NextResponse.json({ ok: true, client: client.slug }, { headers: NO_CACHE })
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // 30 days, re-issued by middleware.ts on every page visit (sliding), so
      // an always-on wall screen never gets logged out.
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  }

  // No client matched
  return NextResponse.json({ error: 'Wrong password' }, { status: 401, headers: NO_CACHE })
}
