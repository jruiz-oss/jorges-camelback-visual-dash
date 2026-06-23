import type { Ad } from './types'

// Top-level grouping for the dashboard — per-business-segment, with platform
// breakdowns nested inside each segment (see SegmentSection.tsx).
//
// Two-tier classification:
//   1. CURATED segments below win first. They have a preferred accent color
//      (used as a hint), but buildSegments de-duplicates at runtime so no two
//      visible segments ever share a color.
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
  /** Lowercase substrings checked against campaign + ad name. First hit wins. */
  matchers: string[]
}

// Curated segments — order matters (most specific first). These are
// Camelback-specific verticals; they only activate when a campaign name
// contains a matching keyword. Non-Camelback clients simply never match
// them, so all their ads flow through auto-discovery instead.
//
// The `accent` here is a *preferred* color passed to buildSegments. The actual
// rendered color may differ if two segments prefer the same value — buildSegments
// guarantees uniqueness across all visible segments.
const CURATED_SEGMENTS: SegmentDef[] = [
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

function matchCurated(hay: string): SegmentDef | null {
  for (const seg of CURATED_SEGMENTS) {
    for (const m of seg.matchers) {
      if (hay.includes(m)) return seg
    }
  }
  return null
}

// Derive a segment from the first meaningful token of the campaign name.
// Returns id/name/mark/matchers only — accent is assigned by buildSegments.
// "Wedding Q3 — Conversions" → "Wedding". "Camelback Day Skiing" → "Camelback".
// Common prefixes that aren't a vertical (e.g. "Commit 2026:") are stripped.
const PREFIX_NOISE = /^(commit|test|wip|new|copy of|draft)[\s:.-]+/i
function autoSegmentFor(ad: Ad): Omit<SegmentDef, 'accent'> | null {
  const campaign = (ad.campaign ?? '').trim()
  if (!campaign) return null
  const cleaned = campaign.replace(PREFIX_NOISE, '').trim()
  // Year prefix? Skip it. "2026 Aquatopia Traffic" → "Aquatopia".
  const noYear = cleaned.replace(/^\d{4}[\s:.-]+/, '').trim()
  const firstToken = (noYear.split(/[\s:_\-—–|/]+/)[0] ?? '').trim()
  if (!firstToken) return null
  const id = firstToken.toLowerCase()
  return {
    id,
    name:     firstToken[0].toUpperCase() + firstToken.slice(1),
    mark:     firstToken[0].toUpperCase(),
    matchers: [id],
  }
}

export interface BuildSegmentsOptions {
  /** Override the color palette used for all segments. */
  autoPalette?: string[]
  /** Override the accent color of the catch-all "Other" segment. */
  fallbackAccent?: string
}

// Build the final SEGMENTS list dynamically from the ads we actually have.
// Colors are assigned in one pass — each segment gets its preferred color if
// available, otherwise the next unused palette entry. This guarantees no two
// visible segments ever share an accent color.
//
// Curated segments are always present (so colors stay stable even when an ad
// for them temporarily drops off); auto-discovered segments only appear when
// at least one ad maps to them. SegmentSection's empty-state will hide any
// curated segment that ends up with zero ads — see page.tsx `visibleSegments`.
export function buildSegments(ads: Ad[], opts: BuildSegmentsOptions = {}): SegmentDef[] {
  const palette  = opts.autoPalette  ?? AUTO_PALETTE
  const fallback = opts.fallbackAccent
    ? { ...FALLBACK, accent: opts.fallbackAccent }
    : FALLBACK

  const usedAccents = new Set<string>()

  // Pass 1: assign colors to curated segments (preferred color wins unless taken).
  const out: SegmentDef[] = CURATED_SEGMENTS.map(seg => ({
    ...seg,
    accent: pickColor(seg.accent, palette, usedAccents),
  }))

  const seen = new Set<string>(out.map(s => s.id))

  // Pass 2: auto-discover from ad campaign names; assign next available color.
  for (const ad of ads) {
    const hay = `${ad.campaign ?? ''} ${ad.name ?? ''}`.toLowerCase()
    if (matchCurated(hay)) continue
    const auto = autoSegmentFor(ad)
    if (!auto || auto.id === fallback.id) continue
    if (!seen.has(auto.id)) {
      // Pick any unused color (no preference for auto-discovered segments).
      const accent = pickColor(palette[0], palette, usedAccents)
      out.push({ ...auto, accent })
      seen.add(auto.id)
    }
  }

  // Fallback "Other" is assigned LAST through the same dedup, so it can never
  // duplicate a visible segment — even when fallbackAccent equals a palette
  // color (e.g. Commit's #00bdf2 is both autoPalette[0] and fallbackAccent).
  out.push({ ...fallback, accent: pickColor(fallback.accent, palette, usedAccents) })
  return out
}

export function classifySegment(ad: Ad, segments: SegmentDef[]): SegmentId {
  const hay = `${ad.campaign ?? ''} ${ad.name ?? ''}`.toLowerCase()
  // Try curated first (preserve the curated-wins rule), then auto-discovered.
  for (const seg of segments) {
    if (!seg.matchers.length) continue
    for (const m of seg.matchers) {
      if (hay.includes(m)) return seg.id
    }
  }
  return FALLBACK.id
}

// Kept exported for any caller that wants the static curated list (e.g. tests).
export const SEGMENTS = CURATED_SEGMENTS
