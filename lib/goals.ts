/**
 * Performance goals + scoring for the admin-only green/yellow/red dots.
 *
 * Pure module (no server imports) so the same types and scoring run on the
 * server (validation in /api/admin/goals) and in the browser (PerfContext).
 *
 * Goal resolution for a tile: campaign goal (keyed by lib/segments.ts
 * campaignKey) → that platform's account goal → no goal (relative ranking
 * inside the campaign, Meta only).
 */

export type GoalMetric   = 'cpa' | 'ctr' | 'cpc' | 'cvr'
export type PerfPlatform = 'meta' | 'stackadapt'
export type DotColor     = 'green' | 'yellow' | 'red' | 'grey'

export interface Goal {
  metric: GoalMetric
  /** CPA/CPC in account currency; CTR/CVR in percent (1.2 = 1.2%). */
  target: number
  /** Meta only: which `actions[].action_type` counts as a conversion.
   *  Empty = auto-pick (see pickDefaultEvent). Ignored for StackAdapt. */
  event?: string
}

export interface ClientGoals {
  version:   1
  /** Account-level default per platform (CTR norms differ a lot between
   *  Meta and programmatic display, so one shared default wouldn't work). */
  account:   Partial<Record<PerfPlatform, Goal>>
  /** campaignKey(platform, campaignName) → override goal. */
  campaigns: Record<string, Goal>
  /** How far worse than target still counts as yellow, in percent. */
  bandPct:   number
  updatedAt?: string
}

export interface PerfMetrics {
  spend:       number
  impressions: number
  /** Link clicks on Meta (inline_link_clicks); clicks on StackAdapt. */
  clicks:      number
  /** Meta only: action_type → count over the window. */
  actions?:    Record<string, number>
  /** StackAdapt only: conversions over the window. */
  conversions?: number
}

export interface Score {
  color:  DotColor
  /** Short text next to the dot, e.g. "CPA $42". */
  label:  string
  /** Tooltip with the full math. */
  detail: string
  source: 'campaign' | 'account' | 'relative' | 'none'
}

export const DEFAULT_BAND_PCT = 20
export const EMPTY_GOALS: ClientGoals = { version: 1, account: {}, campaigns: {}, bandPct: DEFAULT_BAND_PCT }

export const METRIC_LABELS: Record<GoalMetric, string> = {
  cpa: 'CPA / CPL',
  ctr: 'CTR',
  cpc: 'CPC',
  cvr: 'Conv. rate',
}
const LOWER_IS_BETTER: Record<GoalMetric, boolean> = { cpa: true, cpc: true, ctr: false, cvr: false }

// Minimum data before a dot gets a real color. Without this, an ad with one
// lucky conversion on $8 reads as the best performer on the wall.
export const MIN_IMPRESSIONS_CTR = 1000
export const MIN_CLICKS_CPC      = 10
export const MIN_CLICKS_CVR      = 30

// Meta conversion events tried in order when a goal has no explicit event.
// `lead` / `purchase` are Meta's aggregated (pixel + on-platform) types.
const DEFAULT_EVENT_ORDER = [
  'lead',
  'purchase',
  'complete_registration',
  'submit_application',
  'contact',
  'schedule',
  'donate',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_custom',
]
// Engagement noise — never a sensible "conversion", pushed to the bottom of
// the event picker.
const NOISE_EVENT = /^(link_click|post_engagement|page_engagement|post_reaction|post|comment|like|video_view|photo_view|post_interaction_gross|post_net_like|onsite_conversion\.post_save|onsite_conversion\.post_net_like)$/

export function pickDefaultEvent(totals: Record<string, number>): string | null {
  for (const e of DEFAULT_EVENT_ORDER) if ((totals[e] ?? 0) > 0) return e
  return null
}

