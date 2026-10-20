/**
 * Admin-only performance metrics for the green/yellow/red tile dots.
 *
 * Kept completely separate from the live-wall fetchers (lib/meta.ts,
 * lib/stackadapt.ts) on purpose: these calls only run when an admin opens
 * edit mode (GET /api/admin/perf), never on the normal page render or the
 * 60s soft refresh, so regular viewers cost zero extra API calls.
 *
 * Window: last 7 complete days (excludes today, which is always partial).
 *
 *   Meta       — ONE paginated /insights call at ad level with spend,
 *                impressions, inline_link_clicks and the `actions` array.
 *                Dots are per ad.
 *   StackAdapt — ONE campaignDelivery call (TOTAL granularity) after a
 *                one-time schema introspection that's cached per warm
 *                instance. Metrics are per CAMPAIGN (every tile in the lane
 *                shares a dot); per-ad delivery would be another query.
 *
 * Results are cached in memory for 10 minutes per client.
 */

import type { PerfMetrics } from './goals'
import { GRAPH, normalizeMetaAccountId } from './meta'

export const PERF_WINDOW_LABEL = 'last 7 days'
const CACHE_TTL_MS    = 10 * 60 * 1000
const MIN_REFRESH_MS  = 60 * 1000

export interface MetaAdPerf extends PerfMetrics { campaign: string }
export interface PerfPayload {
  window:  { label: string; since: string; until: string }
  fetchedAt: string
  meta: {
    ok: boolean
    /** ad id → metrics (ids match Ad.id on Meta tiles). */
    ads: Record<string, MetaAdPerf>
    /** Every action_type seen with count > 0, for the event picker. */
    events: string[]
    /** Account-wide action totals, used to auto-pick a conversion event. */
    actionTotals: Record<string, number>
    error?: string
  }
  stackadapt: {
    ok: boolean
    connected: boolean
    /** StackAdapt campaign id → metrics (matches Ad.campaignId). */
    campaigns: Record<string, PerfMetrics>
    /** Which schema fields were used — surfaced in the goals panel so a
     *  mis-detected field is visible without digging through logs. */
    fields?: Record<string, string>
    error?: string
  }
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function ymd(d: Date) { return d.toISOString().slice(0, 10) }
function windowDates() {
  const until = new Date(); until.setUTCDate(until.getUTCDate() - 1)
  const since = new Date(); since.setUTCDate(since.getUTCDate() - 7)
  return { since: ymd(since), until: ymd(until) }
}

// ─── Meta ────────────────────────────────────────────────────────────────────

type MetaRow = {
  ad_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  inline_link_clicks?: string
  actions?: Array<{ action_type?: string; value?: string }>
}

export async function fetchMetaPerf(rawAccountId: string): Promise<PerfPayload['meta']> {
  const accountId = normalizeMetaAccountId(rawAccountId)
  const token = process.env.META_ACCESS_TOKEN
  const empty = { ok: false, ads: {}, events: [], actionTotals: {} }
  if (!token || !accountId) return { ...empty, error: 'Meta not configured' }

  const ads: Record<string, MetaAdPerf> = {}
  const actionTotals: Record<string, number> = {}
  const fields = 'ad_id,campaign_name,spend,impressions,inline_link_clicks,actions'
  let url: string | null =
    `${GRAPH}/${accountId}/insights?level=ad&date_preset=last_7d` +
    `&fields=${encodeURIComponent(fields)}&limit=500`

  try {
    let pages = 0
    while (url && pages++ < 20) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await res.json() as { data?: MetaRow[]; paging?: { next?: string }; error?: { message: string } }
      if (data.error) {
        console.error('[perf/Meta] insights error:', data.error.message)
        return { ...empty, error: data.error.message }
      }
      for (const row of data.data ?? []) {
        if (!row.ad_id) continue
        const actions: Record<string, number> = {}
        for (const a of row.actions ?? []) {
          const v = Number(a.value)
          if (a.action_type && Number.isFinite(v) && v > 0) {
            actions[a.action_type] = v
            actionTotals[a.action_type] = (actionTotals[a.action_type] ?? 0) + v
          }
        }
        ads[row.ad_id] = {
          campaign:    row.campaign_name ?? '',
          spend:       Number(row.spend) || 0,
          impressions: Number(row.impressions) || 0,
          clicks:      Number(row.inline_link_clicks) || 0,
          actions,
        }
      }
      url = data.paging?.next ?? null
    }
  } catch (err) {
    console.error('[perf/Meta] fetch failed:', err)
    return { ...empty, error: 'Meta request failed' }
  }

