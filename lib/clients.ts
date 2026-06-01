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
  /**
   * Primary domain for this client (e.g. "camelbackresort.com").
   * Shown in the brand chip on ad tiles when the ad itself carries no
   * destination URL. Must be set — prevents any client from accidentally
   * displaying another client's domain as a fallback.
   */
  brandDomain: string
  /**
   * Optional CSS variable overrides applied as a :root block on the client's
   * page. Keys are bare var names (e.g. "--ink"), values are CSS color strings.
   * These layer on top of the default tokens in layout.tsx.
   */
  cssOverrides?: Record<string, string>
  /**
   * StackAdapt advertiser ID for this client.
   * The StackAdapt API key is account-wide and can see all advertisers.
   * Set this to restrict results to only this client's campaigns.
   * Find it in StackAdapt → Settings → Advertiser, or from the URL.
   */
  stackadaptAdvertiserId?: string
  /**
   * Colors used by auto-discovered segments for this client. Defaults to the
   * base palette defined in segments.ts when omitted.
   */
  autoPalette?: string[]
  /**
   * Accent color for the catch-all "Other" / FALLBACK segment.
   * Defaults to #888888 when omitted.
   */
  fallbackAccent?: string
}

export const CLIENTS: ClientConfig[] = [
  {
    slug:        'camelback',
    name:        'Camelback Resort',
    envPrefix:   'CAMELBACK',
    metaHandle:  '@camelbackresort',
    brandDomain: 'camelbackresort.com',
  },
  {
    slug:        'commit',
    name:        'Commit Agency',
    envPrefix:   'COMMIT',
    metaHandle:  '@commitagency',
    brandDomain: 'commitagency.com',
    // Commit Agency brand palette (from brand guide):
    //   Commit Blue #00bdf2 · Deep Blue #004359 · Storm Clouds #517882
    //   Sea Salt #f7f8f9 · Sunlight #ffce08 · Coral #e64910
    autoPalette: [
      '#00bdf2', // Commit Blue   — primary
      '#e64910', // Coral         — accent
      '#004359', // Deep Blue     — deep
      '#ffce08', // Sunlight      — warm
      '#517882', // Storm Clouds  — neutral
    ],
    fallbackAccent: '#00bdf2', // Commit Blue for "Other" bucket
    cssOverrides: {
      '--ink':               '#004359', // deep blue  (replaces Camelback slate)
      '--ink-2':             '#517882', // storm clouds
      '--ink-3':             '#7fa5af', // storm clouds lightened
      '--line':              'rgba(0,67,89,.10)',
      '--line-2':            'rgba(0,67,89,.16)',
      '--bg-2':              '#f7f8f9', // sea salt
      '--brand-slate':       '#004359',
      '--brand-indigo':      '#004359',
      '--brand-orange':      '#e64910', // coral
      '--brand-light-orange':'#ffce08', // sunlight
    },
  },
]

/** Look up a client by URL slug. Returns undefined if slug is not registered. */
export function findClient(slug: string): ClientConfig | undefined {
  return CLIENTS.find(c => c.slug === slug)
}
