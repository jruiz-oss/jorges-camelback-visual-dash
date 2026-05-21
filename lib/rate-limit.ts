/**
 * Tiny in-memory rate limiter for auth endpoints.
 *
 * Why in-memory: this app has no external store (no Upstash/Redis configured).
 * The limit is leaky across Vercel serverless instances — each warm function
 * has its own Map — but even under that constraint a 5-per-15-minutes cap per
 * IP makes online brute-force of DASHBOARD_PASSWORD / ADMIN_PIN orders of
 * magnitude slower than the unlimited baseline. Defense in depth on top of
 * the constant-time comparisons and HMAC cookie; not a substitute for a
 * strong password.
 *
 * If you ever wire Upstash Redis, swap this for `@upstash/ratelimit` —
 * same call site, persistent across instances.
 */

type Bucket = { count: number; resetAt: number }

const BUCKETS = new Map<string, Bucket>()
const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000 // 15 minutes

// Prune expired buckets so the Map doesn't grow unbounded under attack.
function prune(now: number) {
  if (BUCKETS.size < 1000) return
  // Array.from avoids the `--downlevelIteration` TS requirement for Map iteration.
  Array.from(BUCKETS.entries()).forEach(([k, v]) => {
    if (v.resetAt <= now) BUCKETS.delete(k)
  })
}

/**
 * Returns `{ ok: true }` if the caller is under the limit (and counts this
 * attempt), or `{ ok: false, retryAfterSec }` if rate-limited.
 *
 * `scope` lets the same IP have separate buckets for `/api/auth` vs
 * `/api/admin-unlock` — one endpoint's failed-PIN spam doesn't lock out
 * the other.
 */
export function rateLimit(ip: string, scope: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  prune(now)
  const key = `${scope}:${ip}`
  const b = BUCKETS.get(key)

  if (!b || b.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }

  if (b.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }

  b.count += 1
  return { ok: true }
}

/**
 * Extract a client IP from a Next.js Request. Vercel always populates
 * `x-forwarded-for`; the first entry is the original client. Falls back to
 * a literal "unknown" string so absent headers collapse into one shared
 * bucket (still rate-limited, just lumped together).
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