  console.log(`[perf/Meta] ${Object.keys(ads).length} ads with 7d delivery`)
  return { ok: true, ads, events: Object.keys(actionTotals), actionTotals }
}

// ─── StackAdapt ──────────────────────────────────────────────────────────────
// The StackAdapt GraphQL schema isn't documented well enough to hardcode (see
// the CHANGELOG history for lib/stackadapt.ts), so the delivery query is
// built from introspection, same approach as the live-wall spend check.
const SA_URL = 'https://api.stackadapt.com/graphql'
const TYPE_REF = 'name kind ofType { name kind ofType { name kind ofType { name kind } } }'

type TypeRef = { name?: string | null; kind?: string; ofType?: TypeRef | null }
type FieldInfo = { name: string; type: TypeRef; args?: Array<{ name: string; type: TypeRef }> }
type TypeInfo = {
  name: string; kind: string
  fields?: FieldInfo[] | null
  inputFields?: Array<{ name: string }> | null
  enumValues?: Array<{ name: string }> | null
  possibleTypes?: Array<{ name: string }> | null
}

function unwrap(t: TypeRef | null | undefined): { name: string | null; kind: string | null; list: boolean } {
  let list = false
  let cur = t
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) {
    if (cur.kind === 'LIST') list = true
    cur = cur.ofType
  }
  return { name: cur?.name ?? null, kind: cur?.kind ?? null, list }
}

async function saGql(apiKey: string, query: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(SA_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      const hit = Array.isArray(json?.errors) && json.errors.find((e: any) => /rate limit/i.test(e?.message ?? ''))
      if (!hit) return json
      const secs = Number(hit?.extensions?.cost?.throttle?.retryAfterInSeconds) || 3
      await new Promise(r => setTimeout(r, Math.min(10, secs) * 1000))
    } catch (err) {
      console.warn('[perf/StackAdapt] request failed:', err)
      return null
    }
  }
  return null
}

const typeCache = new Map<string, TypeInfo | null>()
async function getTypes(apiKey: string, names: string[]): Promise<Record<string, TypeInfo | null>> {
  const missing = names.filter(n => !typeCache.has(`${apiKey}:${n}`))
  if (missing.length) {
    const q = `{ ${missing.map((n, i) =>
      `t${i}: __type(name: "${n.replace(/[^A-Za-z0-9_]/g, '')}") { name kind fields { name type { ${TYPE_REF} } } inputFields { name } enumValues { name } possibleTypes { name } }`,
    ).join('\n')} }`
    const res = await saGql(apiKey, q)
    // Only cache real answers: a throttled/failed introspection (res null)
    // used to be cached as "type doesn't exist" for the life of the instance.
    if (res?.data) missing.forEach((n, i) => typeCache.set(`${apiKey}:${n}`, res.data[`t${i}`] ?? null))
  }
  const out: Record<string, TypeInfo | null> = {}
  for (const n of names) out[n] = typeCache.get(`${apiKey}:${n}`) ?? null
  return out
}

type SaPlan = {
  argsSel:  (since: string, until: string, advertiserId?: string) => string
  selection: string
  /** Walks one response into rows. */
  rows:     (data: any) => any[]
  readId:   (row: any) => string | null
  read:     (row: any) => PerfMetrics
  fields:   Record<string, string>
}
const planCache = new Map<string, SaPlan | null>()
// When building the plan fails, retry after this long instead of never (the
// failure is often a throttled introspection call, not a real schema gap).
const PLAN_RETRY_MS = 10 * 60 * 1000
const planFailedAt = new Map<string, number>()

