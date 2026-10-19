/**
 * Shared in-process cache for the live-wall connector fetches (server only).
 *
 * Every open wall tab soft-refreshes every 60s, and before this each refresh
 * re-ran all three platform fetches. N viewers = N× the Google Ads operations
 * (daily quota), Meta insights calls and StackAdapt cost budget. With this,
 * every viewer of a client inside the TTL shares one fetch:
 *
 *   - fresh hit (< ttl)      → returned immediately
 *   - in-flight fetch        → callers await the same promise (no stampede)
 *   - fetch throws/times out → the last good value is served (up to staleMs),
 *                              so a platform hiccup doesn't blank its lane.
 *                              A timed-out fetch keeps running and still
 *                              fills the cache when it lands.
 *
 * On Railway the app is one long-lived process, so this is effectively a
 * global cache. On Vercel it's per warm instance — still a big cut.
 */

type Entry<T> = { at: number; value: T }

const g = globalThis as unknown as {
  __adDashCache?: Map<string, Entry<unknown>>
  __adDashInflight?: Map<string, Promise<unknown>>
}
const store    = (g.__adDashCache    ??= new Map())
const inflight = (g.__adDashInflight ??= new Map())

export class FetchTimeout extends Error {
  constructor(label: string, ms: number) { super(`${label} timed out after ${ms}ms`) }
}

/** Resolve `p`, or reject with FetchTimeout after `ms`. Doesn't cancel `p`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const t = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new FetchTimeout(label, ms)), ms) })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

export async function cached<T>(
  key: string,
  opts: { ttlMs: number; staleMs: number; timeoutMs: number },
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as Entry<T> | undefined
  if (hit && now - hit.at < opts.ttlMs) return hit.value

  let p = inflight.get(key) as Promise<T> | undefined
  if (!p) {
    // The timeout applies to the caller's wait, not the fetch: a slow fetch
    // keeps running and still fills the cache for the next refresh.
    p = fetcher()
      .then(value => { store.set(key, { at: Date.now(), value }); return value })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
  }

  try {
    return await withTimeout(p, opts.timeoutMs, key)
  } catch (err) {
    if (hit && Date.now() - hit.at < opts.staleMs) {
      console.warn(`[cache] ${key} failed, serving ${Math.round((Date.now() - hit.at) / 1000)}s-old data:`, (err as Error).message)
      return hit.value
    }
    throw err
  }
}
