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

const PLATFORM_KEYS = ['all', 'meta', 'google', 'stackadapt'] as const

/**
 * Parses the {PREFIX}_AD_FILTER env var. Plain-text format, no JSON:
 *   +term  = show only ads containing it      -term = hide ads containing it
 *   terms separated by commas, platforms separated by |, platform prefix optional
 *   "+Commit, -Awestruck"                                  (all platforms)
 *   "meta: +Commit, -Awestruck | google: +Commit"          (per platform)
 * A term with no sign counts as "show only".
 */
export function parseAdFilterEnv(raw: string | undefined): AdFilter | undefined {
  if (!raw || !raw.trim()) return undefined
  const out: AdFilter = {}
  for (const part of raw.split('|')) {
    const m = part.match(/^\s*(all|meta|google|stackadapt)\s*:([\s\S]*)$/i)
    const key = (m ? m[1].toLowerCase() : 'all') as (typeof PLATFORM_KEYS)[number]
    const body = m ? m[2] : part
    const rule: AdFilterRule = out[key] ?? {}
    for (const t of body.split(',')) {
      const term = t.trim()
      if (!term) continue
      if (term.startsWith('-')) {
        const v = term.slice(1).trim()
        if (v) (rule.exclude ??= []).push(v)
      } else {
        const v = term.replace(/^\+/, '').trim()
        if (v) (rule.include ??= []).push(v)
      }
    }
    if (rule.include || rule.exclude) out[key] = rule
  }
  return Object.keys(out).length ? out : undefined
}

/** Inverse of parseAdFilterEnv: the string to paste into Vercel. */
export function formatAdFilterEnv(filter: AdFilter): string {
  return PLATFORM_KEYS
    .filter(k => filter[k])
    .map(k => {
      const r = filter[k]!
      const terms = [...(r.include ?? []).map(t => `+${t}`), ...(r.exclude ?? []).map(t => `-${t}`)]
      return `${k}: ${terms.join(', ')}`
    })
    .join(' | ')
}