const scalar = (f: FieldInfo) => {
  const u = unwrap(f.type)
  return !u.list && (u.kind === 'SCALAR' || u.kind === 'ENUM')
}
function pickMetric(fields: FieldInfo[], re: RegExp, exclude?: RegExp): string | null {
  const hit = fields.filter(f => scalar(f) && re.test(f.name) && !(exclude && exclude.test(f.name)))
  // Prefer the shortest name: "impressions" over "impressionsViewable".
  hit.sort((a, b) => a.name.length - b.name.length)
  return hit[0]?.name ?? null
}
function metricFieldsOf(fields: FieldInfo[]) {
  return {
    spend:       pickMetric(fields, /^(total)?(cost|spend)/i, /per|rate|ecpm|cpm|cpc|cpa|model|type/i),
    impressions: pickMetric(fields, /^impressions?/i, /rate|share|view|percent/i),
    clicks:      pickMetric(fields, /^clicks?/i, /rate|ctr|through|per/i),
    conversions: pickMetric(fields, /^conversions?/i, /rate|revenue|value|cost|per/i),
  }
}

async function buildPlan(apiKey: string): Promise<SaPlan | null> {
  const base = await getTypes(apiKey, ['Query', 'DateRangeInput'])
  const qField = base.Query?.fields?.find(f => f.name === 'campaignDelivery')
  if (!qField) { console.warn('[perf/StackAdapt] no campaignDelivery field'); return null }

  // Query.fields above doesn't include args, so fetch them separately.
  const argRes = await saGql(apiKey, `{ q: __type(name: "Query") { fields { name args { name type { ${TYPE_REF} } } } } }`)
  const args: Array<{ name: string; type: TypeRef }> =
    argRes?.data?.q?.fields?.find((f: any) => f.name === 'campaignDelivery')?.args ?? []
  const argType = (n: string) => unwrap(args.find(a => a.name === n)?.type).name
  const dateFields = (base.DateRangeInput?.inputFields ?? []).map(f => f.name)
  const fromF = dateFields.find(f => /^(from|start)/i.test(f)) ?? 'from'
  const toF   = dateFields.find(f => /^(to|end)/i.test(f)) ?? 'to'

  const retName = unwrap(qField.type).name
  const t1 = await getTypes(apiKey, [argType('filterBy'), argType('granularity'), argType('dataType'), retName].filter(Boolean) as string[])
  const filterFields = (t1[argType('filterBy') ?? '']?.inputFields ?? []).map(f => f.name)
  const granValues   = (t1[argType('granularity') ?? '']?.enumValues ?? []).map(v => v.name)
  const dataValues   = (t1[argType('dataType') ?? '']?.enumValues ?? []).map(v => v.name)
  const advField     = filterFields.find(f => /^advertiserIds?$/i.test(f)) ?? null
  const gran = granValues.find(v => /^total$/i.test(v)) ?? granValues.find(v => /^(daily|day)$/i.test(v)) ?? null
  // Same dataType choice as the live-wall spend check in lib/stackadapt.ts,
  // which is known to return delivery rows.
  const dataType = args.some(a => a.name === 'dataType')
    ? (dataValues.find(v => /spend|cost/i.test(v)) ?? dataValues[0] ?? null)
    : null

  // Return type may be a union ("Outcome") — use the first member with fields.
  let ret = t1[retName ?? ''] ?? null
  let fragment = ''
  if (ret?.kind === 'UNION' && ret.possibleTypes?.length) {
    const members = await getTypes(apiKey, ret.possibleTypes.map(p => p.name))
    // The success member holds the rows either as a list field or as a
    // connection object (`records { nodes { … } }`). The old check only looked
    // for a list field, so a connection-shaped payload returned null here with
    // no log and the delivery check / perf dots silently never worked.
    const ms = Object.values(members).filter((t): t is TypeInfo => !!t?.fields?.length)
    const m = ms.find(t => t.fields!.some(f => unwrap(f.type).list))
      ?? ms.find(t => t.fields!.some(f => unwrap(f.type).kind === 'OBJECT' && /^(records|rows|data)$/i.test(f.name)))
    if (!m) {
      console.warn('[perf/StackAdapt] no usable member in', ret.name, 'members:', ms.map(t => `${t.name}{${t.fields!.map(f => f.name).join(',')}}`).join(' | '))
      return null
    }
    ret = m; fragment = m.name
  }
  const listField = (ret?.fields ?? []).find(f => unwrap(f.type).list && /^(records|rows|nodes|data|items|edges)$/i.test(f.name))
    ?? (ret?.fields ?? []).find(f => unwrap(f.type).list && unwrap(f.type).kind === 'OBJECT')
  // Or a connection object (records { nodes { … } }).
  let path: string[] = []
  let rowTypeName: string | null = null
  if (listField) {
    path = [listField.name]; rowTypeName = unwrap(listField.type).name
  } else {
    const conn = (ret?.fields ?? []).find(f => unwrap(f.type).kind === 'OBJECT' && /^(records|rows|data)$/i.test(f.name))
    if (!conn) { console.warn('[perf/StackAdapt] no row list on', ret?.name); return null }
    const connType = (await getTypes(apiKey, [unwrap(conn.type).name!]))[unwrap(conn.type).name!]
    const nodes = connType?.fields?.find(f => f.name === 'nodes' && unwrap(f.type).list)
    if (!nodes) {
      console.warn('[perf/StackAdapt] no nodes list on', connType?.name, 'fields:', (connType?.fields ?? []).map(f => f.name).join(','))
      return null
    }
    path = [conn.name, 'nodes']; rowTypeName = unwrap(nodes.type).name
  }
  if (!rowTypeName) { console.warn('[perf/StackAdapt] no row type'); return null }
  let rowType = (await getTypes(apiKey, [rowTypeName]))[rowTypeName]
  // edges { node { … } }
  if (path[path.length - 1] === 'edges') {
    const nodeF = rowType?.fields?.find(f => f.name === 'node')
    if (!nodeF) { console.warn('[perf/StackAdapt] edges without node on', rowTypeName); return null }
    const nn = unwrap(nodeF.type).name!
    rowType = (await getTypes(apiKey, [nn]))[nn]
    path = [...path, 'node']
  }
  const rowFields = rowType?.fields ?? []

  // Campaign id: campaignId scalar, else campaign { id }, else id.
  // `campaign` may be an INTERFACE, not an OBJECT: StackAdapt's schema types
  // campaigns as an interface (NativeAd.campaign is one, per the schema log).
  // Accepting only OBJECT here is what made production log "no campaign id on
  // CampaignDeliveryRecord", so the live-wall delivery filter and the
  // StackAdapt perf dots never ran. `campaign { id }` is valid on an interface
  // that declares `id`.
  let idSel = ''; let readIdPath: string[] = []
  const isObj = (f: FieldInfo) => ['OBJECT', 'INTERFACE'].includes(unwrap(f.type).kind ?? '')
  const campIdF = rowFields.find(f => /^campaignId$/i.test(f.name) && scalar(f))
  const campObjF = rowFields.find(f => /^campaign$/i.test(f.name) && isObj(f))
  if (campIdF) { idSel = campIdF.name; readIdPath = [campIdF.name] }
  else if (campObjF) { idSel = `${campObjF.name} { id }`; readIdPath = [campObjF.name, 'id'] }
  else if (rowFields.some(f => f.name === 'id')) { idSel = 'id'; readIdPath = ['id'] }
  else {
    console.warn('[perf/StackAdapt] no campaign id on', rowTypeName, 'fields:',
      rowFields.map(f => `${f.name}(${unwrap(f.type).kind})`).join(', '))
    return null
  }

  // Metrics: flat on the row, or nested under an object like `metrics`.
  let flat = metricFieldsOf(rowFields)
  let metricPrefix: string | null = null
  const count = (m: ReturnType<typeof metricFieldsOf>) => Object.values(m).filter(Boolean).length
  for (const f of rowFields.filter(f => unwrap(f.type).kind === 'OBJECT' && /metric|stat|delivery|total/i.test(f.name))) {
    const tn = unwrap(f.type).name!
    const sub = metricFieldsOf((await getTypes(apiKey, [tn]))[tn]?.fields ?? [])
    if (count(sub) > count(flat)) { flat = sub; metricPrefix = f.name }
  }
  if (!flat.impressions && !flat.spend) { console.warn('[perf/StackAdapt] no metric fields on', rowTypeName); return null }

  const metricNames = Object.values(flat).filter(Boolean) as string[]
  const metricSel = metricPrefix ? `${metricPrefix} { ${metricNames.join(' ')} }` : metricNames.join(' ')
  const inner = `${idSel} ${metricSel}`
  let selection = inner
  for (let i = path.length - 1; i >= 0; i--) selection = `${path[i]} { ${selection} }`
  if (fragment) selection = `... on ${fragment} { ${selection} }`

  const get = (obj: any, p: string[]) => p.reduce((o, k) => (o == null ? o : o[k]), obj)
  const mget = (row: any, name: string | null) => {
    if (!name) return 0
    const v = Number(metricPrefix ? row?.[metricPrefix]?.[name] : row?.[name])
    return Number.isFinite(v) ? v : 0
  }
  const fields: Record<string, string> = {
    rows: path.join('.'),
    campaignId: readIdPath.join('.'),
    granularity: gran ?? '(none)',
    ...(dataType ? { dataType } : {}),
  }
  for (const [k, v] of Object.entries(flat)) fields[k] = v ? (metricPrefix ? `${metricPrefix}.${v}` : v) : '(not found)'
  console.log('[perf/StackAdapt] delivery plan:', JSON.stringify(fields))

  return {
    argsSel: (since, until, advertiserId) => {
      const parts = [`date: { ${fromF}: "${since}", ${toF}: "${until}" }`]
      if (gran) parts.push(`granularity: ${gran}`)
      if (dataType) parts.push(`dataType: ${dataType}`)
      const adv = (advertiserId ?? '').replace(/\D/g, '')
      if (advField && adv) parts.push(`filterBy: { ${advField}: [${adv}] }`)
      return parts.join(', ')
    },
    selection,
    rows: (data: any) => {
      const root = data?.campaignDelivery
      const list = get(root, path)
      return Array.isArray(list) ? list : []
    },
    readId: row => { const v = get(row, readIdPath); return v == null ? null : String(v) },
    read: row => ({
      spend:       mget(row, flat.spend),
      impressions: mget(row, flat.impressions),
      clicks:      mget(row, flat.clicks),
      conversions: mget(row, flat.conversions),
    }),
    fields,
  }
}

