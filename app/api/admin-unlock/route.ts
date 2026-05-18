import { NextResponse } from 'next/server'

/**
 * Server-side check for the admin-edit PIN (segment-name renames).
 *
 * Previously the PIN was kept in NEXT_PUBLIC_ADMIN_PIN and compared
 * client-side, which meant the value was inlined into the JS bundle in
 * plaintext — anyone with browser devtools could read it. This route keeps
 * the PIN in a server-only env var (ADMIN_PIN) and returns ok/401 only.
 *
 * Note: this gate exists to prevent casual viewers from renaming segments;
 * it is not authentication for the dashboard (that's middleware.ts).
 */

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const pin = typeof (body as { pin?: unknown })?.pin === 'string'
    ? (body as { pin: string }).pin
    : ''

  const correct = process.env.ADMIN_PIN || '1234'
  if (!safeStringEqual(pin, correct)) {
    return NextResponse.json({ error: 'bad pin' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
