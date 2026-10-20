/**
 * Rate limiter for auth endpoints, hardened against the two bypasses that
 * made the previous version much weaker than its "5 per 15 min" cap implied:
 *
 *   1. Attacker-chosen buckets. The old `clientIp()` trusted the *first*
 *      entry of `x-forwarded-for`, which is client-supplied. An attacker
 *      could send a fresh fake `X-Forwarded-For` on every request, landing
 *      in a new bucket each time so the per-IP cap never fired — effectively
 *      unlimited guesses. We now prefer the platform-set `x-real-ip` (Vercel
 *      populates this with the true connecting IP and a client cannot forge
 *      it) and only fall back to XFF when it's absent.
 *
 *   2. IP rotation / spoofing. Even with a clean IP source, an attacker on a
 *      botnet or spoofing residential proxies can still rotate IPs. So on top
 *      of the per-IP bucket we now enforce a *global* per-scope backstop: the
 *      total number of attempts across ALL IPs in a window is capped. Brute
 *      force needs thousands of guesses; a legitimate dashboard has a handful
 *      of users, so a generous global cap stops attacks while almost never
 *      affecting real logins.
 *
 * Persistence: Postgres when configured (lib/kv.ts: DATABASE_URL), which gives
 * a hard cap shared by every server instance. Without a
 * store it falls back to an in-memory Map per instance (real cap is
 * `LIMIT × instances`). If the store is configured but errors, we fall back to
 * the in-memory path (still rate-limited, never open).
 */

import { kvIncrWindow } from './kv'

type Bucket = { count: number; resetAt: number }

const BUCKETS = new Map<string, Bucket>()
const MAX_ATTEMPTS = 5
// Global backstop across all IPs for a given scope. Override per-deployment
// with RATE_LIMIT_GLOBAL_MAX. 60/15min is far above legitimate human use but
// far below what an online brute-force needs.
const GLOBAL_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 60
const WINDOW_MS    = 15 * 60 * 1000 // 15 minutes
const WINDOW_SEC   = WINDOW_MS / 1000

type Result = { ok: true } | { ok: false; retryAfterSec: number }

// Prune expired buckets so the Map doesn't grow unbounded under attack.
function prune(now: number) {
  if (BUCKETS.size < 1000) return
  // Array.from avoids the `--downlevelIteration` TS requirement for Map iteration.
  Array.from(BUCKETS.entries()).forEach(([k, v]) => {
    if (v.resetAt <= now) BUCKETS.delete(k)
  })
}

// In-memory counter: increments `key`, returns whether it's still under `max`.
function memHit(key: string, max: number, now: number): Result {
  const b = BUCKETS.get(key)
  if (!b || b.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }
  if (b.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count += 1
  return { ok: true }
}

// Database counter (lib/kv.ts kvIncrWindow): increments, window fixed from the
// first attempt. Returns null if no store is configured or the call fails
// (caller then falls back to the in-memory path).
const storeHit = (key: string) => kvIncrWindow(key, WINDOW_SEC)

/**
 * Returns `{ ok: true }` if the caller is under both the per-IP and global
 * limits for this scope (and counts this attempt), or
 * `{ ok: false, retryAfterSec }` if rate-limited.
 *
 * `scope` keeps `/api/auth` and `/api/admin-unlock` in separate buckets so one
 * endpoint's failed attempts don't lock out the other.
 */
export async function rateLimit(ip: string, scope: string): Promise<Result> {
  const now = Date.now()
  prune(now)

  const perKey    = `rl:${scope}:${ip}`
  const globalKey = `rl:${scope}:__global__`

  // Try the database for a hard, cross-instance cap. Both counters share the path.
  const perCount = await storeHit(perKey)
  if (perCount !== null) {
    if (perCount > MAX_ATTEMPTS) {
      return { ok: false, retryAfterSec: WINDOW_SEC }
    }
    const globalCount = await storeHit(globalKey)
    if (globalCount !== null && globalCount > GLOBAL_MAX) {
      return { ok: false, retryAfterSec: WINDOW_SEC }
    }
    return { ok: true }
  }

  // In-memory fallback. Check the global backstop first so a flood of distinct
  // (possibly spoofed) IPs can't slip past by each staying under the per-IP cap.
  const global = memHit(globalKey, GLOBAL_MAX, now)
  if (!global.ok) return global
  return memHit(perKey, MAX_ATTEMPTS, now)
}

/**
 * Extract the client IP from a Next.js Request.
 *
 * Prefer `x-real-ip`: on Vercel this is set by the platform to the true
 * connecting IP and cannot be forged by the client. `x-forwarded-for` is only
 * a fallback for non-Vercel hosts — and we take the *last* entry, which is the
 * one appended by the nearest trusted proxy, not the leftmost client-supplied
 * value an attacker controls. Falls back to a literal "unknown" so absent
 * headers collapse into one shared (still rate-limited) bucket.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]!
  }
  return 'unknown'
}