async function getPlan(apiKey: string): Promise<SaPlan | null> {
  const cached = planCache.get(apiKey)
  if (cached) return cached
  if (cached === null && Date.now() - (planFailedAt.get(apiKey) ?? 0) < PLAN_RETRY_MS) return null
  let plan: SaPlan | null
  try { plan = await buildPlan(apiKey) } catch (err) { console.warn('[perf/StackAdapt] plan failed:', err); plan = null }
  if (!plan) { console.warn('[perf/StackAdapt] delivery plan unavailable (retrying in 10 min)'); planFailedAt.set(apiKey, Date.now()) }
  planCache.set(apiKey, plan)
  return plan
}

/**
 * Live-wall liveness check (lib/stackadapt.ts): campaign id → spend +
 * impressions for [since, until], scoped to one advertiser. Reuses the
 * introspected delivery plan above, which is the one that is known to map
 * StackAdapt's union/connection response shape. Returns null when the schema
 * can't be mapped or the query fails, so the caller can tell "no delivery"
 * (empty map) apart from "couldn't check" (null).
 */
export async function fetchStackAdaptCampaignDelivery(
  apiKey: string, advertiserId: string, since: string, until: string,
): Promise<Map<string, { spend: number; impressions: number }> | null> {
  const plan = await getPlan(apiKey)
  if (!plan) return null
  const res = await saGql(apiKey, `{ campaignDelivery(${plan.argsSel(since, until, advertiserId)}) { ${plan.selection} } }`)
  if (!res || res.errors) {
    console.warn('[StackAdapt] delivery check failed:', JSON.stringify(res?.errors ?? 'no response').slice(0, 300))
    planCache.delete(apiKey)
    return null
  }
  const out = new Map<string, { spend: number; impressions: number }>()
  for (const row of plan.rows(res.data)) {
    const id = plan.readId(row)
    if (!id) continue
    const m = plan.read(row)
    const prev = out.get(id)
    out.set(id, { spend: (prev?.spend ?? 0) + m.spend, impressions: (prev?.impressions ?? 0) + m.impressions })
  }
  return out
}

