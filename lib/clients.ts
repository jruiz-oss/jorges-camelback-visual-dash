/**
 * Client registry — one entry per agency client.
 *
 * To add a client:
 *   1. Add an entry below with a unique slug, display name, envPrefix, and metaHandle.
 *   2. Add the corresponding {PREFIX}_* env vars to Vercel and .env.local.
 *   3. Deploy — the new /{slug} route goes live immediately.
 */

export type ClientConfig = {
  /** URL path segment: /camelback, /client2 … */
  slug: string
  /** Human-readable name shown in the TopBar title. */
  name: string
  /** Env var prefix, e.g. "CAMELBACK" → reads CAMELBACK_META_ACCESS_TOKEN etc. */
  envPrefix: string
  /** @handle shown under the Meta platform section. */
  metaHandle: string
}

export const CLIENTS: ClientConfig[] = [
  {
    slug:       'camelback',
    name:       'Camelback Resort',
    envPrefix:  'CAMELBACK',
    metaHandle: '@camelbackresort',
  },
  {
    slug:       'commit',
    name:       'Commit Agency',
    envPrefix:  'COMMIT',
    metaHandle: '@commitagency',
  },
]

/** Look up a client by URL slug. Returns undefined if slug is not registered. */
export function findClient(slug: string): ClientConfig | undefined {
  return CLIENTS.find(c => c.slug === slug)
}
