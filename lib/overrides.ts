/**
 * Shared admin overrides for one client's wall, stored in Postgres (lib/kv.ts)
 * under `overrides:v1:<slug>` so EVERY viewer sees what the admin set:
 * segment renames, colors, order, per-ad and per-campaign moves, admin-created
 * segments, and the segment/channel view mode.
 *
 * Before this, renames/colors/order lived in the admin's localStorage and moves
 * / custom segments / view mode in the admin's cookies, so clients on their
 * own devices never saw any of it.
 *
 * Shape is validated on every read and write: the values end up in CSS
 * (colors) and drive server-side bucketing, so nothing unvalidated from a PUT
 * body is ever stored.
 */

import { kvConfigured, kvGetJson, kvSetJson } from './kv'
import { CUSTOM_SEGMENT_PREFIX } from './segments'
import { parseViewMode, type ViewMode } from './view-mode'

export interface Overrides {
  names:          Record<string, string> // segment id → display name
  colors:         Record<string, string> // segment id → #hex accent
  order:          string[]               // segment ids, top to bottom
  adMoves:        Record<string, string> // ad id → segment id
  campaignMoves:  Record<string, string> // campaignKey → segment id
  customSegments: Record<string, string> // custom-… id → name
  viewMode?:      ViewMode
  updatedAt?:     string
}

export type OverridesStorage = 'ok' | 'missing' | 'error'

export const EMPTY_OVERRIDES: Overrides = {
  names: {}, colors: {}, order: [], adMoves: {}, campaignMoves: {}, customSegments: {},
}

const keyFor = (slug: string) => `overrides:v1:${slug}`

// ─── Validation ──────────────────────────────────────────────────────────────
const ID_RE        = /^[^\u0000-\u001f<>"'`\\]{1,120}$/   // segment / ad ids
const CAMP_KEY_RE  = /^[a-z]+:[^\u0000-\u001f]{0,300}$/     // lib/segments.ts campaignKey
const COLOR_RE     = /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i
const CUSTOM_ID_RE = /^custom-[a-z0-9-]{1,48}$/
const LIMITS = { names: 200, colors: 200, order: 200, adMoves: 2000, campaignMoves: 1000, customSegments: 30 }

const isId   = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 60) : '')

function cleanMap(
  raw: unknown, limit: number,
  keyOk: (k: string) => boolean, val: (v: unknown) => string | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= limit) break
    if (!keyOk(k)) continue
    const c = val(v)
    if (c) out[k] = c
  }
  return out
}

