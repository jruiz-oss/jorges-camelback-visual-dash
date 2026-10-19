/**
 * Per-client ad filter. Lets a client's wall show only the ads that belong to
 * us when someone else (another agency) runs ads in the same accounts.
 * Runs BEFORE segmentation, so the normal segment logic applies to what's left.
 *
 * Matching is a case-insensitive substring test against the ad name, campaign
 * name and headline. `include`: keep an ad only if it matches ANY term (empty
 * or missing = keep everything). `exclude`: drop an ad if it matches ANY term.
 * Rules under `all` apply to every platform, then the platform's own rule.
 */

import type { Ad } from './types'

export type AdFilterRule = { include?: string[]; exclude?: string[] }
export type FilterPlatform = 'meta' | 'google' | 'stackadapt'
export type AdFilter = Partial<Record<'all' | FilterPlatform, AdFilterRule>>

function haystack(ad: Ad): string {
  return [ad.name, ad.campaign, ad.headline].filter(Boolean).join(' | ').toLowerCase()
}

function passes(ad: Ad, rule?: AdFilterRule): boolean {
  if (!rule) return true
  const text = haystack(ad)
  const terms = (list?: string[]) => (list ?? []).map(t => t.trim().toLowerCase()).filter(Boolean)
  const inc = terms(rule.include)
  const exc = terms(rule.exclude)
  if (inc.length && !inc.some(t => text.includes(t))) return false
  if (exc.some(t => text.includes(t))) return false
  return true
}

export function applyAdFilter(ads: Ad[], platform: FilterPlatform, filter?: AdFilter): Ad[] {
  if (!filter) return ads
  return ads.filter(ad => passes(ad, filter.all) && passes(ad, filter[platform]))
}
