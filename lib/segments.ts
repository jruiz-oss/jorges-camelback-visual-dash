import type { Ad } from './types'

// Top-level grouping for the dashboard — per-business-segment, with platform
// breakdowns nested inside each segment (see SegmentSection.tsx).
//
// Two-tier classification:
//   1. CURATED segments win first. They are PER CLIENT: a client only gets the
//      ones listed in its `curatedSegments` (lib/clients.ts), so one client's
//      verticals can never appear on, or capture ads from, another client's
//      wall. They have a preferred accent color (used as a hint), but
//      buildSegments de-duplicates at runtime so no two visible segments ever
//      share a color.
//   2. Anything that doesn't match a curated segment falls through to
//      auto-discovery — we read the first token of the campaign name and spin
//      up a segment for it on the fly. That way new client verticals show up
//      as their own tab the moment a campaign exists, no code change needed.
//
// "Other" stays as the safety net for ads with no campaign name at all.

export type SegmentId = string

export interface SegmentDef {
  id:       SegmentId
  name:     string
  /** CSS color used for the side accent strip + hover ring inside this segment. */
  accent:   string
  /** Short letter mark for the nav-pill chip + segment header circle. */
  mark:     string
  /** Lowercase substrings checked against the campaign name (ad name only when the ad has no campaign). First hit wins. */
  matchers: string[]
  /** Set by buildSegments on auto-discovered segments. classifySegment does NOT
   *  keyword-match these; an ad goes to the auto segment derived from its own
   *  campaign name (autoSegmentFor), see classifySegment. */
  auto?:    boolean
}

// Camelback's curated segments — order matters (most specific first). These
// are wired to Camelback ONLY (see `curatedSegments` on its entry in
// lib/clients.ts). Every other client gets no curated segments, so all of its
// ads flow through auto-discovery instead.
//
// The `accent` here is a *preferred* color passed to buildSegments. The actual
// rendered color may differ if two segments prefer the same value — buildSegments
// guarantees uniqueness across all visible segments.
export const CAMELBACK_SEGMENTS: SegmentDef[] = [
  {
    id:       'aquatopia',
    name:     'Aquatopia',
    accent:   '#1D446B',   // preferred: Indigo — water/depth
    mark:     'A',
    matchers: ['aquatopia'],
  },
  {
    id:       'weddings',
    name:     'Weddings',
    accent:   '#FB2E33',   // preferred: Camelback Red — lifestyle accent
    mark:     'W',
    matchers: ['wedding', 'weddings'],
  },
  {
    id:       'lodge',
    name:     'Lodge',
    accent:   '#F7B45B',   // preferred: Light Orange — warm cabin tone
    mark:     'L',
    matchers: ['lodge'],
  },
  {
    id:       'cma',
    name:     'Camelback Mountain Adventures',
    accent:   '#4C9429',   // preferred: Pine — mountain green
    mark:     'CMA',
    matchers: [
      'mountain adventure',
      'mountain adventures',
      'cma',
      'mountain coaster',
      'coaster',
      'zipline',
      'ziplines',
    ],
  },
  {
    id:       'recruit',
    name:     'Recruiting',
    accent:   '#242841',   // preferred: Slate — professional
    mark:     'R',
    matchers: ['recruit', 'hiring', 'jobs', 'careers'],
  },
  {
    id:       'ski',
    name:     'Ski & Tubing',
    accent:   '#21432B',   // preferred: Spruce — winter/mountain
    mark:     'S',
    matchers: ['ski & tubing', 'ski and tubing', 'ski', 'tubing'],
  },
  {
    id:       'group',
    name:     'Group',
    accent:   '#F97529',   // preferred: Orange — corporate/events
    mark:     'G',
    matchers: ['meetings', 'meeting', 'group'],
  },
  {
    // Same id the auto-discovered "CamelBeach" segment had, so renames, colors
    // and moves saved on it carry over. Curated so the StackAdapt naming
    // ("Camelback Resort 2026 - Beach - Display") lands here too, instead of in
    // a separate "Beach" segment. Last in the list: a campaign naming another
    // vertical as well (e.g. "Lodge + CamelBeach") keeps going to that one.
    id:       'camelbeach',
    name:     'CamelBeach',
    accent:   '#0D9488',   // preferred: Teal — water park
    mark:     'C',
    matchers: ['camelbeach', 'camel beach', 'beach'],
  },
]

