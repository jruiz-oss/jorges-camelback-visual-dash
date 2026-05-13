# Changelog

Running log of meaningful changes to the ad dashboard. Newest at the top. Each entry explains **what** changed and **why** the change works the way it does, so future debugging starts with context instead of guesswork.

---

## 2026-05-13 — Visual polish pass

### What changed

**`app/layout.tsx`** — body gets a real font and depth
- **Inter** is now loaded from Google Fonts (preconnect + display:swap), weights 400/500/600/700/800. Single biggest "this feels like a real app" upgrade compared to the system font stack.
- Body background was a flat `#f1f5f9`; now it's a layered gradient: a soft **indigo radial glow at the top** (`rgba(99,102,241,.10)` peaking around 50% / -160px), a smaller cyan-ish radial at the top-right (`rgba(56,189,248,.06)`), and a vertical slate gradient `#f8fafc → #eef2f7 → #e7ecf3` underneath. `background-attachment: fixed` keeps the wash steady while content scrolls.
- New global `.ad-card` class with a `:hover` lift: `translateY(-2px)` + a slightly heavier shadow + warmer border. Cheap GPU-only animation that gives every card tactile feedback.
- New `.lift-on-hover` utility class used by the refresh button — same idea, smaller motion.
- `-moz-osx-font-smoothing: grayscale` paired with the existing `-webkit-font-smoothing: antialiased` so type renders consistently on macOS.

**`components/AdCard.tsx`** — wired up the hover
- Added `className="ad-card"`. No structural change.

**`app/page.tsx`** — stats pill + platform chip refresh
- Removed the explicit `fontFamily` on `<main>` so everything inherits Inter from `<body>`.
- **Stats pill** got a 3-stop gradient (`#0f172a → #1e293b → #312e81`) that lands on indigo, larger top number (24 → 26px) with tighter letter-spacing, and a layered shadow stack including a faint indigo ring (`0 0 0 1px rgba(99,102,241,.18)`) and an inner highlight line. Reads as elevated without being loud.
- Platform-logo chip (the 36px square next to "Meta Ads" / "Google Ads") got a subtle white→slate gradient, an inner bottom-edge highlight, and bumped to 38px / 10px radius for a slightly more deliberate proportion.

**`components/RefreshButton.tsx`** — small but lively
- Subtle white-to-slate gradient background instead of flat `#f8fafc`.
- The ↻ icon now **spins 360° on click** via a small `useState` flag, completing in 0.6s right before the page reloads. Confirms the click landed before the reload flashes.
- Picks up the `.lift-on-hover` class for a 1px lift + soft shadow on hover.

### Why this is enough
Without changing layout or behavior, the page now has type personality, background depth, and tactile motion on every interactive surface. That's the gap between "personal project" and "released product" — restraint at every step, but every surface has been touched.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- All animations are transform/shadow only — no layout thrash, smooth on low-end devices.

---

## 2026-05-13 — Sticky header, accurate local time, byline

### What changed

**`app/page.tsx`** — header now follows the user down the page
- The dashboard header has `position: sticky; top: 12px; z-index: 50` so it floats above the scrolling cards instead of disappearing at the top of the viewport. A heavier shadow stack reads as elevation when it's floating over content.
- Removed the server-rendered `now` timestamp entirely; replaced with `<LoadedAt />` (see below).
- Added a small byline under the H1: `"Built by Jorge · not the North Korean one"` in tiny muted text — keeps the inside joke in plain sight without competing with the dashboard's actual content.

