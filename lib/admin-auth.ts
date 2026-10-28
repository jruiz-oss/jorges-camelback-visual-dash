/**
 * Server-side admin session for the performance dots + goals APIs.
 *
 * Admin edit mode used to be purely client state: /api/admin-unlock checked
 * the PIN and the browser flipped `editMode`. That was fine for renames/colors
 * (cosmetic, stored in the admin's own browser), but performance data (spend,
 * CPA) and shared goals must not be readable by anyone who can open devtools.
 * So on a correct PIN the unlock route now also sets an httpOnly cookie
 * (`dashboard_admin`), and the /api/admin/* routes require it.
 *
 * Token = `<expiryMs>.<HMAC-SHA256("admin:<expiryMs>", secret)>`, where the
 * secret is DASHBOARD_AUTH_SECRET + ADMIN_PIN. Rotating either one logs every
 * admin out. Web Crypto (not node:crypto) to match middleware.ts / auth route.
 */

import { CLIENTS, findClient } from './clients'
import { verifySessionForSlug, sessionCookieName } from './session'

export const ADMIN_COOKIE      = 'dashboard_admin'
export const ADMIN_SESSION_SEC = 12 * 60 * 60 // 12 hours

async function hmacHex(value: string, secret: string): Promise<string> {
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

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function adminSecret(): string | null {
  const pin = process.env.ADMIN_PIN
  if (!pin) return null
  return `${process.env.DASHBOARD_AUTH_SECRET ?? ''}|${pin}`
}

export async function makeAdminToken(): Promise<string | null> {
  const secret = adminSecret()
  if (!secret) return null
  const exp = Date.now() + ADMIN_SESSION_SEC * 1000
  return `${exp}.${await hmacHex(`admin:${exp}`, secret)}`
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const secret = adminSecret()
  const token  = readCookie(request, ADMIN_COOKIE)
  if (!secret || !token) return false
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false
  return safeStringEqual(sig, await hmacHex(`admin:${exp}`, secret))
}

/**
 * middleware.ts lets any logged-in client session through to /api/*. The
 * admin routes are scoped to one client's data, so also require the session
 * cookie for THAT client — an admin logged into /commit can't pull
 * /camelback's numbers by editing the ?client= param.
 */
export async function hasClientSession(request: Request, slug: string): Promise<boolean> {
  return verifySessionForSlug(slug, readCookie(request, sessionCookieName(slug)))
}

/** Both checks at once. Returns the client config or null. */
export async function requireAdminForClient(request: Request, slug: string | null) {
  if (!slug || !CLIENTS.some(c => c.slug === slug)) return null
  if (!(await isAdminRequest(request))) return null
  if (!(await hasClientSession(request, slug))) return null
  return findClient(slug) ?? null
}
