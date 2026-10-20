/**
 * How the wall is organised for a client:
 *   'segment' — one section per business segment (Brand, Weddings, Group …),
 *               platforms nested inside (the original layout)
 *   'channel' — one section per platform (Meta, Google Ads, StackAdapt),
 *               campaigns listed inside, no segments
 *
 * Resolution (app/[client]/page.tsx): the mode the admin saved from the footer
 * "View" button (shared overrides in the database, lib/overrides.ts — every viewer),
 * then the {PREFIX}_VIEW_MODE env var, then 'segment'.
 */
export type ViewMode = 'segment' | 'channel'

/** Old per-browser cookie. Only read once to import an old choice. */
export const VIEW_MODE_COOKIE = 'view-mode-v1'

export function parseViewMode(v: string | undefined | null): ViewMode | null {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'segment' || s === 'channel' ? s : null
}
