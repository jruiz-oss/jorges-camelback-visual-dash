/**
 * Client login sessions (`dashboard_auth_<slug>` cookie). Shared by
 * middleware.ts (edge), app/api/auth, lib/admin-auth and app/[client]/page.tsx,
 * so it uses Web Crypto only (no node:crypto).
 *
 * Token = `<lastSeenMs>.<HMAC-SHA256("<slug>:<lastSeenMs>", secret)>`.
 * The timestamp is checked SERVER-SIDE: a token older than SESSION_IDLE_SEC is
 * rejected even if the browser kept the cookie, so a copied cookie value can't
 * work forever. Every authenticated page view re-issues it with a fresh
 * timestamp (sliding), so an open wall (60s soft refresh) stays logged in;
 * a browser that hasn't loaded the page in SESSION_IDLE_SEC has to log in again.
 *
 * Secret = DASHBOARD_AUTH_SECRET + the client's password: rotating either one
 * logs every session for that client out.
 */

import { findClient, type ClientConfig } from './clients'

export const SESSION_IDLE_SEC = 12 * 60 * 60 // 12 hours of inactivity
const CLOCK_SKEW_MS = 60_000

export const sessionCookieName = (slug: string) => `dashboard_auth_${slug}`

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge:   SESSION_IDLE_SEC,
    path:     '/',
  }
}

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

export function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function sessionSecret(client: ClientConfig): string | null {
  const password = process.env[`${client.envPrefix}_PASSWORD`]
  if (!password) return null
  return `${process.env.DASHBOARD_AUTH_SECRET ?? ''}|${password}`
}

/** New token for this client, stamped now. Null if the client has no password set. */
export async function makeSessionToken(client: ClientConfig): Promise<string | null> {
  const secret = sessionSecret(client)
  if (!secret) return null
  const ts = Date.now()
  return `${ts}.${await hmacHex(`${client.slug}:${ts}`, secret)}`
}

/** True only for a correctly signed token for THIS client that isn't idle-expired. */
export async function verifySessionToken(client: ClientConfig, token: string | null | undefined): Promise<boolean> {
  if (!token) return false
  const secret = sessionSecret(client)
  if (!secret) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false
  const ts  = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  const now = Date.now()
  if (!Number.isFinite(ts) || ts > now + CLOCK_SKEW_MS || now - ts > SESSION_IDLE_SEC * 1000) return false
  return safeStringEqual(sig, await hmacHex(`${client.slug}:${ts}`, secret))
}

/** Convenience for callers that only have the slug. */
export async function verifySessionForSlug(slug: string, token: string | null | undefined): Promise<boolean> {
  const client = findClient(slug)
  return !!client && verifySessionToken(client, token)
}

/**
 * Client slug for a page path, decoded and lowercased so "/%63amelback" or
 * "/Camelback" can't slip past the middleware's slug match. Null = undecodable.
 */
export function slugFromPath(pathname: string): string | null {
  try { return decodeURIComponent(pathname.split('/')[1] ?? '').toLowerCase() }
  catch { return null }
}
