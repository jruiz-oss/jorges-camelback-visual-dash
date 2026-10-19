/**
 * How the wall is organised for a client:
 *   'segment' — one section per business segment (Brand, Weddings, Group …),
 *               platforms nested inside (the original layout)
 *   'channel' — one section per platform (Meta, Google Ads, StackAdapt),
 *               campaigns listed inside, no segments
 *
 * Resolution (app/[client]/page.tsx): the admin's per-browser cookie wins, then
 * the {PREFIX}_VIEW_MODE env var (what every visitor sees), then 'segment'.
 * The cookie only changes the admin's own browser; the env var is what makes a
 * mode the default for everyone, same as the ad filter.
 */
export type ViewMode = 'segment' | 'channel'

export const VIEW_MODE_COOKIE = 'view-mode-v1'

export function parseViewMode(v: string | undefined | null): ViewMode | null {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'segment' || s === 'channel' ? s : null
}
