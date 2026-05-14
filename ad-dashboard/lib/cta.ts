// Per-campaign CTA pill text used on creative tiles.
//
// Why a hardcoded map (vs. a field on Ad):
// Meta / Google / StackAdapt all expose a per-creative call-to-action, but each
// in a different shape (Meta's `call_to_action_type` enum, Google's CTA asset,
// StackAdapt's creative metadata). Surfacing them through the connectors is a
// bigger lift than this redesign needs. A small hand-maintained map keyed off
// the campaign name gets the visual right today; we can promote it to a real
// data-layer field later without changing the call sites.
//
// Keys are matched case-insensitive against substrings of the campaign name,
// in order — first match wins. Add new clients/campaigns at the top.

type Platform = 'meta' | 'google' | 'stackadapt'

interface CtaRule {
  match: string        // substring (case-insensitive) of campaign name
  cta: string
}

// Per-campaign overrides. Substring-matched so "Aquatopia — Traffic" and
// "Aquatopia — Search" both hit the same rule.
const CAMPAIGN_RULES: CtaRule[] = [
  { match: 'aquatopia',          cta: 'Book Tickets' },
  { match: 'wedding',            cta: 'Inquire Today' },
  { match: 'recruit',            cta: 'Apply Now' },
  { match: 'jobs',               cta: 'Apply Now' },
  { match: 'hiring',             cta: 'Apply Now' },
  { match: 'camelback',          cta: 'Plan Your Trip' },
  { match: 'mountain adventure', cta: 'Plan Your Trip' },
  { match: 'retarget',           cta: 'Come Back' },
  { match: 'awareness',          cta: 'Learn More' },
]

// Per-platform fallback. Loose enough to read like an ad but specific enough
// to feel real on each surface.
const PLATFORM_DEFAULTS: Record<Platform, string> = {
  meta:       'Learn More',
  google:     'Visit Site',
  stackadapt: 'Learn More',
}

export function ctaForCampaign(campaign: string | undefined, platform: Platform): string {
  const c = (campaign ?? '').toLowerCase()
  if (c) {
    const hit = CAMPAIGN_RULES.find(r => c.includes(r.match))
    if (hit) return hit.cta
  }
  return PLATFORM_DEFAULTS[platform]
}