// Master palette — large enough that collisions are practically impossible.
// buildSegments pulls from this list in order whenever a preferred color is
// already taken. Per-client overrides pass in their own palette via
// BuildSegmentsOptions.autoPalette.
const AUTO_PALETTE = [
  '#1D446B', // Indigo
  '#F97529', // Orange
  '#4C9429', // Pine
  '#FB2E33', // Red
  '#21432B', // Spruce
  '#F7B45B', // Light Orange
  '#242841', // Slate
  '#1F1E23', // Midnight
  '#0D9488', // Teal
  '#7C3AED', // Purple
  '#DB2777', // Pink
  '#D97706', // Amber
  '#0891B2', // Cyan
  '#B45309', // Brown
  '#065F46', // Emerald dark
  '#9D174D', // Rose dark
]

// HSL→hex helper used to synthesize extra distinct colors when both the
// preferred color and the whole palette are already taken.
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Walk the hue wheel by the golden angle so generated colors are well spread
// out and visually distinct from one another. Guaranteed to return a color
// not already in `used`.
function distinctColor(used: Set<string>): string {
  let h = (used.size * 137.508) % 360
  for (let i = 0; i < 720; i++) {
    const hex = hslToHex(h, 64, 46)
    if (!used.has(hex.toLowerCase())) {
      used.add(hex.toLowerCase())
      return hex
    }
    h = (h + 137.508) % 360
  }
  // Practically unreachable (720 distinct hues > any real segment count).
  const hex = hslToHex(Math.random() * 360, 64, 46)
  used.add(hex.toLowerCase())
  return hex
}

// Pick the preferred color if it hasn't been used yet; otherwise walk the
// palette until we find an unused one; otherwise synthesize a brand-new
// distinct color. Comparison is case-insensitive so "#00BDF2" and "#00bdf2"
// can never both slip through. Mutates `used` as a side-effect.
// GUARANTEE: every return value is unique within `used`.
function pickColor(preferred: string, palette: string[], used: Set<string>): string {
  const pref = preferred?.toLowerCase()
  if (pref && !used.has(pref)) {
    used.add(pref)
    return preferred
  }
  for (const c of palette) {
    if (!used.has(c.toLowerCase())) {
      used.add(c.toLowerCase())
      return c
    }
  }
  // Preferred taken AND palette exhausted — make a guaranteed-unique color
  // instead of cycling (the old behavior silently repeated colors).
  return distinctColor(used)
}

const FALLBACK: SegmentDef = {
  id:       'other',
  name:     'Other',
  accent:   '#888888',
  mark:     '·',
  matchers: [],
}

// What a campaign/ad classifies by. Campaign name ONLY when present — an ad's
// own name is copywriting, not a vertical label, and matching against it let
// one oddly-named ad (e.g. an ad named "Lodge + CamelBeach Combo" inside a
// "CamelBeach" campaign) get peeled off into a different segment than every
// other ad in its own campaign. Since the wall already groups ads by campaign
// (CampaignLane) and the admin "move all" control moves a whole campaign at
// once, campaign-level consistency is the actual goal here — every ad in one
// campaign should always land in the same segment. Ad name is kept only as a
// fallback for the rare ad with no campaign set at all (some legacy/manual
// StackAdapt or Meta ads).
function classificationHay(ad: Ad): string {
  const campaign = (ad.campaign ?? '').trim()
  if (campaign) return campaign.toLowerCase()
  return (ad.name ?? '').toLowerCase()
}

// A matcher hits only at the START of a word, not anywhere in the string —
// "ski" matches "ski", "skiing", "Ski & Tubing" but not "whiskey"; "cma"
// matches "CMA Zipline" but not a word that merely contains those letters.
// Plain `hay.includes(m)` (the old rule) produced exactly that kind of
// cross-segment false positive. Prefix (not whole-word) matching keeps
// plurals/-ing forms working: "lodge" → "lodges", "recruit" → "recruiting".
const matcherCache = new Map<string, RegExp>()
function hits(hay: string, m: string): boolean {
  let re = matcherCache.get(m)
  if (!re) {
    const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re = new RegExp(`(^|[^a-z0-9])${escaped}`)
    matcherCache.set(m, re)
  }
  return re.test(hay)
}

function matchCurated(hay: string, curated: SegmentDef[]): SegmentDef | null {
  for (const seg of curated) {
    for (const m of seg.matchers) {
      if (hits(hay, m)) return seg
    }
  }
  return null
}

