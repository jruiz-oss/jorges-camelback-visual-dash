import type { Ad } from './types'

// Top-level grouping for the dashboard — per-business-segment, with platform
// breakdowns nested inside each segment (see SegmentSection.tsx).
//
// Two-tier classification:
//   1. CURATED segments below win first. They have hand-picked accent colors
//      and short letter marks for the nav pills.
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

// Curated segments — order matters (most specific first). Add a new client
// vertical here when you want a branded color/mark; otherwise auto-discovery
// will surface it as a generic segment.
//
// Accent colors are pulled from the Camelback brand book:
//   Slate #242841 · Indigo #1D446B · Orange #F97529 · Light Orange #F7B45B
//   Spruce #21432B · Pine #4C9429 · Camelback Red #FB2E33 · Midnight #1F1E23
const CURATED_SEGMENTS: SegmentDef[] = [
  {
    id:       'aquatopia',
    name:     'Aquatopia',
    accent:   '#1D446B',   // Indigo — water/depth
    mark:     'A',
    matchers: ['aquatopia'],
  },
  {
    id:       'weddings',
    name:     'Weddings',
    accent:   '#FB2E33',   // Camelback Red — lifestyle accent
    mark:     'W',
    matchers: ['wedding', 'weddings'],
  },
  {
    id:       'lodge',
    name:     'Lodge',
    accent:   '#F7B45B',   // Light Orange — warm cabin tone
    mark:     'L',
    matchers: ['lodge'],
  },
  {
    id:       'cma',
    name:     'Camelback Mountain Adventures',
    accent:   '#4C9429',   // Pine — mountain green
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
    accent:   '#242841',   // Slate — professional
    mark:     'R',
    matchers: ['recruit', 'hiring', 'jobs', 'careers'],
  },
]

// Palette used by auto-discovered segments. Deterministic per id so the same
// segment always renders with the same color across refreshes. All values are
// pulled from the Camelback brand palette so on-brand color is guaranteed
// regardless of what new verticals appear.
const AUTO_PALETTE = [
  '#F97529', // Orange
  '#1D446B', // Indigo
  '#4C9429', // Pine
  '#FB2E33', // Camelback Red
  '#21432B', // Spruce
  '#F7B45B', // Light Orange
  '#242841', // Slate
  '#1F1E23', // Midnight
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
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
// "Wedding Q3 — Conversions" → "Wedding". "Camelback Day Skiing" → "Camelback".
// Common prefixes that aren't a vertical (e.g. "Commit 2026:") are stripped.
const PREFIX_NOISE = /^(commit|test|wip|new|copy of|draft)[\s:.-]+/i
function autoSegmentFor(ad: Ad): SegmentDef {
  const campaign = (ad.campaign ?? '').trim()
  if (!campaign) return FALLBACK
  const cleaned = campaign.replace(PREFIX_NOISE, '').trim()
  // Year prefix? Skip it. "2026 Aquatopia Traffic" → "Aquatopia".
  const noYear = cleaned.replace(/^\d{4}[\s:.-]+/, '').trim()
  const firstToken = (noYear.split(/[\s:_\-—–|/]+/)[0] ?? '').trim()
  if (!firstToken) return FALLBACK
  const id = firstToken.toLowerCase()
  const name = firstToken[0].toUpperCase() + firstToken.slice(1)
  return {
    id,
    name,
    accent:   AUTO_PALETTE[hash(id) % AUTO_PALETTE.length],
    mark:     firstToken[0].toUpperCase(),
    matchers: [id],
  }
}

// Build the final SEGMENTS list dynamically from the ads we actually have.
// Curated segments are always present (so colors stay stable even when an ad
// for them temporarily drops off); auto-discovered segments only appear when
// at least one ad maps to them. SegmentSection's empty-state will hide any
// curated segment that ends up with zero ads — see page.tsx `visibleSegments`.
export function buildSegments(ads: Ad[]): SegmentDef[] {
  const out: SegmentDef[] = [...CURATED_SEGMENTS]
  const seen = new Set<string>(out.map(s => s.id))

  for (const ad of ads) {
    const hay = `${ad.campaign ?? ''} ${ad.name ?? ''}`.toLowerCase()
    if (matchCurated(hay)) continue
    const auto = autoSegmentFor(ad)
    if (auto.id === FALLBACK.id) continue
    if (!seen.has(auto.id)) {
      out.push(auto)
      seen.add(auto.id)
    }
  }
  out.push(FALLBACK)
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
