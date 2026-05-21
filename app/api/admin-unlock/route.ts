import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Server-side check for the admin-edit PIN (segment-name renames).
 *
 * Previously the PIN was kept in NEXT_PUBLIC_ADMIN_PIN and compared
 * client-side, which meant the value was inlined into the JS bundle in
 * plaintext — anyone with browser devtools could read it. This route keeps
 * the PIN in a server-only env var (ADMIN_PIN) and returns ok/401 only.
 *
 * Rate-limited to 5 attempts per IP per 15 minutes — shares the limiter
 * module with /api/auth but uses a different scope so a brute-forced PIN
 * doesn't lock out logins.
 *
 * Note: this gate exists to prevent casual viewers from renaming segments;
 * it is not authentication for the dashboard (that's middleware.ts).
 */

export const runtime = 'nodejs'

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = rateLimit(ip, 'admin-unlock')
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'too many attempts' },
      { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const pin = typeof (body as { pin?: unknown })?.pin === 'string'
    ? (body as { pin: string }).pin
    : ''

  // Fail closed if ADMIN_PIN isn't configured. Previous version defaulted to
  // '1234' which meant a missing/deleted Vercel env var silently granted access
  // to anyone who typed the default.
  const correct = process.env.ADMIN_PIN
  if (!correct) {
    console.error('[admin-unlock] ADMIN_PIN is not set — refusing all unlocks')
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500, headers: NO_CACHE })
  }

  if (!safeStringEqual(pin, correct)) {
    return NextResponse.json({ error: 'bad pin' }, { status: 401, headers: NO_CACHE })
  }

  return NextResponse.json({ ok: true }, { headers: NO_CACHE })
}