// Derive a segment from the campaign name's first meaningful word.
// Returns id/name/mark/matchers only — accent is assigned by buildSegments.
//
// Campaign names follow the "Agency | Vertical Detail | Channel" convention,
// e.g. "Commit | CamelBeach Conquesting | Search". The name is split into
// sections on | : / and dashes; whole sections that are pure noise (the agency
// prefix, a bare year, a channel label) are dropped, then the first word of
// the first remaining section that isn't a generic word wins:
//   "Commit | CamelBeach Conquesting | Search" → "CamelBeach"
//   "2026 Aquatopia Traffic"                     → "Aquatopia"
//   "Wedding Q3 — Conversions"                   → "Wedding"
//
// The old version stripped "Commit " with a regex that didn't know about the
// pipe, so it left "| CamelBeach ..." and split that into ["", "CamelBeach",
// ...]. Token [0] was the empty string → null → every non-curated
// "Commit | ..." campaign fell into "Other" together.
const NOISE_SECTIONS = /^(commit|commit agency|test|wip|new|copy of|draft|\d{4})$/i
// Words that describe the campaign's tactic/channel, never its vertical.
const GENERIC_WORDS = new Set([
  'commit', 'test', 'wip', 'new', 'copy', 'draft',
  'brand', 'branded', 'nonbrand', 'non', 'generic',
  'search', 'display', 'pmax', 'performance', 'max', 'youtube', 'video', 'demand', 'gen',
  'conquesting', 'competitor', 'competitors', 'remarketing', 'retargeting', 'prospecting',
  'awareness', 'traffic', 'conversions', 'conversion', 'leads', 'lead',
  'the', 'a', 'an', 'of', 'and', '&',
])
// `brandWords` (ClientConfig.brandWords) are the client's own name, e.g.
// "camelback", "resort". They are skipped like generic words, so
// "Camelback Resort 2026 - Restaurant - Display" → "Restaurant" instead of a
// "Camelback" segment swallowing every campaign that starts with the brand.
// Only when a name has nothing BUT brand/generic words (e.g. "Camelback Brand
// Search") does the first brand word become the segment, so pure brand
// campaigns still get their own segment rather than falling into "Other".
function autoSegmentFor(ad: Ad, brandWords: string[] = []): Omit<SegmentDef, 'accent'> | null {
  const campaign = (ad.campaign ?? '').trim()
  if (!campaign) return null
  const brand = new Set(brandWords.map(w => w.trim().toLowerCase()).filter(Boolean))
  const sections = campaign
    .split(/\s*[|:/—–]\s*|\s+-\s+/)
    .map(sec => sec.trim())
    .filter(sec => sec && !NOISE_SECTIONS.test(sec))
  let firstBrand: string | null = null
  for (const sec of sections) {
    const words = sec.split(/[\s_\-]+/).filter(Boolean)
    for (const raw of words) {
      const word = raw.replace(/[^A-Za-z0-9\u00C0-\u024F&]/g, '')
      if (!word || /^\d+$/.test(word) || GENERIC_WORDS.has(word.toLowerCase())) continue
      if (brand.has(word.toLowerCase())) { firstBrand ??= word; continue }
      return segmentFromWord(word)
    }
  }
  return firstBrand ? segmentFromWord(firstBrand) : null
}

function segmentFromWord(word: string): Omit<SegmentDef, 'accent'> {
  const id = word.toLowerCase()
  return {
    id,
    name:     word[0].toUpperCase() + word.slice(1),
    mark:     word[0].toUpperCase(),
    matchers: [id],
  }
}

// Stable key for a campaign on one platform — what the admin "move whole
// campaign" override is stored under. Lowercased + trimmed so it survives
// casing tweaks; platform-scoped so a Meta and a Google campaign that happen to
// share a name can still be moved independently. Must match how
// SegmentSection groups lanes (empty campaign → "Other" lane → key "<p>:").
export function campaignKey(platform: string, campaign: string | undefined): string {
  return `${platform}:${(campaign ?? '').trim().toLowerCase()}`
}

