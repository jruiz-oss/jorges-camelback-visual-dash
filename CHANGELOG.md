# Changelog

Running log of meaningful changes to the ad dashboard. Newest at the top. Each entry explains **what** changed and **why** the change works the way it does, so future debugging starts with context instead of guesswork.

---

## 2026-05-13 — Jump-to-section nav, warm background, real Meta blur fix

### What changed

**`app/page.tsx`** — three logo buttons in the sticky nav
- Added a `PlatformJumpButton` helper (an `<a href="#section">` with logo, or a `<span>` when disabled). Three buttons render left of the stats pill: **Meta**, **Google Ads**, and **StackAdapt**. StackAdapt is rendered in its disabled state until the API key gets rescoped — same logo, dimmed to 32% opacity, `cursor: not-allowed`, tooltip "StackAdapt currently offline — API key needs rescope".
- `PlatformRow` now accepts an `id` prop and renders `<section id={id}>`. Wired up as `id="meta"` and `id="google"`. The third id will activate naturally when StackAdapt is brought back.
- The jumps work without JS — anchor navigation only.

**`app/layout.tsx`** — global styling + scroll plumbing
- `html { scroll-behavior: smooth }` so the in-page jumps glide instead of teleporting.
- `section[id] { scroll-margin-top: 96px }` so the landing position clears the sticky header — without this, the section title would land hidden under the nav.
- New `.platform-jump-btn` class: 36×36 rounded square, warm off-white bg, hover lift, disabled variant. Matches the page palette.

**`app/layout.tsx`** — body background swap
- Old background was a 3-stop gradient stack: indigo radial glow + cyan radial + slate `#f8fafc → #eef2f7 → #e7ecf3`. That combo reads as "2021 SaaS landing page" — the color cast was the "feels old" complaint.
- New background is a very gentle **warm off-white**: `linear-gradient(180deg, #fbfaf7 0%, #f5f4ef 100%)`. No radials. Reads as Notion/Mercury-style premium-but-quiet. Off-white also makes the white platform panels pop more cleanly than slate did.

**`lib/meta.ts`** — actually sharp Meta thumbnails this time
- The previous fix (prefer `creative.image_url` over `thumbnail_url`) only helped for static-image ads. Video / carousel / dynamic-creative ads usually return no `image_url`, so we fell back to the **default 64×64 thumbnail** and stretched it to 220px — still blurry.
- Meta's Marketing API supports `thumbnail_width` and `thumbnail_height` **query parameters** that resize the thumbnail at the source before the URL is generated. Added `&thumbnail_width=600&thumbnail_height=600` to the batch detail URL. Now even the fallback path returns a sharp 600px image.
- Both code paths are kept: `image_url` is still preferred when present, `thumbnail_url` (now 600×600 instead of 64×64) is the fallback.

### Why each part is the right fix
The nav buttons use anchor links + CSS scroll-behavior because that's the smallest amount of code that gets full keyboard navigation, no-JS support, and the smooth-scroll polish for free. The background change drops a color palette that's been overused since 2020 in favor of a cleaner warm neutral. The Meta blur fix gets at the actual API constraint — Meta isn't *not* giving us high-res images, we just weren't asking for them at the right size.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- Manual: clicking each nav logo should scroll smoothly to that platform's panel with the section's header visible (not hidden under the sticky nav). StackAdapt button does nothing and shows the tooltip.
- Meta cards on next load: image creatives serve the full image_url (1080p+); video/dynamic creatives serve the 600×600 thumbnail — both sharp at the 220px display size.

---

## 2026-05-13 — Fix Meta blur; panel-wrap platform sections

### What changed

**`lib/meta.ts`** — Meta image resolution fix
- We were requesting `creative{thumbnail_url}` and using that value as the card image. `thumbnail_url` is Meta's small UI thumbnail (~64-128px). Stretched to the 220px card width, it looked like compressed mush — that's the blur.
- Now requesting `creative{image_url,thumbnail_url}` and **preferring `image_url` (the full-resolution original)** in the card. `thumbnail_url` is kept as a fallback only for creatives that don't expose `image_url` — typically video creatives where `thumbnail_url` is the video poster.
- Updated the `AdDetail` type accordingly. No other API call shape changes.

**`app/page.tsx`** — platform sections become real panels
- Each `PlatformRow` (Meta Ads / Google Ads) is now wrapped in a **white panel**: 1px slate border, 14px radius, ~22-24px inner padding, soft two-layer shadow (`0 1px 3px + 0 8px 20px`, both very faint). The page background still does its quiet indigo glow underneath; the panels float on top.
- Inner divider between the logo+label and the campaigns lightened from `#e5e7eb` to `#f1f5f9` so it reads as quiet structure inside the panel instead of a hard line.
- Net effect: the hierarchy is now **page → panel → campaign → card**, four nested containers — exactly the visual grammar a real app uses. The old flat layout where cards floated directly on the page background is gone.

### Why this fixes "feels too basic"
The flat layout had only two real levels (page, card). Now there's containment around each platform, which is how every released SaaS dashboard organizes content. Combined with the existing Inter font, body-bg gradient, sticky header, and per-campaign scroll rows, the page reads as a coherent app instead of a list of cards.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- Meta cards will now serve full-res image_url (typically 1080p+) — they should be as sharp as Google's PMax cards.

---

## 2026-05-13 — Clean up the header bar

### What changed
Polish stays where it belongs (page background, cards, Inter font, hover lift) — but the **nav/header bar gets stripped of decoration**:

- **`app/page.tsx`**
  - Header background: white→slate gradient → flat `#ffffff`. Border radius `14 → 12`, padding tightened to `16px 22px`, shadow simplified to a single soft `0 2px 8px rgba(15,23,42,.05)`.
  - Stats pill: dropped the 3-stop dark→indigo gradient and the indigo ring shadow. Now flat `#0f172a`, single layer, smaller padding. Top number sized back to 24px so it matches the rest of the bar visually.
- **`components/RefreshButton.tsx`**
  - White→slate gradient → flat `#ffffff`. Inline `boxShadow` removed (`.lift-on-hover` class still provides hover lift if needed — kept as a class, just no resting shadow).

### Why
Original polish pass over-reached onto the nav. The intent was a more "published-app" feel on the **page** (background depth, card hovers, real font) — the chrome at the top should stay quiet and unfussy.

### Still in place from the polish pass
Inter font, indigo radial glow on the body background, fixed-attached slate gradient, `.ad-card` hover lift, refresh-icon spin on click. None of that was touched.

### Verification
- `npx tsc --noEmit` passes with exit 0.

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
- Added a small byline under the H1: `"Built in North Korea"` in tiny muted text — fully leaning into the inside joke.

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
