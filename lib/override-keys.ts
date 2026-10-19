/**
 * Names of the PRE-REDIS browser storage for admin overrides (rename / color /
 * order in localStorage, moves / custom segments / view mode in cookies),
 * namespaced per client slug. Overrides now live server-side
 * (lib/overrides.ts); these helpers are only used by SegmentOverrideContext to
 * find an admin's old local settings and import them once on unlock.
 *
 * The very first versions used un-namespaced names that were only ever set for
 * the first registered client, so that client also checks the bare names.
 */

import { CLIENTS } from './clients'

export const LEGACY_OWNER_SLUG = CLIENTS[0]?.slug ?? ''

/** localStorage key, e.g. "seg-name-overrides-v1:camelback". */
export const scopedKey = (base: string, slug: string) => `${base}:${slug}`

/** Cookie name, e.g. "ad-seg-overrides-v1-camelback". Slugs are [a-z0-9-]. */
export const scopedCookie = (base: string, slug: string) => `${base}-${slug}`