**`components/LoadedAt.tsx`** *(new)* — timezone-correct "last loaded"
- Old code: `new Date().toLocaleString('en-US', ...)` ran on the server. On Vercel that uses whatever region's clock served the request — almost never the visitor's timezone.
- New approach: a small client component formats the time inside `useEffect`, calling `toLocaleString(undefined, {... timeZoneName: 'short'})`. Passing `undefined` for the locale gives the browser's default; the `short` TZ name appends "PDT" / "EST" / etc. so the viewer can confirm at a glance.
- SSR renders an empty span and `suppressHydrationWarning` is set, so there's no hydration mismatch — the real timestamp appears within one frame of mount.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- Header stays visible while scrolling through long campaign lists; cards scroll under it cleanly because of the z-index + opaque gradient background.
- Timestamp now reads "May 13, 2026, 8:12 AM EDT" (or whatever the viewer's actual TZ is) instead of a server-relative time.

---

## 2026-05-12 — Campaign grouping + modernized cards

### What changed

**`app/page.tsx`** — campaigns become first-class containers
- Each `PlatformRow` now renders **one `CampaignSection` per unique campaign** instead of a single wall of cards. The section has a small subheader (accent bar + campaign name + creative count) and a **horizontally scrolling row of `AdCard`s**.
- New helper `groupByCampaign(ads)` returns campaigns sorted by creative count descending, so the biggest campaigns surface at the top of each platform.
- Layout intent: a client opens the page and immediately sees "13 campaigns" of Google. Each campaign reveals its variants by scrolling sideways inside that campaign's row — without burying smaller campaigns under huge ones.

**`components/AdCard.tsx`** — text-only cards rebuilt; image cards lightly tightened
- The old text-only layout (gradient panel with centered headline) was too 2005. Replaced with a **Google-SERP-inspired card**: tiny uppercase "Sponsored" label, headline in Google link blue (`#1a0dab`), description in Google's exact muted gray (`#4d5156`), clean white background, no gradient.
- **Dedupe fix**: `ad.name` is now suppressed when it equals the campaign or the headline (case-insensitive) — kills the duplicated "Commit | Lodge Branded | Search" line that appeared as both the bold ad-name and the muted campaign-name. When it survives the noise filter, the name appears in the footer at very small size.
- Campaign is **no longer shown inside cards** — it lives in the section subheader above the row, so repeating it on every card was pure visual noise.
- Card width bumped 200 → 220 for slightly more breathing room; rounded corners 10 → 12; border + softer shadow stack for a more contemporary feel.
- Image-card layout largely preserved; just inherits the same typography and footer simplification.

**`app/layout.tsx`** — thin styled scrollbars
- Added `.campaign-scroll` global styles so the horizontal scroll affordance on per-campaign rows is consistently thin and calm across Mac, Windows, and Firefox (cross-browser via `scrollbar-width` + `::-webkit-scrollbar`). 8px tall, `#cbd5e1` thumb on transparent track.

### Why this is better than before
Three problems collapsed into one fix. (1) "200/200" was meaningless — campaigns are the unit the user thinks in. (2) The flat wall of cards made it impossible to tell which campaign you were looking at. (3) Cards repeated the same text three times. After this change, each campaign is its own scrollable lane, each card carries only the unique creative data, and the headline metric matches the conceptual model.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- Math: an account with 13 campaigns and ~200 exploded creatives renders 13 sections, each section's count summing to ~200. Campaigns ordered by size descending.

---

## 2026-05-12 — Headline metric switched to campaigns

### What changed

**`app/page.tsx`**
- Per-platform row subtitle changed from `"X active · Y total"` (ad/variant counts) to **`"N campaigns · M creatives"`**. Singular/plural handled (`1 campaign`, `1 creative`).
- Top dark pill in the header switched from `active / total` to **`N campaigns this month · M creatives`**. The big number is now the campaign count.
- Added a small `uniqueCampaigns()` helper that de-dupes by trimmed `ad.campaign` string. Reused in both the row and the header math so the two never drift.

### Why this matters
The previous numbers counted exploded ad variants (one ad with 8 headlines × 4 images = 32 cards). The headline number could read "200/200" when the client really only has 13 campaigns running. Campaigns are a far better answer to "what's running this month?" than creative-variant counts. Creatives are kept as a secondary muted number so you can still see at a glance how much creative volume is being rendered.

**`lib/meta.ts`**
- Added `campaign{name}` to the batch detail call's `fields` list, and now sets `ad.campaign` on each returned `Ad`. Without this, the new Meta campaign count would have been zero — Meta's `/ads` and `/insights` ad-level endpoints don't return campaign info implicitly.
- Google was already carrying `campaign` per `Ad` (both `ad_group_ad` and PMax paths), so no change there.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- Math sanity check: Google has 13 campaigns. After explode, you'll see 13 in the row subtitle even if 200+ creative cards render below. Meta count reflects however many distinct Meta campaigns have spending ads this month.

---

## 2026-05-12 — Spend-first fetchers, StackAdapt parked

### What changed

**`app/page.tsx`**
- Removed the StackAdapt `PlatformRow` and its `fetchStackAdaptAds` import.
- Updated header/totals math to be Meta + Google only.
- Tweaked the empty-state copy from "No ads returned — check credentials or active campaigns." to **"No live ads with spend this month."** to match the new filter semantics.
- Left `lib/stackadapt.ts` and the `StackAdaptLogo` SVG in place so re-enabling is a one-line change once a properly-scoped key is provisioned.

**`lib/meta.ts`** — full rewrite, insights-first
- Old flow: page through `/{account}/ads?effective_status=['ACTIVE']` with a 50→25→10 limit ladder. Meta would still throttle mid-pagination ("Please reduce the amount of data") because the per-ad payload (creative thumbnails, status block, etc.) is large at the account level.
- New flow:
  1. Hit `/{account}/insights?level=ad&date_preset=this_month&fields=ad_id,spend` and paginate it. This is a tiny payload — Meta never throttles it.
  2. Build a `Set<string>` of `ad_id`s where `spend > 0`.
  3. Batch-fetch ad details via `GET /?ids=id1,id2,...&fields=id,name,status,effective_status,creative{thumbnail_url}` in chunks of 50.
  4. Keep only ads whose `effective_status === 'ACTIVE'` so an ad that spent earlier in the month but is now paused doesn't show up.
- Why the rewrite is faster and quieter: we only ever request data we're going to render. The throttle wasn't fixable by lowering `limit` alone — the whole-account `/ads` listing is the wrong endpoint to start from when you only want the spending subset.

**`lib/google-ads.ts`** — reorder to spend-first, drop the LIMIT 500 ceiling
- Old flow: main detail query with `LIMIT 500`, then a separate spend query, then in-memory intersection. Last Vercel log showed exactly 500 rows returned — the cap was clipping the account (13 active campaigns with many ads each easily exceeds 500 ENABLED ad rows).
- New flow:
  1. **`fetchSpendingAdIds()`** runs the `metrics.cost_micros > 0 DURING THIS_MONTH` query first.
  2. **`fetchAdDetails(ids)`** issues `WHERE ad_group_ad.ad.id IN (id1, id2, ...)` queries against just those IDs, chunked to 500 ids per request to keep the query body sane.
  3. Same pattern for PMax inside `fetchPmaxAssetGroups()`: spend query → asset group IDs → `WHERE asset_group.id IN (...)` for the asset detail pull.
- Added a `runGaql()` helper to centralize pageToken pagination + JSON-parse error handling. Removed the per-loop "filtered out by spend-this-month" counter because the main query is now pre-filtered server-side.
- The `backfillRdaImages()` helper for responsive-display image URLs is preserved as-is; it just uses `runGaql()` now.

**`lib/stackadapt.ts`** *(unchanged in intent — this file picked up the diagnostic message previously, kept untouched this round)*
- Token-invalid error is detected and surfaces a clear instruction: regenerate `STACKADAPT_API_KEY` in the StackAdapt UI with full read scope on the target advertisers. No code fix possible until that's done.

**`.gitignore`**
- Added `*.tsbuildinfo` so TypeScript incremental build artifacts don't get committed.

### Verification
- `npx tsc --noEmit` passes with exit 0 — no type errors across the rewrites.
- Existing helpers preserved: `explodeAd()`, `backfillRdaImages()`, `findWorkingApiVersion()`, `getAccessToken()`, the `runGaql()` paginator.

### Expected Vercel log shape after deploy
- `[Meta] ads with spend this month: <N>`
- `[Meta] live ads with spend this month: <M>` (M ≤ N — paused ads that spent earlier in the month are dropped)
- `[Google] ads with spend this month: <K>`
- `[Google] ad type breakdown (spending ads): { ... }`
- `[Google] ad_group_ad ads shown: <K>` (should match the spend count now that LIMIT 500 is gone)
- `[Google PMax] asset groups with spend this month: <P>`
- `[Google PMax] asset rows: <Q>`
- `[Google PMax] asset groups shown: <P>`
- `[Google] total ads shown (ad_group_ad + PMax): <K + P>`
- No more `[Meta] API error: Please reduce the amount of data...` — the insights endpoint doesn't throttle on this shape.
- No more `[StackAdapt] ...` chatter — the section isn't fetched.

---

## Earlier history (summarized from git log)

Kept here as orientation; full diffs are in `git log`. Pruned when the underlying behavior is fully superseded by a later entry above.

- **Card explosion** — Each Google ad with N headlines / M descriptions / I images expands into `max(N, M, I)` cards so every unique creative variant is visible. See `explodeAd()` in `lib/google-ads.ts`.
- **PMax support** — Performance Max campaigns don't appear in `ad_group_ad`; they expose `asset_group` + `asset_group_asset`. We aggregate assets per asset group into one logical "ad" (then `explodeAd()` may split it into multiple cards).
- **Google Ads API version auto-probe** — `findWorkingApiVersion()` tries v25 → v17 against `listAccessibleCustomers` and caches the first non-404 response. Lets the dashboard ride out Google's ~9-month version sunsets without an env-var change. Override available via `GOOGLE_ADS_API_VERSION`.
- **OAuth env hygiene** — `getAccessToken()` trims whitespace off `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` and logs non-secret fingerprints so "I updated Vercel but the old value is still cached" is debuggable.
- **StackAdapt scope probing** — `lib/stackadapt.ts` introspects `tokenInfo`, `Account`, and `Campaign` types and picks a query that the current key's scope actually permits. Currently bottoming out at the "access token is invalid" path because the key can read schema but not campaign data.