/** Event options for the picker: conversion-like first, noise last. */
export function sortEvents(events: string[]): string[] {
  const rank = (e: string) => {
    const i = DEFAULT_EVENT_ORDER.indexOf(e)
    if (i >= 0) return i
    return NOISE_EVENT.test(e) ? 1000 : 100
  }
  return Array.from(new Set(events)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

// ── Validation (server uses this before anything touches Redis) ─────────────
const METRICS: GoalMetric[] = ['cpa', 'ctr', 'cpc', 'cvr']

export function sanitizeGoal(input: unknown): Goal | null {
  if (!input || typeof input !== 'object') return null
  const g = input as Record<string, unknown>
  const metric = g.metric as GoalMetric
  if (!METRICS.includes(metric)) return null
  const target = Number(g.target)
  if (!Number.isFinite(target) || target <= 0 || target > 1_000_000) return null
  if ((metric === 'ctr' || metric === 'cvr') && target > 100) return null
  const out: Goal = { metric, target: Math.round(target * 10000) / 10000 }
  if (typeof g.event === 'string' && g.event.trim()) {
    const ev = g.event.trim()
    if (ev.length > 120 || !/^[a-z0-9_.:\-]+$/i.test(ev)) return null
    out.event = ev
  }
  return out
}

export function sanitizeGoals(input: unknown): ClientGoals {
  const out: ClientGoals = { version: 1, account: {}, campaigns: {}, bandPct: DEFAULT_BAND_PCT }
  if (!input || typeof input !== 'object') return out
  const src = input as Record<string, any>
  for (const p of ['meta', 'stackadapt'] as PerfPlatform[]) {
    const g = sanitizeGoal(src.account?.[p])
    if (g) out.account[p] = g
  }
  if (src.campaigns && typeof src.campaigns === 'object') {
    for (const [k, v] of Object.entries(src.campaigns).slice(0, 500)) {
      const g = sanitizeGoal(v)
      if (g && isCampaignKey(k)) out.campaigns[k] = g
    }
  }
  const band = Number(src.bandPct)
  if (Number.isFinite(band) && band >= 1 && band <= 100) out.bandPct = Math.round(band)
  if (typeof src.updatedAt === 'string') out.updatedAt = src.updatedAt
  return out
}

export function isCampaignKey(k: string): boolean {
  return k.length <= 300 && /^(meta|stackadapt):/.test(k)
}

// ── Formatting ───────────────────────────────────────────────────────────────
export function fmtMetric(metric: GoalMetric, v: number): string {
  if (!Number.isFinite(v)) return '–'
  if (metric === 'ctr' || metric === 'cvr') return `${v.toFixed(v < 1 ? 2 : 1)}%`
  return `$${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString()}`
}
const money = (v: number) => `$${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString()}`
const num   = (v: number) => Math.round(v).toLocaleString()
const SHORT: Record<GoalMetric, string> = { cpa: 'CPA', ctr: 'CTR', cpc: 'CPC', cvr: 'CVR' }

// ── Scoring ──────────────────────────────────────────────────────────────────
export function conversionsFor(m: PerfMetrics, platform: PerfPlatform, event: string | null): number {
  if (platform === 'stackadapt') return m.conversions ?? 0
  if (!event) return 0
  return m.actions?.[event] ?? 0
}

export function metricValue(metric: GoalMetric, m: PerfMetrics, conv: number): number {
  switch (metric) {
    case 'cpa': return conv > 0 ? m.spend / conv : Infinity
    case 'cpc': return m.clicks > 0 ? m.spend / m.clicks : Infinity
    case 'ctr': return m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0
    case 'cvr': return m.clicks > 0 ? (conv / m.clicks) * 100 : 0
  }
}

function summary(m: PerfMetrics, conv: number, eventLabel: string | null): string {
  const parts = [`${money(m.spend)} spend`, `${num(m.impressions)} impr`, `${num(m.clicks)} clicks`]
  if (eventLabel !== null) parts.push(`${num(conv)} conv${eventLabel ? ` (${eventLabel})` : ''}`)
  return parts.join(' · ')
}

export function scoreAgainstGoal(
  m: PerfMetrics,
  goal: Goal,
  platform: PerfPlatform,
  event: string | null,
  bandPct: number,
  source: 'campaign' | 'account',
  windowLabel: string,
): Score {
  const needsConv = goal.metric === 'cpa' || goal.metric === 'cvr'
  const conv  = conversionsFor(m, platform, event)
  const band  = bandPct / 100
  const tgt   = fmtMetric(goal.metric, goal.target)
  const from  = source === 'campaign' ? 'campaign goal' : 'account goal'
  const stats = summary(m, conv, needsConv ? (platform === 'meta' ? (event ?? 'no event') : '') : null)
  const grey  = (why: string): Score => ({
    color: 'grey', label: why, source,
    detail: `${why} · ${SHORT[goal.metric]} goal ${tgt} (${from}) · ${stats} · ${windowLabel}`,
  })

  if (needsConv && platform === 'meta' && !event) return grey('No conv. event')
  if (goal.metric === 'ctr' && m.impressions < MIN_IMPRESSIONS_CTR) return grey('Low data')
  if (goal.metric === 'cpc' && m.clicks < MIN_CLICKS_CPC) return grey('Low data')
  if (goal.metric === 'cvr' && m.clicks < MIN_CLICKS_CVR) return grey('Low data')
  if (goal.metric === 'cpa' && conv === 0) {
    // Zero conversions only becomes a verdict once spend alone blows past the
    // yellow ceiling — at that point even 1 conversion would still be red.
    if (m.spend >= goal.target * (1 + band)) {
      return {
        color: 'red', label: '0 conv', source,
        detail: `No conversions on ${money(m.spend)} · CPA goal ${tgt} (${from}) · ${stats} · ${windowLabel}`,
      }
    }
    return grey('No conv yet')
  }

  const value = metricValue(goal.metric, m, conv)
  const lower = LOWER_IS_BETTER[goal.metric]
  const color: DotColor = lower
    ? (value <= goal.target ? 'green' : value <= goal.target * (1 + band) ? 'yellow' : 'red')
    : (value >= goal.target ? 'green' : value >= goal.target * (1 - band) ? 'yellow' : 'red')
  const val = fmtMetric(goal.metric, value)
  return {
    color, source,
    label:  `${SHORT[goal.metric]} ${val}`,
    detail: `${SHORT[goal.metric]} ${val} vs goal ${tgt} (${from}, ±${bandPct}% = yellow) · ${stats} · ${windowLabel}`,
  }
}

/**
 * No goal set: rank the ad's CTR against the other ads in the same campaign.
 * Top third green, bottom third red. Needs ≥3 ads with enough impressions,
 * otherwise grey. Only meaningful for Meta (StackAdapt metrics are
 * campaign-level, so every tile in a lane would tie).
 */
export function scoreRelative(m: PerfMetrics, peers: PerfMetrics[], windowLabel: string): Score {
  const qualified = peers.filter(p => p.impressions >= MIN_IMPRESSIONS_CTR)
  const stats = summary(m, 0, null)
  if (m.impressions < MIN_IMPRESSIONS_CTR || qualified.length < 3) {
    return { color: 'grey', label: 'Set a goal', source: 'none', detail: `No goal set · ${stats} · ${windowLabel}` }
  }
  const ctr  = (p: PerfMetrics) => (p.clicks / p.impressions) * 100
  const mine = ctr(m)
  const sorted = qualified.map(ctr).sort((a, b) => b - a)
  const found = sorted.findIndex(v => v <= mine) // 0 = best
  const rank  = found < 0 ? sorted.length - 1 : found
  const n     = sorted.length
  const color: DotColor = rank < n / 3 ? 'green' : rank >= n - n / 3 ? 'red' : 'yellow'
  return {
    color, source: 'relative',
    label:  `CTR ${fmtMetric('ctr', mine)}`,
    detail: `No goal set: CTR ${fmtMetric('ctr', mine)} ranked against ${qualified.length} ads in this campaign · ${stats} · ${windowLabel}`,
  }
}

export function addMetrics(a: PerfMetrics, b: PerfMetrics): PerfMetrics {
  const out: PerfMetrics = {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
  }
  if (a.actions || b.actions) {
    out.actions = { ...(a.actions ?? {}) }
    for (const [k, v] of Object.entries(b.actions ?? {})) out.actions[k] = (out.actions[k] ?? 0) + v
  }
  if (a.conversions != null || b.conversions != null) out.conversions = (a.conversions ?? 0) + (b.conversions ?? 0)
  return out
}