// Admin-created segments ("+ New segment…" in the move menus). Stored per client
// in the shared overrides as { id: name } (lib/overrides.ts) so the server can
// bucket by them. The `custom-` prefix can never collide with an auto-discovered
// id (those are single words with no hyphen) or a curated one.
export const CUSTOM_SEGMENT_PREFIX = 'custom-'
export function customSegmentId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${CUSTOM_SEGMENT_PREFIX}${slug || Date.now().toString(36)}`
}
const CUSTOM_ID_RE = /^custom-[a-z0-9-]{1,48}$/
/** Validate stored custom segments before they reach bucketing. */
export function parseCustomSegments(map: Record<string, unknown>): { id: string; name: string }[] {
  return Object.entries(map)
    .filter((e): e is [string, string] => CUSTOM_ID_RE.test(e[0]) && typeof e[1] === 'string' && e[1].trim().length > 0)
    .slice(0, 30)
    .map(([id, name]) => ({ id, name: name.trim().slice(0, 60) }))
}

export interface BuildSegmentsOptions {
  /** Admin-created segments for this client (already validated, see parseCustomSegments). */
  custom?: { id: string; name: string }[]
  /** This client's curated segments (ClientConfig.curatedSegments). Omit for none. */
  curated?: SegmentDef[]
  /** Override the color palette used for all segments. */
  autoPalette?: string[]
  /** Override the accent color of the catch-all "Other" segment. */
  fallbackAccent?: string
  /** This client's own name words (ClientConfig.brandWords), skipped when naming auto segments. */
  brandWords?: string[]
}

// Build the final SEGMENTS list dynamically from the ads we actually have.
// Colors are assigned in one pass — each segment gets its preferred color if
// available, otherwise the next unused palette entry. This guarantees no two
// visible segments ever share an accent color.
//
// The client's curated segments are always present (so colors stay stable even when an ad
// for them temporarily drops off); auto-discovered segments only appear when
// at least one ad maps to them. SegmentSection's empty-state will hide any
// curated segment that ends up with zero ads — see page.tsx `visibleSegments`.
export function buildSegments(ads: Ad[], opts: BuildSegmentsOptions = {}): SegmentDef[] {
  const palette  = opts.autoPalette  ?? AUTO_PALETTE
  const curated  = opts.curated ?? []
  const fallback = opts.fallbackAccent
    ? { ...FALLBACK, accent: opts.fallbackAccent }
    : FALLBACK

  const usedAccents = new Set<string>()

  // Pass 1: assign colors to curated segments (preferred color wins unless taken).
  const out: SegmentDef[] = curated.map(seg => ({
    ...seg,
    accent: pickColor(seg.accent, palette, usedAccents),
  }))

  const seen = new Set<string>(out.map(s => s.id))

  // Pass 2: auto-discover from ad campaign names; assign next available color.
  for (const ad of ads) {
    const hay = classificationHay(ad)
    if (matchCurated(hay, curated)) continue
    const auto = autoSegmentFor(ad, opts.brandWords)
    if (!auto || auto.id === fallback.id) continue
    if (!seen.has(auto.id)) {
      // Pick any unused color (no preference for auto-discovered segments).
      const accent = pickColor(palette[0], palette, usedAccents)
      out.push({ ...auto, accent, auto: true })
      seen.add(auto.id)
    }
  }

  // Pass 3: admin-created segments. Matchers are empty, so no ad ever lands here
  // by classification — only by an explicit move. They stay in `out` even when
  // empty so they can be picked as a move target (page.tsx hides empty ones
  // from the wall).
  for (const c of opts.custom ?? []) {
    if (seen.has(c.id) || c.id === fallback.id) continue
    out.push({
      id: c.id, name: c.name, mark: (c.name[0] ?? '•').toUpperCase(), matchers: [],
      accent: pickColor(palette[0], palette, usedAccents),
    })
    seen.add(c.id)
  }

  // Fallback "Other" is assigned LAST through the same dedup, so it can never
  // duplicate a visible segment — even when fallbackAccent equals a palette
  // color (e.g. Commit's #00bdf2 is both autoPalette[0] and fallbackAccent).
  out.push({ ...fallback, accent: pickColor(fallback.accent, palette, usedAccents) })
  return out
}

// Curated keyword match first (curated-wins rule), then the auto segment named
// after THIS campaign's own first meaningful word, else "Other".
//
// Auto segments used to be keyword-matched too, in discovery order, and an auto
// matcher hits ANY word in the name. So "Pool Summer Deals" went to "Summer"
// if a "Summer ..." campaign happened to be fetched first, and to "Pool"
// otherwise, and "Curse of Camelback" joined a "Camelback" segment only when a
// "Camelback Resort ..." campaign came first. Ads flipped segments between
// refreshes, and renames / colors / moves (keyed by segment id) appeared and
// disappeared with them. Deriving the id from the ad's own campaign is the
// rule buildSegments already uses to create the segment, so the two agree.
// `brandWords` must be the same list passed to buildSegments.
export function classifySegment(ad: Ad, segments: SegmentDef[], brandWords: string[] = []): SegmentId {
  const hay = classificationHay(ad)
  for (const seg of segments) {
    if (seg.auto || !seg.matchers.length) continue
    for (const m of seg.matchers) {
      if (hits(hay, m)) return seg.id
    }
  }
  const auto = autoSegmentFor(ad, brandWords)
  if (auto && segments.some(s => s.auto && s.id === auto.id)) return auto.id
  return FALLBACK.id
}
