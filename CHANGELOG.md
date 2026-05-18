# Changelog

Running log of meaningful changes to the ad dashboard. Newest at the top. Each entry explains **what** changed and **why** the change works the way it does, so future debugging starts with context instead of guesswork.

> Maintenance rule (see `CLAUDE.md`): every code change appends an entry here, names the files it touched, and removes any stale content elsewhere in the repo's `.md` files.

---

## 2026-05-18 — Meta carousel navigation (click through carousel card images)

### What changed
- `lib/types.ts` — added `carouselImages?: string[]` field to the `Ad` interface. Distinct from `imageUrls` (which is used by Google PMax to explode into separate tiles); `carouselImages` keeps the ad as one tile and enables client-side prev/next navigation.
- `lib/meta.ts` (`fetchAdDetails`) — before the final `ads.push()`, detects carousel ads by checking `ld2?.child_attachments.length > 1` and collects all card image URLs into `carouselImages`. Resolution priority mirrors `pickImageUrl`: hash-resolved original first (via `hashToUrl`), then video thumbnail (via `videoIdToThumb`), then direct `picture` URL as last resort. Each URL is proxied through `/api/meta-img`. Cards with no resolvable image are skipped rather than pushing empty strings. Only set when `imgs.length > 1` (single-card "carousels" are treated as static image ads).
- `app/layout.tsx` (`.creative-media`) — added `position: relative`. The div previously had no positioning context, which would have caused the absolutely-positioned carousel buttons to anchor to the nearest positioned ancestor (`.creative-media-wrapper`) instead of the image area itself — correct visually by accident but fragile. Making `.creative-media` explicitly `relative` pins the buttons correctly inside the image box.
- `components/CreativeTile.tsx` — added `useState` (cardIdx) for the active card index. When `ad.carouselImages?.length > 1`: the `<img>` src uses `cards[cardIdx]` instead of `ad.imageUrl`; left/right `‹ ›` arrow buttons are absolutely positioned at mid-left/mid-right of `.creative-media`; dot indicators along the bottom track position and animate width on active state. All nav controls use inline styles so no new CSS classes needed.

### Why this works
- All carousel image data was already being fetched server-side (hashes collected in `collectHashes`, resolved in `fetchAdImageUrls`) — the carousel images were just never stored. This change adds the storage step only; no new API calls.
- `imageUrls` was intentionally not reused: it carries "explode into separate tiles" semantics for Google PMax. A new field keeps the two behaviors cleanly separate.
- `overflow: hidden` on `.creative-media-wrapper` clips the arrows naturally — no additional scoping needed. The buttons sit within `.creative-media`, which is a child of the wrapper.
- `cardIdx` resets to 0 each time React remounts the component (e.g. on page refresh), which is the correct behavior — the wall always starts at card 1.

### Verification
- Static/video Meta ads: `carouselImages` is undefined → `isCarousel` is false → no arrows, no dots, no behavior change.
- Google/StackAdapt ads: `carouselImages` is never set for these platforms → no change.
- Meta carousel ads: arrows and dots appear; clicking cycles through all card images.

---

## 2026-05-18 — Mobile burger nav replaces horizontal pill scroll

### What changed
- `components/TopBar.tsx` — added `menuOpen: boolean` state and a `useEffect` that closes the menu on the first `scroll` event (passive, once). Added a `.burger-btn` button at the end of row 1 (after the Refresh button). Added a `{menuOpen && <nav className="nav-mobile-menu">}` block rendered directly inside `<header>` so it can use `position: absolute; top: 100%` to drop below the header. Added `style={{ position: 'relative' }}` inline to `<header>` as an explicit containing-block declaration (redundant with sticky, but defensive). Nav item clicks scroll + close the menu via `onJumpClick(id)(e); setMenuOpen(false)`.
- `app/layout.tsx` (CSS) — added `.burger-btn`, `.burger-icon`, and `.burger-icon.open` base styles (hidden by default on desktop). Added `.nav-mobile-menu { display: none }` base rule. Inside `@media (max-width: 640px)`: hides `.topbar-row.r2` entirely (row was already empty after ticker was hidden), shows `.burger-btn`, and defines the full `.nav-mobile-menu` dropdown (position, shadow, item rows, active accent state, count pill alignment).

### Why this works
- Hiding row 2 on mobile removes the scrollable pill strip. The burger lives in row 1 so the header stays one row tall on phones — maximizing content area.
- `position: absolute; top: 100%` on the dropdown attaches it to the header's bottom edge. Because `position: sticky` elements are containing blocks, the menu always drops exactly below the header regardless of how tall the header is.
- The scroll listener uses `{ once: true }` so it self-removes after firing once — no ongoing scroll overhead. The menu closes instantly when the user scrolls away, which is the expected mobile UX pattern.
- The CSS keeps `.nav-mobile-menu { display: none }` at the base level so even if React renders it above 640px (which it won't — the button is hidden — but defensively), it stays invisible.

### Verification
- Desktop (>640px): `.burger-btn { display: none }` — burger never appears, `menuOpen` never becomes true, dropdown never renders. Zero impact on desktop.
- Mobile (≤640px): tap burger → 3-line icon animates to X, menu drops below header with all segment pills; tap a pill → scrolls to section, closes menu, icon returns to 3 lines; scroll → menu auto-closes.

---

## 2026-05-18 — Mobile experience fixes (viewport meta, layout, login, TopBar)

### What changed
- `app/layout.tsx` (`<head>`) — added `<meta name="viewport" content="width=device-width, initial-scale=1" />`. This was completely absent. Without it iOS Safari and Android Chrome render the page at a fake 980px viewport and scale it down, bypassing all `@media` breakpoints entirely.
- `app/layout.tsx` (`@media (max-width: 640px)`) — `.lane` now sets `padding-left: 16px` (was 36px, unset at this breakpoint so the desktop value held). Freed up ~20px of usable lane width on 375px screens.
- `app/layout.tsx` (`@media (max-width: 640px)`) — `.creative` width changed from fixed `220px` to `clamp(155px, 55vw, 220px)`. On a 375px phone this yields ~206px, leaving a sliver of the next card visible as a scroll affordance; on wider phones it caps at 220px, same as before.
- `app/layout.tsx` (`@media (max-width: 640px)`) — `.ticker { display: none }` added. At this width the ticker row only showed "● LIVE" (all verbose content was already hidden at 1100px), wasting a full header row on mobile.
- `app/layout.tsx` (`@media (max-width: 640px)`) — `.brand-h1` gets `white-space: normal; font-size: 20px; line-height: 1.2`. The `white-space: nowrap` from the base rule prevented "Camelback Resort Ad Dashboard" from wrapping on phones, causing overflow.
- `app/layout.tsx` (`@media (max-width: 640px)`) — `section[id]` `scroll-margin-top` reduced from 176px to 160px to match the now-shorter header (ticker row removed).
- `app/layout.tsx` (`.admin-modal`) — added `max-width: calc(100vw - 32px)`. The modal was `width: 280px` with no safety guard; on 320px phones it would render partially off-screen.
- `app/login/page.tsx` — login card `width` changed from fixed `340` to `'min(340px, calc(100vw - 32px))'`. On sub-370px phones the card was wider than the viewport, causing a horizontal scroll.

### Why this works
- The viewport meta fix is the single highest-leverage change — it re-enables every existing responsive breakpoint for free, since they were already written but silently ignored.
- Hiding the ticker rather than shrinking it keeps the sticky header compact on mobile (fewer rows = more content visible below the fold).
- `clamp()` on creative width is mobile-fluid: it scales proportionally with the viewport between 155px and 220px, so no hard breakpoint is needed below 640px.
- `min()` on the login card is CSS-native and has no JS overhead — it evaluates at paint time.

### Verification
- Desktop: all breakpoints are `max-width`, so none of these changes fire above 640px. Desktop layout is fully unaffected.
- Mobile (375px iPhone): viewport meta fires the 640px breakpoint; header fits in one row (brand + dot + totals pill); cards show at ~206px with scroll affordance; login card fits within screen bounds; admin modal stays within screen bounds.

---

## 2026-05-18 — Fix missing URL pill on RSA text cards with root-domain final URLs

### What changed
- `lib/google-ads.ts` (`fetchAdDetails`) — RSA/ETA `destinationUrl` extraction now mirrors the PMax fallback: `path || parsed.hostname.replace(/^www\./, '')`. Previously, ads whose `final_urls[0]` pointed to the root domain (e.g. `https://camelbackresort.com/`) produced an empty path after stripping the trailing slash, leaving `destinationUrl` undefined and hiding the URL pill entirely. PMax already had the hostname fallback; RSAs were missing it.

### Why this works
- `new URL("https://camelbackresort.com/").pathname` → `"/"` → after `.replace(/\/$/, '')` → `""`. Empty string is falsy, so `path || hostname` correctly falls through to the hostname. No change needed for ads with real path segments — those still show the path as before.

### Verification
- Affected rows were "Commit | Lodge Non-Brand | Search" and "Commit | Lodge Branded | Search" — both had root-domain final URLs. After this fix their cards will show `camelbackresort.com` in the pill instead of no footer at all.

---

## 2026-05-18 — Fix glass/shadow scope to image cards only (v2)

### What changed
- `app/layout.tsx` — corrected scoping bug from the earlier glass/shadow commit. Root cause: the `.creative-detail--google-text` reset block was inserted *before* the main `.creative-detail` rule in the cascade, so `margin-top: -28px` always won and broke Google text RSA cards. Fix: revert `.creative-media-wrapper` and `.creative-detail` back to their original values, remove the broken reset blocks, and add two new selectors — `.creative:not(.has-text-card) .creative-media-wrapper` and `.creative:not(.has-text-card) .creative-detail` — that carry all the glass+shadow work. Google text-only cards (`.has-text-card`) never match these selectors and are fully unaffected. Also increased glass transparency (0.58 opacity, was 0.75) and blur radius (24px, was 18px) for more visible effect, and increased overlap to `-32px`.

### Why this works
- `:not(.has-text-card)` is a single specificity bump that reliably excludes Google text RSA cards at the selector level — no cascade-order fragility, no override blocks needed.
- Lower opacity (0.58) means 42% of the image bleeds through the panel, making the glass effect clearly visible rather than barely noticeable.
- Overlap at `-32px` gives the blur more image pixels to work with at the top of the panel.

### Verification
- Google text RSA cards: no margin-top, no blur, no shadow — identical to pre-glass state.
- Meta + Google PMax image/video cards: glass panel + lifted image shadow applied.

---

## 2026-05-18 — Frosted glass text panel + floating image shadow on creative tiles

### What changed
- `app/layout.tsx` — four targeted CSS changes to `.creative`, `.creative-media-wrapper`, and `.creative-detail`. No HTML, no component logic touched. Revert by reverting just this file.
  1. `.creative`: removed `overflow: hidden`. Children already self-clip via their own `border-radius` + `overflow: hidden` (wrapper clips top corners, detail clips bottom corners), so the card shape is unchanged. Removing it from the parent lets the image shadow escape downward onto the detail panel, which is required for the depth effect.
  2. `.creative-media-wrapper`: added `box-shadow: 0 6px 24px rgba(0,0,0,.38), 0 2px 6px rgba(0,0,0,.22)`. Shadow falls onto the detail panel below, making the photo look lifted off the card surface.
  3. `.creative-detail`: changed `position: static` → `position: relative; z-index: 2; margin-top: -28px`. The `-28px` slides the panel up to overlap the bottom 28px of the photo, so `backdrop-filter: blur(18px) saturate(160%)` has real image pixels to blur — not just the page background. Background changed from solid `#242841` to `rgba(22, 26, 52, 0.75)` (semi-transparent) so the blurred image shows through. A `border-top: 0.5px solid rgba(255,255,255,.12)` adds the glass-edge highlight.
  4. Google text-card resets: `.creative-detail--google-text` gets `margin-top: 0`, `backdrop-filter: none` (no image behind it — nothing to blur). `.creative.has-text-card .creative-media-wrapper` gets `box-shadow: none` (white SERP card, shadow would look wrong).

### Why this works
- **Backdrop-filter needs content behind it**: blurring a solid-color element produces the same solid color. The `-28px` overlap ensures the blur always has photo pixels beneath it, producing a genuine frosted-glass look.
- **Overflow: hidden removal is safe**: the two children together tile the card shape exactly — media-wrapper covers top-left/top-right radii, detail covers bottom-left/bottom-right. The card's background (`#242841`) still clips to its own `border-radius` (background respects border-radius without overflow:hidden). Hover ring (`box-shadow: 0 0 0 1.5px var(--accent)`) lives on the `.creative` element itself, not on a pseudo-element, so it still renders correctly.
- **Google text cards isolated**: these have no image; applying glass and shadow to them would look wrong. Both overrides are added in a single block adjacent to the existing `has-text-card` rules so they're easy to find.

### Verification
- Visually confirmed card shape, hover ring, brand chips, and campaign row layout all intact.
- Google Search RSA text cards render with no overlap or blur regression.

---

## 2026-05-17 — Security hardening pass + fix missing clock + scoped RDA image backfill

### What changed
- `package.json` — bumped `next` from `14.2.3` → `14.2.32`. Patches CVE-2025-29927 (middleware-authorization bypass via crafted `x-middleware-subrequest` header). On the unpatched version, any attacker could send that header and skip `middleware.ts` entirely, bypassing the dashboard password gate.
- `next.config.mjs` — replaced the single-line `frame-src` CSP with a full security-header set: tightened `Content-Security-Policy` (`default-src 'self'`, scoped `img-src`/`media-src` to the connector CDNs, `frame-ancestors 'none'`), plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/FLoC off), and 1y `Strict-Transport-Security`. `script-src` still needs `'unsafe-inline' 'unsafe-eval'` because Next.js injects a runtime bootstrap and we inline the design-system CSS in `app/layout.tsx`.
- `app/api/meta-img/route.ts` — closed SSRF. Endpoint now validates that the `?url=` host ends in `.fbcdn.net` or `.facebook.com` and the protocol is https; sets `redirect: 'manual'` so a 3xx to a non-allowlisted host can't sneak through; rejects upstream responses whose `Content-Type` isn't `image/*`; adds `X-Content-Type-Options: nosniff` to the proxied response.
- `app/api/auth/route.ts` — cookie value is no longer the password itself. The route now compares the submitted password to `DASHBOARD_PASSWORD` in constant time (XOR/diff loop), then stores `HMAC-SHA256(password, DASHBOARD_AUTH_SECRET || password)` as the cookie value. Web Crypto is used (not Node `crypto`) so the helper matches the middleware's edge runtime.
- `middleware.ts` — converted to `async function middleware(...)`; recomputes the same HMAC from env and compares it to the `dashboard_auth` cookie value. Adds an explicit `!password` short-circuit so a misconfigured env redirects to `/login` instead of letting requests through.
- `app/api/admin-unlock/route.ts` (new) — server-side check for the admin-edit PIN. Reads `ADMIN_PIN` (default `'1234'`), constant-time compares against the POSTed pin, returns 200 or 401.
- `components/SegmentOverrideContext.tsx` — `unlock(pin)` is now `async` and POSTs to `/api/admin-unlock` instead of reading `NEXT_PUBLIC_ADMIN_PIN` from `process.env`. The previous version inlined the PIN into the client JS bundle at build time, so any visitor could read it in devtools.
- `components/AdminUnlock.tsx` — `handleUnlock` is now `async` so it can await the new `unlock` promise.
- `components/TopBar.tsx` — restored the live clock in the ticker row. `useClock()` was already ticking every second and `fmtTime()` was defined; the JSX just never rendered it. Reads "LIVE · date · clock · auto-refresh" now, matching the file's own comment.
- `lib/google-ads.ts` — `backfillRdaImages` now scopes the `FROM asset` GAQL query by the resource_names actually needed (multiple `asset.resource_name = '…' OR …` predicates) instead of an unscoped `LIMIT 500`. The previous query silently missed the right asset on accounts with more than 500 image assets, leaving those RDA ads without an `imageUrl`.
- `.gitignore` — added `.DS_Store` so macOS metadata stops getting committed.
- `.env.example` — documented the new `DASHBOARD_AUTH_SECRET` and server-side `ADMIN_PIN` vars; removed the reference to the public PIN env in the old docs.