export async function fetchStackAdaptPerf(apiKey: string, advertiserId?: string): Promise<PerfPayload['stackadapt']> {
  if (!apiKey) return { ok: false, connected: false, campaigns: {} }
  // Fail closed — same reason as lib/stackadapt.ts: account-wide key, so no
  // advertiser ID means no way to scope the numbers to this client.
  if (!String(advertiserId ?? '').trim()) {
    return { ok: false, connected: true, campaigns: {}, error: 'StackAdapt advertiser ID is not set for this client' }
  }
  const plan = await getPlan(apiKey)
  if (!plan) return { ok: false, connected: true, campaigns: {}, error: 'Could not map StackAdapt delivery schema (see logs: [perf/StackAdapt])' }

  const { since, until } = windowDates()
  const res = await saGql(apiKey, `{ campaignDelivery(${plan.argsSel(since, until, advertiserId)}) { ${plan.selection} } }`)
  if (!res || res.errors) {
    const msg = JSON.stringify(res?.errors ?? 'no response').slice(0, 300)
    console.warn('[perf/StackAdapt] delivery query failed:', msg)
    // Schema may have changed under a warm instance — rebuild next time.
    planCache.delete(apiKey)
    return { ok: false, connected: true, campaigns: {}, fields: plan.fields, error: 'StackAdapt delivery query failed' }
  }
  const campaigns: Record<string, PerfMetrics> = {}
  for (const row of plan.rows(res.data)) {
    const id = plan.readId(row)
    if (!id) continue
    const m = plan.read(row)
    const prev = campaigns[id]
    // DAILY granularity (when TOTAL isn't offered) → sum the days.
    campaigns[id] = prev
      ? { spend: prev.spend + m.spend, impressions: prev.impressions + m.impressions, clicks: prev.clicks + m.clicks, conversions: (prev.conversions ?? 0) + (m.conversions ?? 0) }
      : m
  }
  console.log(`[perf/StackAdapt] ${Object.keys(campaigns).length} campaigns with 7d delivery`)
  return { ok: true, connected: true, campaigns, fields: plan.fields }
}

// ─── Cache + entry point ─────────────────────────────────────────────────────
const perfCache = new Map<string, { at: number; data: PerfPayload }>()

export async function getPerf(
  slug: string,
  creds: { metaAccountId: string; saApiKey: string; saAdvertiserId?: string },
  fresh = false,
): Promise<PerfPayload> {
  const hit = perfCache.get(slug)
  const age = hit ? Date.now() - hit.at : Infinity
  if (hit && (age < (fresh ? MIN_REFRESH_MS : CACHE_TTL_MS))) return hit.data

  const [meta, stackadapt] = await Promise.all([
    fetchMetaPerf(creds.metaAccountId),
    fetchStackAdaptPerf(creds.saApiKey, creds.saAdvertiserId),
  ])
  const data: PerfPayload = {
    window: { label: PERF_WINDOW_LABEL, ...windowDates() },
    fetchedAt: new Date().toISOString(),
    meta, stackadapt,
  }
  // Don't pin a failed result for 10 minutes.
  if (meta.ok || stackadapt.ok) perfCache.set(slug, { at: Date.now(), data })
  return data
}
