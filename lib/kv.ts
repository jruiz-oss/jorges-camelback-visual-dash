/**
 * Minimal Upstash Redis REST client (no npm dependency).
 *
 * Reads either naming convention so it works no matter how the database was
 * connected:
 *   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (upstash.com console)
 *   - KV_REST_API_URL        / KV_REST_API_TOKEN         (Vercel Marketplace
 *     "Upstash for Redis" integration injects these automatically)
 *
 * Used by lib/rate-limit.ts (auth brute-force counters) and the admin goals
 * store (app/api/admin/goals). Every call returns null on any failure so a
 * Redis outage degrades features instead of throwing through a page render.
 */

export function kvConfig(): { url: string; token: string } | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/** Run several Redis commands in one round trip. Null if unconfigured or failed. */
export async function kvPipeline(commands: string[][]): Promise<Array<{ result?: unknown; error?: unknown }> | null> {
  const cfg = kvConfig()
  if (!cfg) return null
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[kv] pipeline HTTP', res.status)
      return null
    }
    return (await res.json()) as Array<{ result?: unknown; error?: unknown }>
  } catch (err) {
    console.error('[kv] pipeline failed:', err)
    return null
  }
}

/** GET a JSON value. `undefined` = key missing, `null` = store unavailable. */
export async function kvGetJson<T>(key: string): Promise<T | undefined | null> {
  const out = await kvPipeline([['GET', key]])
  if (!out) return null
  const raw = out[0]?.result
  if (raw == null) return undefined
  try { return JSON.parse(String(raw)) as T } catch { return undefined }
}

/** SET a JSON value. Returns false if the store is unavailable. */
export async function kvSetJson(key: string, value: unknown): Promise<boolean> {
  const out = await kvPipeline([['SET', key, JSON.stringify(value)]])
  return !!out && out[0]?.result === 'OK'
}