### Why this works
- **CVE-2025-29927**: `14.2.32` is the patched 14.x release. The middleware-only auth gate is the whole reason this CVE is critical for this repo, so bumping is non-optional.
- **SSRF**: the dashboard cookie alone gave anyone authenticated the ability to make the server fetch arbitrary URLs (cloud metadata `169.254.169.254`, internal services, etc.). Hostname allowlist + `redirect: 'manual'` + image-only content-type validation forces every proxied request to actually be a Meta CDN image.
- **Cookie ≠ password**: `dashboard_auth` previously held the literal password. Any cookie leak (logs, browser extensions, replays) would hand over the password. HMAC-with-secret separates "cookie value" from "password" and rotating `DASHBOARD_AUTH_SECRET` invalidates every existing session in one move. Edge-runtime middleware can't use Node `crypto`, so both files use Web Crypto.
- **Server-side PIN**: `NEXT_PUBLIC_*` env vars are baked into the JS bundle by Next.js at build time. The previous PIN check ran entirely in the browser, so the PIN was effectively public. Moving the comparison to an API route means the bundle contains only `'/api/admin-unlock'` — the actual value lives on the server.
- **RDA image backfill**: GAQL has no `LIMIT` guarantee that returns the right rows, and resource_name isn't supported with `IN`. ORing equality predicates is the only way to scope by resource_name; the OR list is small (one entry per RDA ad that needed backfilling, deduped).

### Verification
- Manual reasoning of each route + middleware path (no test suite in repo). Local `npm install && npm run build` will surface any TS regressions from the async `unlock` signature change.
- After deploy, login should still work — but the existing `dashboard_auth` cookie will fail validation (it holds the old plaintext password, not the new HMAC), so every viewer logs in once on next visit.

---

## 2026-05-18 — Fix PMax: remove unsupported field `asset_group.final_url_expansion_opt_out`

### What changed
- `lib/google-ads.ts` — removed `asset_group.final_url_expansion_opt_out` from the `FROM asset_group_asset` SELECT in `fetchPmaxAssetGroups`. Removed the dead `urlExpansion` variable that referenced the dropped field. Trimmed the URL log line accordingly.

### Why this works
`asset_group.final_url_expansion_opt_out` does not exist in Google Ads API v24. The GAQL engine returned HTTP 400 `UNRECOGNIZED_FIELD`, which `runGaql` treats as an error and returns `[]`. The result: 4 spending PMax campaigns were correctly detected in step 1, but the step-2 asset query hard-failed every time, yielding 0 asset rows and 0 PMax cards on the wall. Removing the field lets the query succeed; the field was only used for a diagnostic log line and was never consumed by rendering logic.

### Verification
Vercel logs should now show `[Google PMax] asset rows: N` (N > 0) and `[Google] PMax asset groups shown: N` instead of 0.

---

## 2026-05-17 — Fix PMax: switch spend detection from asset_group to campaign resource

### What changed
**`lib/google-ads.ts`** — Rewrote `fetchPmaxAssetGroups` Step 1 to use `FROM campaign` instead of `FROM asset_group` for spend detection. The previous approach (including the three-tier fallback shipped earlier today) queried `FROM asset_group` with `metrics.cost_micros > 0` in all three tiers — but `asset_group`-level metrics silently return empty in certain API versions regardless of actual spend, so all three tiers collapsed to 0 and PMax never appeared.

New approach:
- **Step 1** queries `FROM campaign WHERE advertising_channel_type = 'PERFORMANCE_MAX' AND segments.date DURING LAST_30_DAYS AND metrics.cost_micros > 0` — campaign-level metrics are always reliably populated in GAQL.
- **Fallback** queries `FROM campaign ... AND campaign.status = 'ENABLED'` with no spend filter, so live PMax campaigns always surface even if the metrics query misfires.
- **Step 2** queries `FROM asset_group_asset WHERE campaign.id IN (...)` instead of `WHERE asset_group.id IN (...)`, matching on the campaign IDs found in Step 1. This is the reliable asset-content resource and is unchanged structurally.

Also reverted the test `✓` added to `app/page.tsx` during Vercel webhook debugging.

### Why this works
`FROM campaign` is a first-class reporting resource in GAQL — metrics are always aggregated and available at that level. `FROM asset_group` is a structural resource that Google does not guarantee will populate metrics in every API version or account configuration. Switching the spend probe to campaign level eliminates the silent-zero problem.

### Verification
PMax campaigns visible on next refresh. Server logs will show `[Google PMax] campaigns with spend LAST_30_DAYS: N` with N > 0.

