import { NextResponse } from 'next/server'

/**
 * Login endpoint. Compares the submitted password against DASHBOARD_PASSWORD
 * in constant time, and — on success — sets an HMAC-signed cookie token.
 *
 * The cookie value is NOT the password itself. Previous versions stored the
 * raw password as the cookie value, which meant any leaked cookie (server
 * logs, third-party tooling, browser-side error reporters) handed the
 * password directly to the attacker. We now store HMAC-SHA256(password,
 * secret) so compromising the cookie does not reveal the password, and
 * rotating the secret invalidates all sessions at once.
 *
 * Env:
 *   DASHBOARD_PASSWORD     — required, the literal password
 *   DASHBOARD_AUTH_SECRET  — strong random string used to sign the cookie.
 *                            Falls back to DASHBOARD_PASSWORD if unset (which
 *                            still hides the raw password from the cookie,
 *                            but means rotating the password invalidates all
 *                            sessions — usually the desired behavior anyway).
 */

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

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const password = typeof (body as { password?: unknown })?.password === 'string'
    ? (body as { password: string }).password
    : ''

  const correct = process.env.DASHBOARD_PASSWORD
  if (!correct) {
    console.error('[auth] DASHBOARD_PASSWORD is not set — refusing all logins')
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  }

  if (!safeStringEqual(password, correct)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const secret = process.env.DASHBOARD_AUTH_SECRET || correct
  const token  = await hmacHex(correct, secret)

  const res = NextResponse.json({ ok: true })
  res.cookies.set('dashboard_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return res
}
