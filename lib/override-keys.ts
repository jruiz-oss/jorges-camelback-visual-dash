/**
 * Storage names for the admin segment overrides (rename / color / order /
 * moves), namespaced per client slug so one client's tweaks never apply to
 * another client's dashboard in the same browser.
 *
 * Before this existed every client shared one set of cookie / localStorage
 * names. Those un-namespaced values were only ever really set for the first
 * registered client, so that client (and only that client) falls back to the
 * legacy name when its namespaced value is missing. Safe to delete the
 * fallback once the first client has re-saved its overrides.
 */

import { CLIENTS } from './clients'

export const LEGACY_OWNER_SLUG = CLIENTS[0]?.slug ?? ''

/** localStorage key, e.g. "seg-name-overrides-v1:camelback". */
export const scopedKey = (base: string, slug: string) => `${base}:${slug}`

/** Cookie name, e.g. "ad-seg-overrides-v1-camelback". Slugs are [a-z0-9-]. */
export const scopedCookie = (base: string, slug: string) => `${base}-${slug}`