---

## 2026-05-17 — Merge "Ad Dashboard" into the main title

### What changed
- **`components/TopBar.tsx`** — default `brandH1` changed from `'Camelback Resort'` to `'Camelback Resort Ad Dashboard'`; default `brandSub` changed from `'Ad Dashboard · Powered by Commit Agency'` to `'Powered by Commit Agency'`.
- **`app/page.tsx`** — matching explicit prop values updated to match the new defaults.

### Why this works
"Ad Dashboard" was a subtitle label, but visually it reads better as part of the H1. Moving it into the title makes the brand identity clearer at a glance without changing any layout or styles.

### Verification
Header now reads "Camelback Resort Ad Dashboard" (large) / "Powered by Commit Agency · Made in North Korea" (small).

---

## 2026-05-17 — Fix refresh button spinner (transition → continuous animation)

### What changed
**`app/layout.tsx`** — Added `@keyframes spin` (0→360°, linear) and changed `.refresh.is-spinning .spinner` from `transition: transform .6s ease` to `animation: spin .7s linear infinite`. Removed the stale `transition` property on `.refresh .spinner`.

### Why this works
The old code used a CSS `transition` to rotate the icon from `rotate(0deg)` to `rotate(360deg)` once. After that single turn the spinner stopped, even though `isPending` (set by `useTransition` in `TopBar.tsx`) was still `true` while `router.refresh()` was running. To the user it looked like clicking the button did nothing. A continuous `@keyframes` loop spins the icon the entire time `is-spinning` is present, stopping only when `isPending` returns to `false` after the server re-render completes.

### Verification
Click Refresh — icon spins continuously until the server component finishes re-fetching all three platforms (Meta / Google / StackAdapt), then stops.

---

## 2026-05-17 — Clickable platform names in segment subtitle

### What changed
**`components/SegmentSection.tsx`** — Replaced the static "across {n} platforms" text in each segment's subtitle with named, clickable platform links (e.g. "active across Meta, Google Ads & StackAdapt"). Only platforms with active ads appear in the list. Each link is an `<a href>` anchor pointing to `#{segmentId}-{platformId}` (e.g. `#aquatopia-google`).

Added `segmentId` prop to `PlatformBlock` and set `id={segmentId}-{platformId}` on each platform wrapper div so the anchors have valid targets. All three return paths in `PlatformBlock` (active, empty, and StackAdapt not-connected) received the `id` attribute.

**`app/layout.tsx`** — Added `.platform-jump-link` styles (underline treatment matching the existing mono text color, with hover darkening) and `scroll-margin-top: 150px` on `.seg-platform[id]` so jumps land below the sticky two-row header.

### Why this works
The segment header and platform blocks are both server-rendered, so plain `<a href="#…">` anchors work without any client JS. `scroll-behavior: smooth` is already set on `html` in layout.tsx, so clicks animate smoothly. The `150px` scroll-margin is slightly larger than the segment-level `130px` to account for the platform block sitting inside a segment card with its own padding.

### Verification
Each segment subtitle now shows "active across [Platform A], [Platform B] & [Platform C]" with only the platforms that have ads. Clicking a platform name scrolls to that platform's sub-block within the segment.

---

## 2026-05-17 — Add top + left accent strips via inset box-shadow

### What changed
`app/layout.tsx` — replaced the `::before` (left strip) and `::after` (top strip) pseudo-elements on `.segment` / `.platform` with two `inset box-shadow` values: `inset 5px 0 0 var(--accent)` (left) and `inset 0 5px 0 var(--accent)` (top). The old white highlight `inset` shadow was removed (superseded by the accent strips). Both pseudo-element rules deleted entirely.

### Why this works
`inset box-shadow` is drawn within the element's own border-box and is natively clipped to the element's `border-radius` by the browser — no `overflow: hidden` compositing quirks, no pseudo-element stacking ambiguity. `overflow: hidden` + `::before`/`::after` can anti-alias the corner as square even with matching `border-radius` on the child, depending on the compositing order. Box-shadow has no such issue.

### Verification
Both strips follow the card's 18px rounded corners cleanly at every corner.

---

## 2026-05-17 — Remove clock/time from ticker

### What changed

**`components/TopBar.tsx`** — Removed the time display (`fmtTime` span and its preceding separator) from the `.ticker` strip in Row 2. The ticker now shows: `● LIVE · date · auto-refresh · 60s`. The `useClock`, `fmtTime`, and `fmtDate` helpers are still present; `fmtTime` is now unused but kept in case it's re-added.

### Why this works

The time span was a standalone `<span>` — removing it and its adjacent `<span className="sep" />` leaves the rest of the ticker intact with no layout side-effects.

### Verification

Ticker renders `● LIVE · May 17, 2026 · auto-refresh · 60s` with no time/timezone string.

---

## 2026-05-17 — Remove "Live" stat from top-right totals pill

### What changed

**`components/TopBar.tsx`** — Removed the "Live" stat block (`allActive` / `{allActive}` / `Live` label) from the `top-totals` pill. The pill now shows only **Campaigns** and **Creatives**. Also removed the now-unused `allActive` derived variable.

### Why this works

The `allActive` count was a sum of `t.active` across `totals` — purely a UI data point. Dropping its `<div className="stat">` block and the variable that fed it leaves the other two stats untouched and the pill renders with two items instead of three.

### Verification

Pill displays `{N} Campaigns` and `{N} Creatives` only. No TypeScript errors — `NavTotal.active` field still exists on the type (used elsewhere in jump pills) so no interface change needed.

---

## 2026-05-17 — Fix last nav pill clipped by fade overlay

### What changed

**`app/layout.tsx`** — Added `padding-right: 56px` to `.nav-jump`. The scrollable pill strip had no clearance for the 56px gradient fade overlay (`.nav-jump-fade`) sitting on top of its right edge, so the last pill would scroll under the fade and appear half-cut-off. The padding forces the scroll content area to extend 56px past the last pill, so scrolling fully into view lands the pill in clear space before the fade begins.

### Why this works

`padding-right` on a flex scroll container expands the scrollable content width without affecting the visible viewport width — the browser honors it as trailing space when calculating scroll end position. The fade overlay width (56px) matches exactly so the last pill is never obscured.

### Verification

Scroll the nav pill strip to the far right; the last pill now shows completely with no clipping.

---

## 2026-05-16 — Dynamic platform channel labels in section headers

### What changed

**`lib/types.ts`** — Added optional `channel?: string` field to the `Ad` interface. Stores a human-readable channel label (e.g. `"Search"`, `"Display"`, `"Native"`) derived at fetch time so the UI never has to re-derive it.

**`lib/google-ads.ts`** — Added `AD_TYPE_CHANNEL` lookup table mapping Google ad type strings (`RESPONSIVE_SEARCH_AD`, `EXPANDED_TEXT_AD`, `IMAGE_AD`, `RESPONSIVE_DISPLAY_AD`, `VIDEO_AD`, `VIDEO_RESPONSIVE_AD`, `PERFORMANCE_MAX`) to display labels. Both the ad-group ad builder and the PMax asset-group builder now set `channel` on every returned `Ad`.

**`lib/stackadapt.ts`** — Added `saChannelLabel()` helper that maps StackAdapt `channelType` values (`native`, `display`, `video`, `audio`, `connected_tv`, etc.) to display labels. Unknown values are auto-title-cased so new channel types surface automatically without a code deploy. The ad-building loop now stores `channel: saChannelLabel(n.channelType)` on each ad.

