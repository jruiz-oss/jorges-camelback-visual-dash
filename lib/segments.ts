import type { Ad } from './types'

// Top-level grouping for the dashboard. Was previously per-platform; now
// per-business-segment so a marketer can see "everything we're running for
// Aquatopia right now" in one place, with platform breakdowns underneath.
//
// Segments are identified by substring matches against the ad's campaign name
// (and ad name as a fallback). First match wins, in the order declared below.
// Anything that doesn't match lands in "other" — surfaced as a visible bucket
// so nothing silently disappears.

export type SegmentId = 'aquatopia' | 'lodge' | 'cma' | 'other'

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

// Order is intentional: Aquatopia is the most specific name, Lodge is unique,
// CMA matches the long-form name + a handful of related activity keywords.
// "camelback" alone is deliberately NOT a CMA matcher — it's the parent brand
// and would mis-bucket Lodge / Aquatopia campaigns that include the brand name.
export const SEGMENTS: SegmentDef[] = [
  {
    id:       'aquatopia',
    name:     'Aquatopia',
    accent:   '#1ba0d9',
    mark:     'A',
    matchers: ['aquatopia'],
  },
  {
    id:       'lodge',
    name:     'Lodge',
    accent:   '#c08a4d',
    mark:     'L',
    matchers: ['lodge'],
  },
  {
    id:       'cma',
    name:     'Camelback Mountain Adventures',
    accent:   '#4a8b3a',
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
    id:       'other',
    name:     'Other',
    accent:   '#888888',
    mark:     '·',
    matchers: [],
  },
]

export function classifySegment(ad: Ad): SegmentId {
  const hay = `${ad.campaign ?? ''} ${ad.name ?? ''}`.toLowerCase()
  for (const seg of SEGMENTS) {
    if (!seg.matchers.length) continue
    for (const m of seg.matchers) {
      if (hay.includes(m)) return seg.id
    }
  }
  return 'other'
}