export function sanitizeOverrides(raw: unknown): Overrides {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const segVal = (v: unknown) => (isId(v) ? v : null)
  return {
    names:          cleanMap(r.names, LIMITS.names, k => ID_RE.test(k), v => cleanName(v) || null),
    colors:         cleanMap(r.colors, LIMITS.colors, k => ID_RE.test(k), v => (typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : null)),
    order:          Array.isArray(r.order) ? r.order.filter(isId).slice(0, LIMITS.order) : [],
    adMoves:        cleanMap(r.adMoves, LIMITS.adMoves, k => ID_RE.test(k), segVal),
    campaignMoves:  cleanMap(r.campaignMoves, LIMITS.campaignMoves, k => CAMP_KEY_RE.test(k), segVal),
    customSegments: cleanMap(r.customSegments, LIMITS.customSegments, k => CUSTOM_ID_RE.test(k), v => cleanName(v) || null),
    ...(parseViewMode(r.viewMode as string) ? { viewMode: parseViewMode(r.viewMode as string)! } : {}),
    ...(typeof r.updatedAt === 'string' ? { updatedAt: r.updatedAt } : {}),
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────
// Last doc read per client, served while the database is briefly unreachable so the
// wall keeps its renames/moves instead of snapping back to defaults.
const lastGood = new Map<string, Overrides>()

export async function loadOverrides(slug: string): Promise<{ overrides: Overrides; storage: OverridesStorage }> {
  if (!kvConfigured()) return { overrides: EMPTY_OVERRIDES, storage: 'missing' }
  const raw = await kvGetJson<unknown>(keyFor(slug))
  if (raw === null) return { overrides: lastGood.get(slug) ?? EMPTY_OVERRIDES, storage: 'error' }
  const overrides = raw === undefined ? EMPTY_OVERRIDES : sanitizeOverrides(raw)
  lastGood.set(slug, overrides)
  return { overrides, storage: 'ok' }
}

export async function saveOverrides(slug: string, doc: Overrides): Promise<boolean> {
  return kvSetJson(keyFor(slug), { ...doc, updatedAt: new Date().toISOString() })
}

// ─── Operations (one change per PUT, applied server-side) ───────────────────
// Applying single ops to the current doc (instead of the browser PUTting the
// whole doc) means two admins editing different things don't overwrite each
// other, same approach as the goals route.
export type OverrideOp =
  | { op: 'name';          id: string; name: string }
  | { op: 'color';         id: string; color: string | null }
  | { op: 'order';         ids: string[] }
  | { op: 'moveAd';        adId: string; segmentId: string | null }
  | { op: 'moveCampaign';  key: string; segmentId: string | null; adIds: string[] }
  | { op: 'createSegment'; id: string; name: string }
  | { op: 'removeSegment'; id: string }
  | { op: 'viewMode';      mode: ViewMode | null }
  | { op: 'import';        doc: unknown }

/** Returns the new doc, or an error string for a bad op. */
export function applyOp(doc: Overrides, body: unknown): Overrides | string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const next: Overrides = {
    ...doc,
    names: { ...doc.names }, colors: { ...doc.colors }, order: [...doc.order],
    adMoves: { ...doc.adMoves }, campaignMoves: { ...doc.campaignMoves },
    customSegments: { ...doc.customSegments },
  }
  const adIds = () => (Array.isArray(b.adIds) ? b.adIds.filter(isId).slice(0, 500) : [])

  switch (b.op) {
    case 'name': {
      if (!isId(b.id)) return 'bad id'
      const name = cleanName(b.name)
      if (name) next.names[b.id] = name
      else delete next.names[b.id]
      break
    }
    case 'color': {
      if (!isId(b.id)) return 'bad id'
      if (b.color === null) delete next.colors[b.id]
      else if (typeof b.color === 'string' && COLOR_RE.test(b.color)) next.colors[b.id] = b.color.toLowerCase()
      else return 'bad color'
      break
    }
    case 'order': {
      if (!Array.isArray(b.ids)) return 'bad order'
      next.order = b.ids.filter(isId).slice(0, LIMITS.order)
      break
    }
    case 'moveAd': {
      if (!isId(b.adId)) return 'bad ad id'
      if (b.segmentId === null) delete next.adMoves[b.adId]
      else if (isId(b.segmentId)) next.adMoves[b.adId] = b.segmentId
      else return 'bad segment id'
      break
    }
    case 'moveCampaign': {
      if (typeof b.key !== 'string' || !CAMP_KEY_RE.test(b.key)) return 'bad campaign key'
      if (b.segmentId === null) delete next.campaignMoves[b.key]
      else if (isId(b.segmentId)) next.campaignMoves[b.key] = b.segmentId
      else return 'bad segment id'
      // A campaign move (or reset) also drops older per-tile moves inside it,
      // otherwise they'd out-vote the campaign move (per-ad wins in page.tsx).
      for (const id of adIds()) delete next.adMoves[id]
      break
    }
    case 'createSegment': {
      if (typeof b.id !== 'string' || !CUSTOM_ID_RE.test(b.id)) return 'bad segment id'
      const name = cleanName(b.name)
      if (!name) return 'bad name'
      if (!(b.id in next.customSegments) && Object.keys(next.customSegments).length >= LIMITS.customSegments) return 'too many segments'
      next.customSegments[b.id] = next.customSegments[b.id] ?? name
      break
    }
    case 'removeSegment': {
      if (typeof b.id !== 'string' || !b.id.startsWith(CUSTOM_SEGMENT_PREFIX)) return 'bad segment id'
      delete next.customSegments[b.id]
      break
    }
    case 'viewMode': {
      if (b.mode === null) delete next.viewMode
      else {
        const m = parseViewMode(b.mode as string)
        if (!m) return 'bad mode'
        next.viewMode = m
      }
      break
    }
    case 'import': {
      // One-time import of settings that used to live in the admin's browser.
      // Anything already saved on the server wins over the imported value.
      const imp = sanitizeOverrides(b.doc)
      next.names          = { ...imp.names, ...next.names }
      next.colors         = { ...imp.colors, ...next.colors }
      next.order          = next.order.length ? next.order : imp.order
      next.adMoves        = { ...imp.adMoves, ...next.adMoves }
      next.campaignMoves  = { ...imp.campaignMoves, ...next.campaignMoves }
      next.customSegments = { ...imp.customSegments, ...next.customSegments }
      if (!next.viewMode && imp.viewMode) next.viewMode = imp.viewMode
      return sanitizeOverrides(next)
    }
    default:
      return 'bad op'
  }
  // Re-run the caps (e.g. adMoves growing past its limit).
  return sanitizeOverrides(next)
}