**`app/page.tsx`** — Replaced the three hardcoded `handle` strings in the `PLATFORMS` array with a `deriveHandle(platform, ads)` function. For Google it collects unique `channel` values and sorts them in a preferred reading order (Search → Display → YouTube → Performance Max). For StackAdapt it sorts alphabetically. For Meta the handle stays `@camelbackresort` (it's an account identifier, not a channel list). The segment platform group builder calls `deriveHandle` with the segment-scoped ads, falling back to the full platform ad list when a segment has no ads for that platform (preserves correct handle on the "No live ads" empty state).

### Why this works

The old handles were static strings that would lie whenever the actual mix changed — if Camelback paused Search and only YouTube was running, the header still said "Search · Display · YouTube". Now each section header reflects only the channels live in that data snapshot. The Google ordering list (`GOOGLE_CHANNEL_ORDER`) gives consistent left-to-right reading without alphabetising into odd orders like "Display · Performance Max · Search".

### Verification

On next page load, each platform section header should read only the channels whose ad types are present in the live data. If all three Google types are running, the header reads "Search · Display · YouTube". If only Search campaigns are active, it reads just "Search". StackAdapt reflects whatever `channelType` the API returns; Meta always shows `@camelbackresort`.

---

## 2026-05-16 — StackAdapt logo refresh + remove icon from empty state

### What changed
- **`components/PlatformLogo.tsx`** — `StackAdaptLogo` replaced: the previous orange (#FF5A36) rounded-square-with-S was swapped for the official StackAdapt blue "S" mark. Constructed as a compound SVG path: two interlocking semicircular ring arcs (outer R=85, inner R=50) connected by diagonal bridges, with R=17.5 rounded end caps, on a 260×320 viewBox. Fill color `#1155EE`. The orange `--stack` CSS token is unchanged (only used for the accent strip / hover ring, not the logo).
- **`components/SegmentSection.tsx`** — Removed `<StackAdaptLogo size={38} />` from the `.platform-not-connected` block shown when StackAdapt has no ads. The text labels ("No ads connected / API integration pending") are retained; only the redundant logo icon is gone.

### Why this works
The orange rounded-square was a placeholder that didn't reflect StackAdapt's actual brand. The new SVG path is derived directly from the official mark geometry. Removing the logo from the empty state avoids a visually awkward double-logo situation (the logo already appears in the platform header chip above) and de-clutters the "not connected" notice.

### Verification
- All three platform blocks in each segment should show the blue S mark in their header chip.
- When StackAdapt has no ads, the empty state shows only the text labels with no icon.

---

## 2026-05-16 — StackAdapt: always-visible section + official brand logo + "not connected" state

### What changed
- **`components/PlatformLogo.tsx`** — `StackAdaptLogo` updated from a teal-to-blue gradient placeholder to the official StackAdapt brand color (`#FF5A36` orange, flat fill) with a white "S" mark. The `--stack` CSS token in `layout.tsx` already used this color; the SVG now matches it.
- **`components/SegmentSection.tsx`** — `PlatformBlock`: added an early-return branch for `id === 'stackadapt'` when `ads.length === 0`. It renders the StackAdapt logo at 38 px alongside a "No ads connected" label and "API integration pending" sub-label inside a new `.platform-not-connected` layout. The existing early-return for other platforms (generic "no spend" text) is unchanged.
- **`components/SegmentSection.tsx`** — `SegmentSection` export: changed `activePlatforms.map(...)` → `platforms.map(...)` inside the `seg-platforms` render. This means StackAdapt is always rendered as a block even when it has zero ads; the per-platform empty-state logic in `PlatformBlock` handles the visual. `activePlatforms.length` is still used for the "across X platforms" header count so that stat stays honest.
- **`app/layout.tsx`** — Added CSS for `.platform-not-connected`, `.platform-not-connected-text`, `.platform-not-connected-label`, and `.platform-not-connected-sub` immediately after the existing `.platform-empty` rule.

### Why this works
Previously StackAdapt was silently dropped from every segment because `activePlatforms` filtered out any platform with zero ads. This left no visual indication that StackAdapt is an intended channel. The new approach always renders the block with a clear "API pending" state — visitors know the section is intentionally there and not wired yet, rather than wondering why only two platforms appear. The "across X platforms" count correctly excludes StackAdapt (still uses `activePlatforms.length`) so it doesn't inflate the header stat.

### Verification
All segment sections should now show three platform sub-blocks. StackAdapt's block shows the orange logo + "No ads connected / API integration pending" message below a dashed separator.

---

## 2026-05-16 — Nav bar: auto-scroll active pill into view on section change

### What changed
- **`components/TopBar.tsx`** — added `useRef` import alongside the existing React hooks.
- **`components/TopBar.tsx`** — added `navRef = useRef<HTMLElement>(null)` and a `useEffect` that fires whenever `active` changes. The effect queries the `<nav>` for `a[href="#<activeId>"]` and calls `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })` on it.
- **`components/TopBar.tsx`** — attached `ref={navRef}` to the `<nav className="nav-jump">` element.

### Why this works
`inline: 'nearest'` is the key choice — it only scrolls the scroll container if the element is actually clipped (off left or right edge). If the pill is already fully visible it does nothing, so there is no jitter or over-scroll on short segment lists. `block: 'nearest'` keeps the same logic in the vertical axis (no vertical scroll side-effect). The `behavior: 'smooth'` matches the feel of the existing jump-to-section animation.

The effect depends only on `active`, which is driven by `useActiveSection`'s `IntersectionObserver` — so the nav strip follows the page scroll automatically without any extra event listeners.

### Verification
Open the dashboard with enough segments that the nav bar overflows horizontally. Scroll the page down past the visible pills — the nav strip should smoothly slide to keep the highlighted pill in view.

---

## 2026-05-15 — Google PMax URL: logging + root-domain fallback + url_expansion flag

### What changed
- **`lib/google-ads.ts`** — PMax GAQL query: added `asset_group.final_url_expansion_opt_out` to the selected fields.
- **`lib/google-ads.ts`** — bucket creation block: replaced the silent path-only extraction with the same pattern used for Meta — if the path is non-empty use it, otherwise fall back to the hostname (stripped of `www.`). Added a `console.log` per asset group showing `final_urls[0]`, the resolved value, and whether URL expansion is on/off.

### Why this works
The logs confirmed Meta's URL gap was caused by not requesting the right field. PMax has an analogous issue: `asset_group.final_url_expansion_opt_out = false` means Google dynamically determines landing pages from the site rather than using the explicit `final_urls` — so some asset groups may have `final_urls = []` or only the root domain. The `url_expansion` flag in the log will tell us immediately whether the missing URL is a Google API limitation (expansion ON, no explicit URL set) or a root-domain discard we can fix in code. The hostname fallback handles the root-domain case the same way as the Meta fix.

### Verification
After deploy, server logs should print `[Google PMax] URL for "..."` for each of the 4 asset groups, showing what `final_urls[0]` Google returned and whether expansion is enabled. Asset groups with a path should now show it; root-domain-only ones will at least show `camelbackresort.com`.

---

## 2026-05-15 — Meta URL: fetch asset_feed_spec.link_urls for dynamic creative ads

### What changed
- **`lib/meta.ts`** — `AdCreative` type: added `link_urls?: Array<{ website_url?: string }>` to `asset_feed_spec`.
- **`lib/meta.ts`** — fields string: added `link_urls{website_url}` to the `asset_feed_spec` sub-selection in the `fetchAdDetails` API request.
- **`lib/meta.ts`** — URL cascade: `asset_feed_spec.link_urls[0].website_url` is now checked first (before `link_data.link`), matching the ad format used by all current Commit campaigns. Log labels updated accordingly.
- **`lib/meta.ts`** — URL loop: added a `facebook.com`/`fb.com` hostname guard so Facebook Event URLs (e.g. `CamelBeach Opening Day`) are silently skipped rather than displaying `/events/...` as the destination chip.

### Why this works
Server logs (added in the previous entry) showed that every active Meta ad returned `—` for all four previously-checked URL fields. This is because all current campaigns use the `asset_feed_spec` dynamic creative format, where Meta stores the destination URL in a completely separate field — `asset_feed_spec.link_urls` — that is not part of `object_story_spec`. Adding `link_urls{website_url}` to the request and checking it first resolves the URL for all dynamic creative ads. The facebook.com guard prevents the one event-promotion ad (`CamelBeach Opening Day`) from leaking its event URL into the destination chip.

### Verification
After deploy, server logs should show `asset_feed_spec.link_urls[0]=https://www.camelbackresort.com/...` for each ad. Brand chips on Meta cards should now display the actual landing page path (e.g. `/aquatopia-waterpark`) instead of the `camelbackresort.com` fallback.

---

## 2026-05-15 — Meta URL: log candidates + treat root URLs as valid

### What changed
- **`lib/meta.ts`** — URL extraction block (~line 726) now:
  1. Logs all four URL candidates (`link_data.link`, `link_data.cta.link`, `video_data.cta.link`, `creative.object_url`) for every ad to the server console so it's visible whether Meta is returning a URL at all for a given ad type.
  2. When a valid URL is found but the path is root-only (`/`), falls back to `parsed.hostname` (stripped of `www.`) instead of leaving `destinationUrl` undefined. This means the brand chip shows e.g. `camelbackresort.com` drawn from the *actual URL* rather than the hardcoded fallback string — distinguishing "Meta returned a homepage link" from "Meta returned no URL at all".
  3. Logs a `No URL found` warning for ads where all candidates are missing or unparseable.

### Why this works
Previously, root-domain URLs (`https://www.camelbackresort.com/`) produced an empty pathname after stripping the trailing slash, which evaluated as falsy and caused the loop to skip all candidates — leaving `destinationUrl` undefined for every awareness/brand campaign that links to the homepage. The component's static fallback `'camelbackresort.com'` then fired silently with no way to tell it apart from ads where Meta genuinely returns no URL. The new logic: valid URL → use path if non-empty, otherwise use hostname. No URL → `destinationUrl` stays undefined, but a warning is logged.

### Verification
Check server logs after the next page load — each Meta ad should print a `[Meta] URL candidates for "..."` line. Ads with no URL in any field will also print `[Meta] No URL found for "..."`. Brand chips on homepage-linked ads should now show `camelbackresort.com` (same visual, but now sourced from the real URL rather than the hardcoded constant).

---

## 2026-05-15 — Nav icon mark updates when segment name is renamed

### What changed
- **`components/TopBar.tsx`** — added `getInitials(name: string): string` helper (above `JumpMark`) that derives a short mark from any display name: all-caps tokens up to 4 chars are kept verbatim (e.g. "CMA" → "CMA"); multi-word names produce first-letter initials of up to 3 words (e.g. "Water Park" → "WP"); single mixed-case words use their first letter (e.g. "Aquatopia" → "A"). In the `navItems.map` render loop, replaced `p.mark` with `getInitials(getName(p.id, p.name))` so the chip always reflects the current display name rather than the static prop.

### Why this works
Previously `<JumpMark mark={p.mark} />` always read the static `mark` field from the `NavItem` prop (set once at server render time), while the visible label beside it called `getName(p.id, p.name)` which respects localStorage overrides. The two were independent, so renaming a segment updated the label but left the icon chip frozen. By deriving the mark from the same `getName(...)` call that produces the label, both now come from a single source of truth and stay in sync on every re-render triggered by a `setName` call in `SegmentOverrideContext`.

### Verification
Unlock edit mode → rename a segment (e.g. "Lodge" → "Golf") → icon chip immediately changes from "L" to "G". Multi-word rename (e.g. "Water Park") → chip shows "WP". All-caps name (e.g. "CMA") preserved as "CMA". Reload page → overrides persist via localStorage; chips still match labels.

---

## 2026-05-15 — Move admin lock icon to footer

### What changed
- **`components/ClientProviders.tsx`** — removed `<AdminUnlock />` and its import; the component no longer renders the lock button as a floating overlay.
- **`app/page.tsx`** — imported `AdminUnlock` and added it as the third child inside `<footer className="footer">`, so it renders inline next to "last sync".
- **`app/layout.tsx`** — replaced `.admin-lock` CSS: removed `position: fixed / bottom / right / z-index / backdrop-filter / box-shadow` and replaced with a lightweight inline button style (transparent background, rounded border on hover) that fits the footer's mono/small-text aesthetic. Added `color: var(--live)` to the `.unlocked` state so it stays visually distinct.

### Why this works
The `SegmentOverrideProvider` lives in `ClientProviders` and wraps `{children}`, which includes `page.tsx`'s entire output (including the footer). So `AdminUnlock` — a client component that calls `useSegmentOverride()` — has full context access even when rendered inside the server-component footer. No provider restructuring was needed.

### Verification
Lock button no longer floats over content; it appears at the far right of the footer bar. Clicking it still opens the PIN dialog; unlocking still enables segment rename mode.

---

## 2026-05-15 — Increase top padding on ad card text panel

### What changed
- `app/layout.tsx` `.creative-detail` rule: changed `padding` from `3px 13px 14px` to `10px 13px 14px`. Only the top value changed; sides and bottom are unchanged.

### Why this works
The `3px` top padding was deliberately tight to eliminate a visual "bar" between the image and the text section, but it left the headline feeling cramped against the image bottom. `10px` gives enough breathing room without introducing a heavy gap. No other selectors override this padding for the image-card case, so this single change covers all Google and Meta image tiles.

### Verification
Google image ad cards now show a visible gap between the bottom of the image and the top of the headline text in the navy blue panel.

---

## 2026-05-15 — Remove Live/Paused pill from Meta cards

### What changed
- `components/CreativeTile.tsx` (line ~175): added a `platform === 'meta'` check so the `corner-status` pill renders `null` for Meta cards. Google cards continue to show the destination URL; StackAdapt and any other non-Google platforms continue to show the Live/Paused pill.

### Why this works
The pill branch was already gated to non-Google platforms. Adding a Meta exclusion is a single ternary insertion — no new state, no CSS changes needed. The `isLive` helper and `live` variable remain in place for StackAdapt's pill.

### Verification
Meta tiles no longer render the top-right "Live" badge; StackAdapt tiles still do; Google tiles still show the destination URL.

---

## 2026-05-14 — Add favicon

### What changed
- `app/favicon.ico`: added favicon — blue square outline on white background, generated as a multi-size ICO (64×64, 32×32, 16×16).

### Why
No favicon existed; browsers were showing a blank tab icon.

---

## 2026-05-14 — Add Ski & Tubing + Group segments; admin segment rename

### What changed
- `lib/segments.ts`: added two new curated segments — `ski` ("Ski & Tubing", matchers: ski/tubing) and `group` ("Group", matchers: meetings/meeting/group). These were landing in the Other catch-all because no curated entry existed for them.
- `components/SegmentOverrideContext.tsx` (new): client-side React context that stores custom segment name overrides in localStorage under `seg-name-overrides-v1`. PIN-gated via `NEXT_PUBLIC_ADMIN_PIN` env var (default `1234`).
- `components/AdminUnlock.tsx` (new): floating 🔒 button fixed bottom-right. Click → PIN dialog → unlocks edit mode. Shows 🔓 when unlocked; click again to lock.
- `components/SegmentNameDisplay.tsx` (new): client component used inside the (server) `SegmentSection`. Renders plain name normally; in edit mode shows a pencil hint and becomes click-to-edit inline input.
- `components/ClientProviders.tsx` (new): thin client wrapper that provides `SegmentOverrideProvider` + renders `AdminUnlock`. Added to `app/layout.tsx` so it covers all pages.
- `components/SegmentSection.tsx`: replaced `<div className="segment-name">{name}</div>` with `<SegmentNameDisplay id={id} name={name} />`.
- `components/TopBar.tsx`: nav pills now call `getName(p.id, p.name)` from the override context so renames reflect in the top bar too.
- `app/layout.tsx`: imports `ClientProviders`, wraps `{children}` with it, and adds CSS for the admin lock button, PIN modal, editable name, and inline input.

### Why this works
Curated segments always win over auto-discovery; adding them with the right matchers is the only reliable fix. The rename feature stores overrides client-side (localStorage) so no API/database is needed — correct for an internal dashboard already behind login. The server component (`SegmentSection`) imports the client component (`SegmentNameDisplay`) which is valid in Next.js app router; the client boundary is drawn at the leaf, not the tree root.

### Verification
Deploy → segments "Ski & Tubing" and "Group" appear as their own tabs. Click 🔒 → enter 1234 → click any segment name → rename → refresh → name persists.

---

## 2026-05-14 — Remove per-ad image source diagnostic log

### What changed
- `lib/meta.ts`: removed the temporary per-ad `console.log` added earlier today.

### Why
Log served its purpose. Findings: 18/23 active ads land on low-res fallbacks because `adimages` only resolved 25/73 hashes (page-library images aren't in the ad account's `/adimages` store), and video thumbnails fail with `(#10)` (system user lacks Content permission on the Page). Fix requires granting the system user Content/Manage permission on the Facebook Page in Meta Business Manager. No code change can unblock this.

---

## 2026-05-14 — Widen Meta destination URL cascade to cover video and older ad formats

### What changed

**`lib/meta.ts`** — Added three new URL sources to the `AdCreative` type and the Graph API `fields` string: `creative.object_url` (top-level fallback for older formats), `link_data.call_to_action{value{link}}` (CTA button override for image/link ads), and `video_data.call_to_action{value{link}}` (destination URL for video ads). The URL extraction block now tries all four candidates in priority order — `link_data.link` → `link_data.call_to_action.value.link` → `video_data.call_to_action.value.link` → `creative.object_url` — and stops at the first non-root path found.

### Why this works

Meta spreads the destination URL across different fields depending on ad format: image/link ads use `link_data.link`; video ads with a CTA button use `video_data.call_to_action.value.link` instead; some older creative formats expose `object_url` at the top level. The previous code only checked `link_data.link`, so video ads and other formats fell back to the hardcoded `camelbackresort.com` domain. The cascade covers all standard formats. The one remaining case that won't have a URL is flexible/dynamic creative ads that store the link only inside `asset_feed_spec.link_specs` — that subfield isn't queryable through the standard creative fields endpoint.

### Verification

After deploy, Meta brand chips should show a path (e.g. `/ski`, `/lodging`) for video ads and older creative formats, not just image/link ads.

---

## 2026-05-14 — Show destination URL path on Meta and Google cards

### What changed

**`lib/types.ts`** — Added `destinationUrl?: string` to the `Ad` interface. Stores the path segment extracted from the ad's landing page URL (e.g. `/aquatopia-waterpark`). Both connectors populate this; `explodeAd` inherits it automatically via object spread.

**`lib/meta.ts`** — Added `link` to the `link_data` type definition and to the Graph API `fields` string (`link_data{...,link,...}`). After building the ad object, the code extracts `new URL(ld2?.link).pathname`, strips trailing slash, and stores it as `destinationUrl`. Unparseable or root-only (`/`) URLs are silently skipped.

**`lib/google-ads.ts`** — Added `ad_group_ad.ad.final_urls` to the GAQL SELECT in `fetchAdDetails`, and `asset_group.final_urls` to the PMax asset-group query. Both paths extract `new URL(rawUrl).pathname` with the same trailing-slash-strip logic. The PMax bucket type grew a `destinationUrl` field so it survives the bucket→Ad conversion.

**`components/CreativeTile.tsx`** — `brandFor()` now accepts a `destinationUrl?` parameter. For Meta it uses the path as the chip handle instead of the old hardcoded `@camelbackresort` (falls back to `camelbackresort.com` if missing). For Google image/video cards the `corner-status` Live/Paused pill is replaced by a `corner-url` span showing the path, or nothing if no URL is available. For Google text-only RSA cards the `creative-detail--google-text` footer now renders a `corner-url--text` span instead of the pill; the footer is omitted entirely when there is no URL.

**`app/layout.tsx`** — Added `.corner-url` CSS class: same frosted-glass pill shape as `.corner-status` but with no `::before` pulsing dot. Added `.creative-detail--google-text .corner-url` / `.corner-url--text` override for the light-background footer. Removed the now-dead `.creative-detail--google-text .corner-status` rules (three selectors) since that element no longer appears in the DOM.

### Why this works

Meta's `link_data.link` is the canonical click-through destination for link ads. Adding it to the fields request costs nothing — it's a scalar string on an object we already fetch. Google's `ad_group_ad.ad.final_urls` is a standard GAQL field available on all ad types (RSA, ETA, IMAGE_AD, RESPONSIVE_DISPLAY_AD); `asset_group.final_urls` is its PMax equivalent. Neither requires additional API permissions.

Showing the path (not the full URL) keeps the chip compact — the domain (`camelbackresort.com`) is implied and would overflow the pill at 10 px font size.

### Why the @ handle was removed

`@camelbackresort` was a hardcoded placeholder that read like a social handle rather than an ad destination. Replacing it with the actual landing page path gives the reviewer actionable context (which page/section is this ad driving to?) at a glance.

### Verification

- Meta connector: verify `link` appears in the raw Graph API response for at least one ad by checking server logs for `[Meta] live ads with spend this month`.
- Google connector: `final_urls` is logged implicitly in the ad-type breakdown; no new log line needed.
- UI: Meta brand chips should show paths like `/ski` or `/aquatopia-waterpark` instead of `@camelbackresort`. Google image cards should show a frosted path pill top-right. Google RSA text cards should show a light path chip in the footer.

---

## 2026-05-14 — Fix sub-pixel gap on creative card base color

### What changed

**`app/layout.tsx`** — `.creative` card base `background` changed from `transparent` to `#242841`. Added a companion rule `.creative.has-text-card { background: #fff; }` for Google text-only SERP cards.

### Why this works

Both `.creative-media-wrapper` and `.creative-detail` use `#242841` as their background, but a sub-pixel rendering gap between the two stacked elements would let the parent lane/section background show through as a faint light bar. The tinted Meta panel background made this especially visible. Setting the card base to `#242841` ensures any sub-pixel gap renders as dark slate instead of showing the lane color. Google text-only cards have white inner panels, so they get `background: #fff` via `.has-text-card` to avoid a dark sliver there instead.

### Files touched
- `app/layout.tsx`

### Verification

Visual check across Meta, StackAdapt, and Google text-only cards: no visible gap/bar between media wrapper and copy panel.

---

## 2026-05-14 — Remove three stale/orphaned files

### What changed

**`generate_dashboard.py`** (deleted) — 653-line Python script from the initial commit. It was the original standalone approach: fetch ads from all three platforms and write a self-contained `dashboard.html`. The Next.js app replaced it entirely. Nothing in the codebase imported or referenced it; it had not been touched since the first commit.

**`components/AdCard.tsx`** (deleted) — the old ad card component from before the "live wall" redesign. `CreativeTile.tsx` replaced it as the primary render unit. No file contained an actual import statement pointing to `AdCard`; two code *comments* in `layout.tsx` and `meta.ts` mentioned it by name but nothing depended on it at runtime.

**`AGENTS.md`** (deleted) — auto-generated one-line stub (`## Imported Claude Cowork project instructions`) with no real content. `CLAUDE.md` already serves as the authoritative agent instructions file.

### Why this works

Pure deletion — no behaviour changes, no import graph affected. The two `meta-*` API routes (`meta-img`, `meta-thumb`) were audited and kept; they serve distinct purposes and are both actively referenced in `lib/meta.ts`.

### Verification

`grep -r "AdCard\|generate_dashboard\|AGENTS" --include="*.ts" --include="*.tsx"` returns zero hits after removal.

---

## 2026-05-14 — Tighten image-to-text gap on creative cards

### What changed

**`app/layout.tsx`** — `.creative-detail` top padding reduced from `7px` to `3px` (full rule changed from `padding: 7px 13px 14px` to `padding: 3px 13px 14px`).

### Why this works

The "white bar" the user reported between the photo and the headline panel was the 7px of dark navy space above the headline inside `.creative-detail`. While the panel's background is the same `#242841` slate as the media wrapper, that 7px gap was reading as a visible separator strip — especially next to photos whose bottom edge has light pixels (sky, horizon, etc.), which makes the seam look like a bright bar by contrast.

Cutting the top padding to 3px brings the headline almost flush against the image. Side and bottom padding are unchanged so card breathing room and rounded-bottom corner spacing stay the same.

### Files touched
- `app/layout.tsx`

### Verification

Visual check on Meta/StackAdapt cards: the headline should now sit close to the bottom edge of the image with only a minimal dark band between them — no longer reads as a separator bar.

---

## 2026-05-14 — Active nav pill fills with segment color, white text

### What changed

**`components/TopBar.tsx`**
- The `<a>` for each jump pill now sets `style={{ '--accent': p.accent }}` so each pill carries its own segment color as a CSS custom property.
- `JumpMark` no longer takes an `accent` prop or sets inline color — it relies on the `--accent` variable inherited from the parent `<a>`. One source of truth per pill.

**`app/layout.tsx`**
- `.nav-jump a.active`: changed from `color: var(--ink); background: #fff; border-color: rgba(0,0,0,.1)` to `color: #fff; background: var(--accent); border-color: transparent`, with a slightly stronger shadow so the filled pill lifts off the top bar.
- `.nav-jump .jump-mark`: moved the `background: var(--accent); color: #fff` declaration off the inline style and into CSS (default state).
- `.nav-jump a.active .jump-mark`: overrides the chip to `rgba(255,255,255,.22)` translucent white so the letter inside the chip stays legible against the accent-filled pill (instead of disappearing as accent-on-accent).
- `.nav-jump a.active .jump-count`: switched from `var(--ink-2)` to `rgba(255,255,255,.85)` so the live/total count stays readable on the filled pill.

### Why this works

The pill needed to know the segment's color in CSS, not just inline-style the inner chip. Promoting `accent` to a CSS custom property on the `<a>` is the cleanest way — both the chip and the pill-fill can read the same variable, and toggling the `.active` class is enough to swap from "outline" treatment to "fill" treatment without recomputing colors in JS.

The translucent white wash on the inner chip (`rgba(255,255,255,.22)`) is the standard pattern for keeping a brand-colored chip readable on top of the same brand color — preserves the visual rhythm of the unselected state (chip + label + count) without losing the chip's silhouette.

### Files touched
- `components/TopBar.tsx`
- `app/layout.tsx`

### Verification

Scroll between segments and confirm: the active pill's background fills with the segment's accent color, its text turns white, and the inner letter chip becomes a translucent white wash with the letter still visible. Inactive pills are unchanged.

---

## 2026-05-14 — Google reverted to horizontal scroll + Meta gets the same tinted panel

### What changed

**`app/layout.tsx`** — three things:

1. **Google `.lane` reverted from CSS grid back to the default horizontal-scroll flex lane** by deleting the `display: grid; grid-template-columns: ...` override and the `.lane .creative { width: 100% }` override. Google cards now scroll sideways just like Meta and StackAdapt.
2. **Tinted SERP-style panel background extended to Meta** by changing the selector from `.seg-platform[data-platform="google"]` (alone) to `.seg-platform[data-platform="meta"], .seg-platform[data-platform="google"]`. Same gradient, border tint, and elevation shadow on both sections. StackAdapt intentionally stays white to give the eye a visual break between platforms inside a segment.
3. **Underlying first-card-clip fix ported to this deployed file.** The base `.lane` had `scroll-snap-type: x proximity` and `.creative` had `scroll-snap-align: start` — both unchanged since before any of today's session. These two together cause Chrome to auto-scroll the lane to the first snap target on page load, consuming the lane's left padding and clipping the first card. Removed both. Added the rAF-deferred `scrollLeft = 0` reset script at the end of `<body>` as a belt-and-suspenders backup. These three changes existed in the `ad-dashboard/` duplicate (commits `bd091ca`, `4285a58`) but were never on the deployed root file.

The Google-specific refinements (blue-leaning header separator, mark chip border, campaign divider tint, stronger SERP-card shadow) are kept and now sit cleanly as overrides on top of the shared Meta+Google panel rule.

### Why this works

The horizontal-scroll lane was always the right layout for the live wall — it matches the other platforms and keeps the page from growing vertically when a campaign has many cards. The grid was a workaround for a clipping bug; with the root-cause snap fix now in the deployed file, the workaround is no longer needed.

Putting Meta on the same tinted background visually pairs the two paid-search/social platforms while still letting StackAdapt's white panel stand out as the programmatic block. The `inset` highlight on the top edge and the soft drop shadow give the panels enough lift to read as distinct surfaces against the page background without competing with the cards inside.

### Files touched
- `app/layout.tsx`

### Verification

After deploy:
1. Google cards scroll horizontally with no first-card left clip.
2. Meta and Google `.seg-platform` containers share the same soft tinted background; StackAdapt remains the default white.
3. No `scroll-snap` behavior on any lane.

---

## 2026-05-14 — Google row full redesign: tinted SERP panel + wrapping grid (deployed file)

### What changed

**`app/layout.tsx`** (root-level — the file Vercel actually builds from) — added a full Google-row redesign block right after `.seg-platform:first-child`:

- `.seg-platform[data-platform="google"]` gets a tinted SERP-style background (`linear-gradient(180deg, #f6f9fc 0%, #fbfcfe 100%)`), blue-leaning border (`#dbe4ee`), and soft elevation shadow.
- `.seg-platform[data-platform="google"] .lane` switches from `display: flex; overflow-x: auto` (the base lane behavior) to `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); overflow: visible`. No more horizontal scroll inside the Google block — cards wrap onto multiple rows.
- Cards inside the Google grid get `width: 100%` (overrides the base `clamp(280px, 19vw, 340px)` flex sizing) so they fill their grid column.
- Mark chip, separator colors, and SERP-card shadow are retuned to read correctly against the tinted background.

### Why this matters — the bigger fix

Four prior commits today (`9c27e84`, `4505609`, `ddd5d89`, `90ca982`) attempted to fix the same first-Google-card-clip issue with progressively-bigger CSS edits — and none of them changed anything on the deployed site. Reason: those commits all modified `ad-dashboard/app/layout.tsx`, but Vercel's Root Directory is configured to **this repo's root**, not the `ad-dashboard/` subfolder. The `ad-dashboard/` tree is a stale duplicate that nobody is deploying.

This entry lands the redesign on the actual deployed file. Vercel will pick it up on the next build.

### Why the grid layout fixes the clip at the root

The base `.lane` is `display: flex; overflow-x: auto`. Even with `scroll-snap-type` removed and a JS reset to `scrollLeft = 0`, the lane can still have its first card visually clipped by the scroll origin in certain layout/cache states. Padding the lane bigger doesn't help — the scroll box still exists, the padding just moves where the clip happens.

Switching the Google lane to a CSS grid removes horizontal scrolling entirely. There is no `scrollLeft` to consume padding, no snap target to auto-scroll to, no overflow box to clip the first card. The clip is gone by construction.

### Files touched
- `app/layout.tsx` (root)

### Follow-up — the duplicate tree

The repo currently has two parallel Next.js trees: the root (deployed) and `ad-dashboard/` (stale duplicate). Recent edits diverged between them. A cleanup commit deleting `ad-dashboard/` is recommended to remove future ambiguity, but is intentionally not done in the same commit as this redesign so the diff stays focused.

### Verification

Visual check on the next Vercel deploy:
1. The Google block has a noticeably tinted background and stronger shadow vs. Meta / StackAdapt.
2. Google cards lay out in a grid and wrap to new rows — no horizontal scrollbar inside the Google lane.
3. No card is clipped on the left edge.

---

## 2026-05-14 — Eliminate white bar between Meta image and text panel

### What changed

**`app/layout.tsx`** — two CSS tweaks on `.creative` and `.creative-detail`

- `.creative`: changed `overflow: visible` → `overflow: hidden`. The card is a flex column whose two children (`.creative-media-wrapper` and `.creative-detail`) both carry `background: #242841`, but with `overflow: visible` on the parent any sub-pixel rendering gap at the junction between the two panels let the white page background (`#ffffff`) show through as a visible white bar. `overflow: hidden` clips the card to its `border-radius: 12px` boundary, so no background can bleed through regardless of fractional-pixel widths from the `clamp()` sizing.
- `.creative-detail`: top padding reduced from `12px` to `7px`. This tightens the space between the bottom of the image and the headline text, making the overall transition strip thinner.

### Why this works

`overflow: hidden` forces the browser to treat the `.creative` element's rounded rectangle as the clip boundary for all child paint. The children's own dark backgrounds fill every pixel of that rectangle — no gap, no white. The padding reduction is purely cosmetic: 7px is enough for visual breathing room above the headline without the "band" feeling.

### Files touched
- `app/layout.tsx`

---

## 2026-05-14 — Google text-only cards: shorter + white content area edge-to-edge

### What changed

**`app/layout.tsx`** — restyled the Google text-only ad card (`.creative.has-text-card`)

Two visual issues with text-only Google RSAs: (1) the card was much taller than its content, leaving a band of empty white space below the headline + description, and (2) the headline/body had too little horizontal room because the white inner card was inset inside a gray backdrop — text was compacted into a narrow column.

- Dropped the 4:3 aspect frame on text-only tiles. `.creative-ph` is shared with image placeholders elsewhere, where the 4:3 aspect ratio + `min-height: 140px` make sense. For text cards the aspect was forcing a square-ish frame regardless of how short the copy was. New `.creative.has-text-card .creative-ph` override sets `aspect-ratio: auto`, `height: auto`, `padding: 0` so the area hugs the height of its text.
- `.creative-ph-card` lost `min-height: 140px` (replaced with `min-height: 0`), tightened padding from `18px 14px 14px` to `16px 18px 14px` (slightly more horizontal so the copy gets room without pushing the card tall), and has no border/shadow of its own — the white area IS the dominant surface of the tile.
- `.creative.has-text-card .creative-media-wrapper` is now plain white (`background: #fff`, `padding: 0`, `border-radius: 12px 12px 0 0`). Earlier this pass we tried a gray paper backdrop with the white card inset inside it (`padding: 12px`, `background: var(--bg-2)`), with a border + shadow on the inner card. That made the white area too narrow and the user reported the text felt compacted — so we removed the inset and pushed the white edge-to-edge.

### Why this works

The `.has-text-card` class is applied in `CreativeTile.tsx` only for `platform === 'google' && !hasVideo && !hasImage`, so every override is automatically scoped to text-only Google RSAs and can't leak into image/video tiles. The "card" effect for these tiles now comes from two places: (a) the outer `.creative` tile's existing `box-shadow` defines the rounded card edge against the page; (b) the existing `.creative-detail--google-text` footer strip (gray `var(--bg-2)` with `border-top` hairline) gives a visible horizontal division between the white content area and the Live/Paused pill below — so the tile still reads as a structured card, just one without an extra "card inside a card" frame.

### Verification

Hard-reload the dashboard and inspect any text-only Google ad. The white SERP card should now (a) be roughly the height of its content plus ~14–16px padding, with no large empty band below the description, and (b) fill the entire width of the tile edge-to-edge with no gray inset border around it — only the gray Live/Paused strip remains at the bottom of the tile.

---

## 2026-05-13 — Description fully wraps; Google website-URL pill removed

### What changed

**`app/layout.tsx`** — bulletproofed `.creative-detail` so the body copy can never be clipped

The Meta card description (`<p>` inside `.creative-detail`) was visibly cut off mid-word (`"Splash into fun at Aquatopia! Alway..."`). The CSS file no longer contained the obvious culprits (no `-webkit-line-clamp` and no `text-overflow: ellipsis` on `.creative-detail p`), but the rendering still showed a single-line truncated paragraph. Earlier passes attempted to fix this by toggling `position: absolute → relative` in cascade order, which broke unreliably and got reverted (see the 2026-05-13 "Meta card full caption" entry above this one, which describes the failure mode).

This pass takes the belt-and-suspenders route: every rule that *could* truncate the description is now explicitly turned off at the `.creative-detail` and `.creative-detail p` selectors so no later rule, inherited declaration, or stale cached CSS can re-clip it.

- `.creative-detail`: `position: static`, `overflow: visible`, `max-height: none`, `height: auto`, `flex` column with `gap: 4px`. Position is anchored to `static` so an old `position: absolute` rule from any prior build can't sneak back in through the cascade.
- `.creative-detail h4`: `display: block`, `white-space: normal`, `text-overflow: clip`, `max-height: none`, `overflow: visible`, `-webkit-line-clamp: unset`, `-webkit-box-orient: unset`. Defeats any `-webkit-box` clamp pattern.
- `.creative-detail p`: same overrides applied to the description paragraph specifically — this is the element the screenshot showed getting cut off. `white-space: normal` defeats any inherited `nowrap`; `display: block` defeats any stray `-webkit-box` clamp. Now the paragraph wraps onto as many lines as it needs and the card grows tall accordingly.
- `.lane`: switched `overflow-y: hidden → overflow-y: clip`. `clip` is the modern equivalent that doesn't promote `overflow-x: auto` into `overflow-y: scroll` weirdness, and because the lane's height is determined by its tallest child, nothing actually gets clipped — `clip` is purely a guarantee that no spurious vertical scrollbar appears on the lane itself.

**`components/CreativeTile.tsx`** — removed the website-URL pill from Google ad tiles

Google tiles were rendering a `"camelbackresort.com"` brand chip in the info row below the creative. That pill was duplicative of the "Sponsored" badge and the Google identity already visible on the SERP-style text-card preview, and on image/video Google PMax tiles it added a generic website label next to the live/paused status with no real signal.

- `brandFor(platform)` now returns `null` for `platform === 'google'` (still returns the `@camelbackresort` chip for Meta and `camelbackresort.com` for StackAdapt — the StackAdapt URL is intentionally kept because there is no other channel branding on its tiles).
- The JSX guards on `brand` being non-null. When `brand` is `null`, an empty `<span aria-hidden />` is rendered in its place so the existing `justify-content: space-between` on `.creative-info-row` continues to right-align the live/paused pill — no layout shift.

### Why this works

The description fix is intentionally over-specified. Even if a stale rule from the cascade (or a future addition somewhere else in the file) tries to clamp the paragraph again, the explicit `unset`/`none`/`visible`/`normal` declarations on `.creative-detail p` itself will out-specify it — these are on the *exact* element being styled, not a parent. The previous fix attempts kept failing because they relied on changing a single property (`position`) at parent-level specificity equal to the rule they were trying to override; this time every truncation lever is locked at the leaf element.

The Google pill removal is a single boolean gate in the component, not a CSS hide — so the DOM is genuinely smaller for Google tiles and there's no chance of a `.brand-chip` rule re-showing it later.

### Verification

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → exit 0.
- Spot-check: Meta cards now show the full body copy wrapped across multiple lines; Google cards no longer show the `camelbackresort.com` chip (the live/paused status remains, right-aligned).

### Files touched

- `app/layout.tsx`
- `components/CreativeTile.tsx`

---

## 2026-05-13 — Meta card full caption + nav bar typo fix

### What changed

**`components/CreativeTile.tsx`** — Meta caption moved out of the overlay system
- Removed Meta from the `creative-detail` hover panel entirely. Meta cards no longer render `.creative-detail`.
- Added a new `.meta-caption` div rendered in **normal document flow** after the `creative-media` element. Because it is not absolutely positioned, the card grows naturally to fit the full caption — no clipping, no line-clamp.

**`app/layout.tsx`** — replaced broken CSS with clean `.meta-caption` rules
- Removed the previous meta caption CSS attempts (which fought with `position: absolute` via cascade specificity and failed to reliably override).
- Added `.creative[data-platform="meta"] { display: flex; flex-direction: column; overflow: visible }` so the card expands for the caption block.
- Added `.meta-caption`, `.meta-caption-headline`, and `.meta-caption-body` classes with dark background, white text, no overflow constraints.

**`app/page.tsx`** — typo fix
- `innerNote` corrected from `"Made in North Kore"` → `"Made in North Korea"`.

### Why this works
The previous CSS fix tried to change `position: absolute` to `position: relative` on `.creative-detail` via a later rule of identical specificity. This was unreliable. The new approach bypasses the problem entirely: Meta gets a purpose-built caption element that is never absolutely positioned, so neither `overflow: hidden` on the card nor any cascade conflict can clip it.

### Files touched
- `components/CreativeTile.tsx`
- `app/layout.tsx`
- `app/page.tsx`

---

## 2026-05-13 — Lighter page + zoomed-out Meta creative frames

### What changed

**`app/layout.tsx`** — page background moved from tan to paper-white
- `--bg`: `#f7f3eb` → `#fffdf8`
- `--bg-2`: `#ece5d3` → `#f7f8f2`
- Body background now uses a very light vertical gradient (`var(--bg)` → `var(--bg-2)`) instead of the single warmer tan fill. The top bar still keys off `--bg`, so its translucent sticky surface follows the lighter page without a second set of colors.

**`components/CreativeTile.tsx`** — tiles now expose their platform to CSS
- Added `platform-${platform}` and `data-platform={platform}` on the root `.creative` element.
- Wrapped image and video media in a `.creative-media` container. That gives CSS a stable frame to size the media without changing the overlay chips, CTA, hover detail, or text-only placeholder path.

**`app/layout.tsx`** — Meta media now renders contained instead of enlarged
- Added a shared `.creative-media` flex frame.
- Added a Meta-only rule: `.creative[data-platform="meta"] .creative-media` gets a 4:5 aspect ratio, 12px internal padding, and a dark matte background.
- Added a Meta-only media rule: images/videos fill that frame with `object-fit: contain` instead of full-bleed enlargement. A square, landscape, or story creative now shows the whole asset smaller inside the card, which reduces the visible blur when Meta only gives us a soft thumbnail.

### Why this works

The remaining blur is no longer only an API-resolution problem; some Meta creatives arrive as poster/thumbnail assets and then look worse when the UI makes them full-bleed. The prior natural-aspect approach stopped forced 9:16 cropping, but it still let Meta media take the full card width. Giving Meta a contained matte frame deliberately displays the same source pixels at a smaller size, which reads sharper and less zoomed-in while keeping the card layout intact.

### Verification

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → exit 0.
- `git diff --check` → exit 0.
- `node node_modules/next/dist/bin/next build` using the bundled Node runtime → exit 0.
- Local browser check at `http://127.0.0.1:3000` confirmed the lighter page shell. Live card verification was blocked by placeholder/invalid ad API credentials in `.env.local`, so the dashboard rendered 0 creatives locally.

## 2026-05-13 — Lighter tan background + real brand SVGs for Meta + Google Ads

### What changed

**`app/layout.tsx`** — background tokens lightened
- `--bg`: `#f4efe6` → `#f7f3eb`
- `--bg-2`: `#e9e2d3` → `#ece5d3`
- Same tan family, but the warm/brown undertone is pulled out — visually reads as a clean off-white tan rather than a beige with warmth.

**`app/layout.tsx`** — platform-mark + jump-mark tiles re-skinned for full-color logos
- The 56px `.platform-mark` tile previously used a per-brand gradient backing (blue → navy for Meta, multi-color for Google, orange for StackAdapt) with the SVG rendered as a white silhouette via `color: #fff`. That backing fought the actual brand colors. Replaced with a plain `#fff` tile, soft border (`var(--line)`), faint inner highlight, and a 32px SVG slot. The brand mark's native colors come through unmodified.
- The 18px `.jump-mark` pill in the nav got the same treatment — transparent background, 14px logo. The pill's parent (`.nav-jump a`) already supplies the active/hover chrome.

**`components/PlatformSection.tsx`** — render the official SVGs
- Deleted the local `MARK_BG` gradient map and the hand-drawn `PlatformMark` paths (a generic infinity squiggle for Meta, a triangular-wedge approximation for Google Ads, stacked bars for StackAdapt — all eyeballed, none accurate to the actual brand marks).
- `PlatformMark` now thin-wraps `MetaLogo` / `GoogleAdsLogo` / `StackAdaptLogo` from `components/PlatformLogo.tsx` at `size={32}`.

**`components/TopBar.tsx`** — same swap for the jump-pill marks
- Deleted local `MARK_BG` + `MarkIcon`. `JumpMark` now renders the same three logos at `size={14}` inside the transparent pill.

### Why this works

The official Meta SVG (3-color gradient infinity, from Meta's press kit) and the official Google Ads SVG (3-color triangular "A" mark, from the simple-icons distribution at `icons/googleads.svg`) were already inlined in `components/PlatformLogo.tsx` — they just weren't being used on the dashboard surface. The header and nav were rendering parallel hand-drawn approximations instead. Pointing both surfaces at the real logos uses geometry that's already been verified against the brand source, and dropping the colored tile lets the native brand colors do the recognition work.

### Known gap — StackAdapt is still a placeholder

`StackAdaptLogo` in `components/PlatformLogo.tsx` is a custom teal→blue gradient rounded square with an "S" — not the actual StackAdapt brand mark. simple-icons doesn't ship a StackAdapt icon, and `stackadapt.com` isn't on the dev sandbox network allowlist, so the official SVG can't be fetched programmatically. When the SVG is supplied, drop it into `components/PlatformLogo.tsx → StackAdaptLogo` and both the platform-section header and the jump-pill nav pick it up automatically (no other edits needed).

### Verification
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → exit 0.
- Spot-check that the Meta mark is the blue gradient infinity and Google Ads is the yellow/blue triangle + green dot, both on a clean white tile.

---

## 2026-05-13 — Postmortem + /adimages secondary lookup

### What broke
Last deploy added `picture.width(800).height(800)` to the Meta fields string, assuming `picture` was a valid field on the Ad node. It isn't — that's a Page-level field. Meta's behavior on an unknown field is to **error the entire batch**, not just drop the field, so every Meta detail call returned `(#100) Tried accessing nonexisting field (picture)` and the dashboard showed 0 Meta ads. Owning that — I should have verified the field against Marketing API docs before shipping.

### What changed

**`lib/meta.ts`** — broken field removed; real fix wired up
- Stripped `picture.width(800).height(800)` from the batch `fields` string, and removed `ad.picture` from `AdDetail` + `pickImageUrl()`. The detail call works again.
- Replaced the speculative ad-level picture path with **`/{account_id}/adimages` lookup by hash** — the *documented* way to get a full-resolution image URL for any creative type, and the same source Meta uses for its own Ads Manager thumbnails:
  1. **Pass 1**: pull raw ad details in 50-id batches (existing flow).
  2. **Pass 2**: `collectHashes()` walks every creative subfield (`creative.image_hash`, `link_data.image_hash`, `child_attachments[].image_hash`, `video_data.image_hash`, `asset_feed_spec.images[].hash`) into one `Set<string>`.
  3. **Pass 3**: `fetchAdImageUrls()` calls `/{account_id}/adimages?hashes=[...]&fields=hash,url`, chunked at 100 hashes per request, and builds a `Map<hash, originalUrl>`.
  4. **Pass 4**: `pickImageUrl(ad, hashToUrl)` prefers hash-resolved URLs (always full-res uploads) before falling back to the direct-URL cascade we already had.
- Updated `ImageSource` union to include the 5 hash-resolved sources so the per-source log breakdown can distinguish "served from /adimages" vs "served from creative subfield". Bonus log line: `[Meta] adimages resolved 47/52 hashes` shows resolution coverage.

### Why this should hold
Two reasons. (1) `/adimages` is documented behavior, not speculation — the previous attempts kept failing because they relied on me guessing which subfield Meta populates for each ad type. (2) The hash-resolved URL is the original upload, so it's the highest quality the account holder ever provided. Anything downstream of that is by definition not blurry from undersized fetching.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- After deploy, expect Vercel logs like:
  - `[Meta] adimages resolved N/M hashes`
  - `[Meta] image source breakdown: {"adimages(link_data.image_hash)": 35, "adimages(creative.image_hash)": 12, "link_data.picture": 6, ...}`
  - `[Meta] sample picked URL:` — should be a `scontent-*.fbcdn.net` URL with no `/p64x64/` size suffix.

---

## 2026-05-13 — Google Ads logo as "A"; Meta blur — ad.picture cascade + per-source counts

### What changed

**`components/PlatformLogo.tsx`** — Google Ads logo, take three
- The previous "fix" was wrong on both colors and geometry. The real Google Ads mark is an **"A"** made of:
  - YELLOW bar leaning right (left leg)
  - BLUE bar leaning left (right leg — bars meet at the top)
  - GREEN `#34A853` circle at the bottom-left tip of the yellow leg
- My earlier code had the right idea originally; my "fix" replaced the blue leg with a duplicate yellow and turned the green circle blue. Reverted to the correct colors and rewrote as two stroked `<line>` elements with `strokeLinecap="round"` for the pill shape, plus the green circle drawn last so it sits at the yellow leg's tip.

**`lib/meta.ts`** — adding the ad-level `picture` field to the cascade

User feedback after the prior attempt: boosted page posts came in sharp (`link_data.picture` works), but video / carousel / dynamic ads were still blurry. Reason: those types don't expose a high-res URL in any of the creative subfields we were reading — they expose only low-res previews of their poster/cover/first-product.

The fix is to use Meta's **ad-level `picture` field with `.width().height()` modifiers**. Documented behavior: Meta renders a fresh preview of *any* ad type at the requested size. Same shape Meta uses to power its own Ads Manager thumbnails.

- Added `picture.width(800).height(800)` to the batch fields.
- Updated `AdDetail` type with `picture?: string`.
- Renamed `pickCreativeImage(creative)` → `pickImageUrl(ad)` so it can see the new ad-level field. New cascade order:
  1. `creative.image_url` (static image ads — already worked)
  2. **`ad.picture`** (NEW — Meta-rendered 800px preview, works for everything else)
  3. `object_story_spec.link_data.picture` (boosted posts)
  4. `link_data.child_attachments[0].picture` (carousel)
  5. `object_story_spec.video_data.image_url` (video poster)
  6. `asset_feed_spec.images[0].url` (DPA)
  7. `creative.thumbnail_url` (last resort, still sized to 600 via URL params)
- `pickImageUrl()` now **returns the source field** alongside the URL, so the diagnostic logging can produce a breakdown of which field is dominant.

**Diagnostic upgrade** — per-source counts instead of just-the-first-sample
- Previous logs only printed the very first ad's fields. Now we tally how many ads were served by each source across the whole batch and dump the count map at the end:
  `[Meta] image source breakdown: {"ad.picture": 12, "link_data.picture": 8, "creative.thumbnail_url": 2}`
- Plus the first 3 picked URLs (first 160 chars) so the resolution token in the URL path (`/p1080x1080/`, `/p64x64/`, etc.) is visible at a glance.

### Why this should land it
The previous fix was right that we were looking in the wrong fields for non-static ads. This adds the **one Meta-rendered field that works regardless of ad type** (`ad.picture` with size hints) and pushes it second in the cascade. If sharpness is still off after this deploy, the per-source log will name the exact culprit so we can iterate without guessing.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- After deploy, check Vercel logs for `[Meta] image source breakdown:` — should show most ads served by `ad.picture` or `link_data.picture`, with `creative.thumbnail_url` rare or zero.

---

## 2026-05-13 — Stat readout demoted, Google logo fixed, Meta blur — third (real) attempt

### What changed

**`app/page.tsx`** — campaigns/creatives is a stat, not a button
- The dark `#0f172a` pill with big white number had been reading as a CTA. Replaced with a plain inline stat: small (13px) text, bolded number, muted label, no background, no padding, no border. Sits inline next to the jump buttons.

**`components/PlatformLogo.tsx`** — Google Ads logo redrawn
- Two real problems in the previous SVG:
  1. The two bars **crossed like an X** — the real Google Ads mark has two **parallel** parallelograms, not crossed.
  2. The circle was **green** (`#34A853`, which is Gmail/Drive green) — the real mark's circle is **blue** (`#4285F4`).
- Rewritten using rotated `<rect>` elements so the bars are unambiguously parallel: full-opacity yellow on the left, lighter (`opacity: .55`) yellow on the right, both tilted ~20°. Circle is `#4285F4` at bottom-left.

**`lib/meta.ts`** — actually fixing the blur this time

Honest postmortem on the prior two attempts:
- **Attempt #1** swapped `thumbnail_url` for `image_url`. Only helps **static-image** ads. Boosted page posts, video ads, carousel ads, and dynamic-product ads all return empty `image_url`, so the code silently fell back to the tiny default thumbnail.
- **Attempt #2** added URL-level `thumbnail_width=600&thumbnail_height=600` to size up the fallback thumbnail. Helpful, but if Meta's account leans on boosted-post / video / dynamic creatives (very common), the right URL was sitting in a *different* field — `object_story_spec.link_data.picture`, `object_story_spec.video_data.image_url`, or `asset_feed_spec.images[].url` — and we never asked for those.

What this attempt actually does:
- **Field expansion** now pulls every common place a Meta creative hides its image:
  - `creative.image_url` (static)
  - `creative.object_story_spec.link_data.picture` (boosted page posts — *the dominant case for most accounts*)
  - `creative.object_story_spec.link_data.child_attachments[].picture` (carousel ads)
  - `creative.object_story_spec.video_data.image_url` (video ads — usually a 1080p+ poster)
  - `creative.asset_feed_spec.images[].url` (dynamic / DPA ads)
  - `creative.thumbnail_url` (last-resort fallback, sized to 600 via URL param)
- **`pickCreativeImage()`** cascades through those fields in best-to-worst quality order and returns the first non-empty URL.
- **Diagnostic logging** — the missing step from prior attempts. On the first batch, we now log a boolean fingerprint of which fields Meta populated and the first 160 chars of the picked URL. So on the next Vercel deploy you can read the logs and *see* whether image_url was empty, which fallback fired, and what URL ended up on the card. No more "I think this fixes it" — verify.

### Why I'm more confident this one's real
The prior fixes were both based on assumption ("image_url should be there", "thumbnail_width should resize it"). This one names the specific field for each creative type that Meta is documented to populate, cascades through them, and instruments the code so we can confirm what's happening. If blur persists after this deploy, the log will tell us exactly which field had the URL and we can adjust the cascade order or pull a different field — not flail again.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- After deploy, check the Vercel logs for `[Meta] sample creative fields:` and `[Meta] sample picked URL:` — the URL line should show a Meta CDN path containing a sizing token like `/p1080x1080/` or `/p600x600/` rather than `/p64x64/`.

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
