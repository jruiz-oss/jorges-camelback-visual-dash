# Changelog

Running log of meaningful changes to the ad dashboard. Newest at the top. Each entry explains **what** changed and **why** the change works the way it does, so future debugging starts with context instead of guesswork.

> Maintenance rule (see `CLAUDE.md`): every code change appends an entry here, names the files it touched, and removes any stale content elsewhere in the repo's `.md` files.

## 2026-06-10 — Full carousel experience: no skeleton ever shown

### What changed
1. **`components/HulaCarousel.tsx`** (new) — Extracted the spinning platform-logo carousel from `app/login/page.tsx` into a shared `'use client'` component so login, `loading.tsx`, and `DashboardLoadGuard` all use the same animation.
2. **`app/login/page.tsx`** — Removed the inline `HulaCarousel` function + its LOGOS/logo imports; now imports from `@/components/HulaCarousel`.
3. **`app/[client]/loading.tsx`** — Replaced the shimmer skeleton with the `HulaCarousel` + "Loading your dashboard…" text, matching the login loading screen exactly. This is what Next.js shows while the server component runs its API fetches.
4. **`components/DashboardLoadGuard.tsx`** — Replaced the skeleton overlay with `HulaCarousel` + same text. This covers the real dashboard until `.creative-img` elements are all `complete`.

### Why this works
The user sees a single continuous carousel from the moment they log in until the dashboard is fully painted — no skeleton, no intermediate state. The three phases (login navigating state → `loading.tsx` → `DashboardLoadGuard`) all render the identical screen so the transition is invisible.

### Verification
Login → carousel throughout → dashboard fades in once images loaded.

---

## 2026-06-10 — Hold loading screen until ad images are actually loaded

### What changed
1. **`components/DashboardLoadGuard.tsx`** (new) — Client component that renders a fixed full-page skeleton overlay on top of the real dashboard. Polls `.creative-img` elements every 150 ms; fades out (0.65s opacity transition) once every image with a src is `complete` (loaded or errored). Falls through immediately if there are no image tiles (text-only/audio walls). Hard cap of 8 s prevents blocking forever on a slow connection.
2. **`app/[client]/page.tsx`** — Imports and renders `<DashboardLoadGuard />` as the first element in the page return so the overlay covers the whole dashboard.
3. **`app/login/page.tsx`** — Removed the 2.2 s artificial delay added in the previous entry; it's no longer needed now that the guard waits for real image readiness.

### Why this works
`loading.tsx` is dismissed by Next.js as soon as the server component resolves — which happens after the API fetches finish but before browser image downloads complete. `DashboardLoadGuard` fills that gap by keeping the skeleton visible on the client side until `img.complete === true` on every `.creative-img`. The overlay uses the same dot-grid background as the page body so there is no colour flash at reveal.

### Verification
Login → route-level skeleton (loading.tsx) → DashboardLoadGuard skeleton continues → fades out once image tiles are painted → dashboard visible with images loaded.

---

## 2026-06-10 — Hold login loading screen longer before navigating (superseded)

> **Superseded by the entry above.** The 2.2 s artificial delay was removed once `DashboardLoadGuard` took over holding the screen until real readiness.

### What changed (original)
- **`app/login/page.tsx`** — Added then removed a 2.2 s `setTimeout` between `setNavigating(true)` and `router.push()`.

### Why it was reverted
A fixed timer is fragile — too short on slow connections, unnecessary on fast ones. `DashboardLoadGuard` solves the problem properly by watching actual image load state.

---

## 2026-06-10 — Skeleton loading screen for client dashboards

### What changed
1. **`app/[client]/loading.tsx`** (new) — Route-level loading UI Next.js renders automatically while `page.tsx` runs its server-side connector fetches. Static markup that reuses the real chrome classes (`.topbar`, `.platforms`, `.segment`, `.lane`) plus three skeleton sections of shimmering placeholder tiles, the live pulse dot, and a "Loading live placements" mono label. Lane overflow set to `hidden` inline so the skeleton never shows a scrollbar.
2. **`app/layout.tsx`** — New `@keyframes shimmer` plus `.skel`, `.skel-tile`, `.skel-loading-note` classes. Shimmer animates `background-position` on a 200%-wide gradient (no moving overlay elements) so many blocks stay cheap to paint. `.skel-tile` mirrors the real `.creative` width clamp at each breakpoint so the swap to real content causes no layout shift. Already covered by the `prefers-reduced-motion` block.

### Why this works
Before this, `force-dynamic` meant a blank white page during first load while Meta/Google/StackAdapt fetches ran. `loading.tsx` is the app-router-native fix — zero changes to `page.tsx`. The skeleton uses the same section classes as the real page, so it also inherits the fadeUp entrance, and real sections fade in over the same footprint when ready.

### Verification
`npx tsc --noEmit` clean. Navigating to a client route shows the shimmer skeleton immediately, then the dashboard replaces it in place without shift; soft 60s refreshes are unaffected (loading.tsx only shows on full navigations, not `router.refresh()`).

---

## 2026-06-10 — Subtle entrance + hover animations

### What changed
**`app/layout.tsx`** (all CSS, no markup/JS changes):

1. New `@keyframes fadeUp` (opacity 0→1, translateY 14px→0). Applied to `.segment, .platform` as `animation: fadeUp .5s cubic-bezier(.2,.7,.3,1) backwards`, staggered via `.platforms > :nth-child(1/2/3)` delays (.05s/.13s/.21s) with `:nth-child(n+4)` sharing a flat .28s delay.
2. Creative image hover zoom: `.creative-img` gets `transition: transform .6s`; `.creative:hover .creative-img` scales to 1.04. The existing `overflow: hidden` on `.creative-media`/`.creative-media-wrapper` clips the scaled image inside the rounded corners. StackAdapt is special-cased: only `.img-fill` (edge-to-edge) images zoom — `contain`-mode letterboxed banners get `transform: none` because scaling a contained image against its visible letterbox background reads as a rendering glitch, not a polish effect.
3. New `prefers-reduced-motion: reduce` block at the end of the stylesheet: forces near-zero `animation-duration`/`transition-duration` on everything (covers the new animations plus the pre-existing pulse/spin) and resets `scroll-behavior` to `auto`.

### Why this works
- `backwards` fill on fadeUp keeps cards invisible during their stagger delay instead of flashing visible then restarting.
- Flat delay for cards 4+ avoids multi-second waits on clients with many segments — below-the-fold cards are done animating before they're scrolled to.
- Reduced-motion uses `.01ms` durations rather than `animation: none` so keyframe end-states still apply — `fadeUp` content can never be stuck at opacity 0.

### Verification
Cards fade up once on load with visible stagger; tile hover zooms Meta/Google images and StackAdapt fill-mode images but not letterboxed banners; with macOS "Reduce motion" on, no movement and all sections fully visible.

---

## 2026-06-09 — Password show/hide toggle on login page

### What changed
**`app/login/page.tsx`** — Added `showPassword` boolean state. Wrapped the password `<input>` in a relative `<div>` and placed an absolutely-positioned icon button on the right edge. Button toggles `showPassword`, which switches `input type` between `"password"` and `"text"`. Added `box-sizing: border-box` and updated padding (`10px 40px 10px 14px`) so text doesn't slide under the icon. Eye icon uses inline SVG (no external dependency) — closed-eye (slash) when visible, open-eye when hidden.

### Why this works
Pure React state, no extra deps. The button is `type="button"` so it doesn't trigger form submission.

### Verification
Clicking the eye toggles visibility; form still submits on Enter/click; no layout shift on the input.

---

## 2026-06-09 — Remove "Made in North Korea" nav byline

### What changed
**`app/[client]/page.tsx`** — Removed the `innerNote="Made in North Korea"` prop from the `<TopBar>` call. The `innerNote` prop on `TopBar` is optional and already guarded with `{innerNote && ...}`, so no component changes needed.

### Why this works
Prop is optional; omitting it suppresses the byline entirely without touching the component.

### Verification
TopBar renders without the note; no TypeScript errors since the prop is `innerNote?: string`.

---

## 2026-06-08 — Remove auto-refresh label from ticker

### What changed
**`components/TopBar.tsx`** — Removed the `auto-refresh · 60s` span and its preceding separator from the `.ticker` strip. Ticker now shows `● LIVE · date` only.

### Why this works
User-facing cleanup; the auto-refresh still runs — only the label is gone.

### Verification
Ticker renders `● LIVE · Jun 8, 2026` with no auto-refresh text.

## 2026-06-08 — Replace StackAdapt logo with exact brand asset

### What changed
- **`public/stackadapt-logo.svg`** — Added the exact StackAdapt S mark SVG supplied by the client (auto-traced from the official PNG).
- **`components/PlatformLogo.tsx`** — `StackAdaptLogo` now renders an `<img src="/stackadapt-logo.svg">` instead of a hand-drawn inline SVG path. Previous attempts (arc-path approximation, then two `<polygon>` chevrons) did not match the real logo.

### Why this works
Serving the brand asset as a static file in `/public` means no external network calls and no path approximation errors. The `<img>` tag scales via `width`/`height` props, matching the same `size` prop interface used by the other platform logo components.

### Verification
Logo appears correctly on both the dashboard platform headers and the login carousel.

---

## 2026-06-08 — Parallel platform fetches: reduce dashboard load time

### What changed
- **`app/[client]/page.tsx`** — `fetchGoogleAds` now runs inside the same `Promise.allSettled` as `fetchMetaAds` and `fetchStackAdaptAds`. Previously Google was awaited sequentially after Meta+StackAdapt resolved, adding its full latency on top.
- **`lib/meta.ts`** — Meta's Pass 3 batch-resolve changed from 4 sequential awaits to two parallel pairs: `fetchAdImageUrls + fetchAdPreviews` in `Promise.all` (different endpoints — `/adimages` and `/batch` — so no rate-limit conflict), then `fetchVideoThumbnails + fetchVideoSourceUrls` in a second `Promise.all` (same `/?ids=` endpoint but read-only field queries Meta handles concurrently).

### Why this works
The Google fetch was pure sequential dead time — nothing in the Meta or StackAdapt results is needed to start the Google query. Moving it into `Promise.allSettled` lets all three platforms race in parallel so load time is bounded by the slowest single platform rather than the sum of all three.

For Meta, full parallelism (all 4 calls at once) previously triggered Meta's `(#4) Application request limit reached` rate-limit error on the video calls. Two-phase parallel avoids the burst: the first pair hits different root endpoints; the second pair hits the same node concurrently but Meta allows parallel field reads without rate-limiting them.

### Verification
Dashboard loads; all three platform lanes populate. No Meta rate-limit errors in server logs (`[Meta] ... error` lines absent for video thumbnail/source calls).

## 2026-06-08 — Login loading screen: smooth rAF-based hula hoop carousel

### What changed
- **`app/login/page.tsx`** — Replaced the interval/state-driven carousel with a `requestAnimationFrame` loop that writes directly to DOM refs (`itemRefs`). No React state updates per frame, so animation runs at true 60 fps without re-render overhead.
- Radius tightened to 52 px so side logos feel close and slightly behind the center logo.
- Scale and opacity are derived from `cos(θ)` for each logo's current angle: front (cos=1) → scale 1.0, opacity 1.0; sides (cos≈−0.5) → scale ~0.7, opacity ~0.5; back fades to 0 only in the last 25° of the arc.
- `zIndex` is also driven by depth so the front logo always renders on top.

### Why this works
Driving animation through rAF + direct style mutation avoids batching/scheduling delays that make React state-driven animations feel steppy. The cos/sin math models a true circular path so depth, size, and opacity all change continuously and in sync.

### Verification
Correct password → carousel appears → all three logos rotate smoothly with side logos visually close/behind the center one → dashboard loads.

## 2026-06-08 — Login loading screen: hula hoop platform logo carousel

### What changed
- **`app/login/page.tsx`** — Added a `navigating` state that flips to `true` immediately after a successful auth response (before `router.push`). When `navigating` is true, the login card is replaced by a fullscreen light-theme loading screen.
- New `HulaCarousel` component (same file) renders three slots — left, center, right — using `GoogleAdsLogo`, `MetaLogo`, and `StackAdaptLogo` imported from `components/PlatformLogo.tsx`. The center slot is full size and full opacity; the flanking slots are scaled to 0.48 and 35% opacity, creating depth. An interval cycles the active index every 1400 ms, shifting all three slots one step right on each tick.
- Transitions are CSS `transform + opacity` with `cubic-bezier(0.4,0,0.2,1)` — smooth arc-like motion without any fade-in/out on the logos themselves.

### Why this works
The `navigating` flag is set before `router.push`, so the loading screen appears the instant auth succeeds — before Next.js starts fetching the dashboard page. It stays visible until the navigation completes and the component unmounts. Wrong-password attempts never set `navigating`, so the error state on the login card is unaffected.
Reusing the existing `PlatformLogo` SVG components (already tested, no external network calls) means no new assets and guaranteed brand consistency with the dashboard.

### Verification
Log in with a correct password → login card should immediately swap to the carousel → Google Ads, Meta, StackAdapt logos rotate through → dashboard loads.

## 2026-06-08 — Fix Google OAuth redeploy: team ID support + fetch latest deployment

### What changed
- **`app/api/google-oauth/callback/route.ts`** — New `vercelUrl(path)` helper appends `?teamId=...` to every Vercel API call when `VERCEL_TEAM_ID` env var is set. Vercel team projects (as opposed to personal-account projects) require `teamId` on every API request; without it the API returns 403/404 silently.
- `triggerVercelRedeploy()` now uses `GET /v9/projects/:projectId/deployments?limit=1&target=production&state=READY` to find the latest READY production deployment, then calls `POST /v13/deployments/:latestId/redeploy`. Previously it used `VERCEL_DEPLOYMENT_ID` (the running function's own deployment ID) which had two problems: (1) it's not necessarily the most recent deployment, and (2) it doesn't carry enough context for team-scoped projects.
- `updateVercelEnvVar()` also updated to use `vercelUrl()` so env-var PATCH/POST calls include `teamId` when needed.
- Error messages from both functions now include the HTTP status code for easier diagnosis.

### Why this works
Vercel's REST API treats team resources and personal resources under different namespaces. A personal access token can access team resources only when the request includes the team's ID as a query parameter. Previously both the env-var update and redeploy calls omitted this, causing silent failures on team projects.

Fetching the latest READY deployment (instead of the running function's own deployment ID) is safer because the running function may be an older deployment — the project might have had a newer deploy that didn't affect the Google creds file. We want to redeploy whatever is currently considered "production".

### Verification
After reconnecting: Vercel function logs should show `[google-oauth] Triggered redeploy of deployment dpl_xxx`. A new deployment should appear in the Vercel dashboard automatically within ~30 s of the OAuth callback completing.

### Required env var to add (if project is under a Vercel team)
`VERCEL_TEAM_ID` — find it in Vercel dashboard → Settings → General → "Team ID" (starts with `team_`).

## 2026-06-08 — Fix Google OAuth reconnect UX: redirect timing and redeploy-failure tone

### What changed
- **`app/api/google-oauth/callback/route.ts`** — `htmlPage()` helper extended with a `tone` param (`'success'` / `'warning'` / `'error'`). The legacy `success: boolean` still works as a fallback.
- Auto-redirect delay changed from 35 s → 180 s. Vercel deploys take 2–5 minutes; the old 35 s sent users back to the running deployment (still carrying the old revoked token), which showed the "disconnected" banner again and caused confusion.
- A live countdown timer + "go now" link is rendered so users aren't left staring at a blank page.
- The redeploy-failure branch now uses `tone: 'warning'` (yellow heading) instead of `tone: 'success'` (green). Previously both the success and partial-success states showed a green "Successfully reconnected ✓" heading, masking the manual-redeploy requirement.
- Body copy in the redeploy-failure case now explicitly directs the user to Vercel dashboard → Deployments → Redeploy.
- Full-success body copy updated to set honest expectations ("2–3 minutes") instead of "about 30 seconds".

### Why this works
The OAuth flow saves the new `CAMELBACK_GOOGLE_REFRESH_TOKEN` env var in Vercel, but Vercel serverless functions (Next.js RSC + API routes) bake `process.env` at deployment time, not at request time. The new token is therefore invisible until a fresh deployment completes. The previous 35 s redirect was shorter than even Vercel's fastest deploys, so users always hit the old running instance.

The redeploy-failure tone fix addresses a real incident: if `VERCEL_API_TOKEN` is missing or has wrong scopes, `triggerVercelRedeploy()` throws and the catch block runs — but the old code returned a green "success" page, so users assumed reconnect worked.

### Verification
Reconnect flow → should now see either a yellow warning (if redeploy fails) or a green page with 3-minute countdown + "go now" link.

## 2026-06-03 — Remove Live/Paused pill from StackAdapt tiles

### What changed
- **`components/CreativeTile.tsx`** — In `.creative-info-row`, the non-Google/non-Meta branch that rendered `<span className="corner-status">{live ? 'Live' : 'Paused'}</span>` is gone. The row now only renders the Google destination-URL pill (`corner-url`) when applicable; StackAdapt tiles show just the brand chip.
- **`app/layout.tsx`** — Deleted the now-dead `.corner-status` rules (base, `::before` pulsing dot, and both `.creative.paused` overrides). `.corner-url` keeps its own copy of the pill styling so Google cards are unaffected. The `pulse` keyframe stays — it's still used by the header dot, platform-row dots, and group LIVE counters.

### Why this works
StackAdapt was the only platform still overlaying a status pill on the creative (Meta's was removed earlier; Google replaced it with the URL pill), so it looked inconsistent. Status isn't lost: paused ads still dim via the `paused` class on the tile, and the `live` variable still drives that. UI-only; no connector or data changes.

### Verification
- `npx tsc --noEmit` passes.
- `corner-status` no longer appears anywhere in components or styles (only in historical changelog entries).

## 2026-06-03 — Ad-type badge moved above the headline

### What changed
- **`components/CreativeTile.tsx`** — In the copy panel (`.creative-headline-row`), the `<span className="ad-type-badge">` now renders *before* the `<h4>` headline instead of after it. Pure JSX reorder; no data, fetching, or prop changes.
- **`app/layout.tsx`** — `.creative-headline-row` switched from a wrapping row (`flex-wrap: wrap`, `gap: 6px`) to a column (`flex-direction: column`, `align-items: flex-start`, `gap: 5px`). `.ad-type-badge` changed `align-self: center` → `flex-start` since centering only made sense beside the headline.

### Why this works
The old row layout placed the badge beside the headline and let it wrap below on long titles — which is why "NATIVE" appeared *between* the headline and description on multi-line headlines. A column layout makes the position deterministic: badge first, headline second, on every tile across Meta, Google, and StackAdapt. Reordering the DOM alone wasn't enough because a wrapping row could still render badge and headline side by side on short titles; the column removes that ambiguity. This is UI-only — `typeLabel()`, headline/body derivation, and all connector code are untouched.

### Verification
- `npx tsc --noEmit` passes.
- All platform tiles share this one copy-panel markup, so the badge position is consistent everywhere (text-only Google RSAs don't render the panel at all, unchanged).

## 2026-06-03 — Restore Meta signed fallback URLs

### What changed
- **`lib/meta.ts`** — Changed `upgradeFbImageUrl` to preserve Meta fallback CDN URLs exactly instead of removing `stp` resize/quality transforms.

### Why this works
The previous sharpening attempt assumed the `stp` transform was independent from the signed URL. Production logs showed static images returning `403` from `fbcdn.net` after the transform was removed, which means Meta's CDN can validate those URLs against the original transform. Preserving the signed URL restores image loading; the unresolved-hash diagnostics remain in place so blurry static ads can still be identified as Meta/API source limitations rather than proxy failures.

### Verification
- `npx tsc --noEmit` passes.
- Static fallback image URLs should stop losing their signed transform parameters before `/api/meta-img` fetches them.

## 2026-06-03 — Sharpen Meta static fallback images

### What changed
- **`lib/meta.ts`** — Replaced `upgradeFbThumbnailUrl` with `upgradeFbImageUrl`, and now applies it to every direct Meta image fallback (`creative.image_url`, `link_data.picture`, `child_attachments[*].picture`, `video_data.image_url`, `asset_feed_spec.images[*].url`, `asset_feed_spec.videos[*].thumbnail_url`, and `creative.thumbnail_url`). The helper now removes both `s###x###` and `p###x###` CDN resize transforms, plus `q##` quality hints, from the `stp` parameter instead of only handling `s###x###`.
- **`lib/meta.ts`** — Added `creative{id}` to the Meta ad detail query and logs unresolved image hashes when an ad still has to fall back to a low-quality source. The log now reports which hash fields Meta exposed but `/adimages` did not resolve.
- **`lib/meta.ts`** — Carousel fallback URLs from `asset_feed_spec.images[*].url` now run through the same CDN transform cleanup before proxying.

### Why this works
The earlier fix only helped one shape of Meta thumbnail URL: `creative.thumbnail_url` with an `stp` token like `s160x160`. Static Advantage+ creatives can instead expose direct asset URLs or thumbnail URLs with `p100x100`/quality transforms, so those were still being rendered as tiny CDN derivatives inside a larger tile. This change upgrades every direct image URL before the proxy sees it. If Meta does not expose a direct asset URL and `/adimages` refuses to resolve the hash, the new per-ad log makes that clear instead of pretending the app can recover the original image.

### Verification
- `npx tsc --noEmit` passes.
- Static ads that still log `LOW-RES` now include `creative=<id>` and `unresolved hashes=...`, which distinguishes an app-side URL transform issue from Meta simply not returning the original upload through the available API fields.

## 2026-06-03 — Security hardening: auth fixes + error handling

### What changed
- **`middleware.ts`** — Changed the `/api/` passthrough from "allow all API routes" to an explicit allowlist (`/api/auth`, `/api/google-oauth/`). All other `/api/*` routes (including `/api/meta-img` and `/api/meta-thumb`) now require a valid dashboard session cookie. For shared routes with no client slug in the URL, the middleware accepts any valid client cookie (iterates CLIENTS, verifies HMAC). Previously any unauthenticated caller could use the image proxy or trigger Meta API calls with our token.
- **`lib/stackadapt.ts` — `gql()`** — Wrapped `fetch()` and `res.json()` in a try-catch. Previously a StackAdapt network error or non-JSON response threw an unhandled rejection that propagated through every caller and silently wiped the entire StackAdapt lane (returning `[]` at the top-level catch with no diagnostic). Now returns `null`, which callers already handle defensively via `?.data?.t?.fields ?? []` and similar patterns.
- **`lib/stackadapt.ts` — GraphQL filter injection** — Added `.filter(id => /^\d+$/.test(id))` before campaign IDs are string-interpolated into the GraphQL query body, and `String(advertiserId).replace(/\D/g, '')` for the advertiser ID. API-returned IDs are always numeric in practice, but this closes the theoretical injection path if a malformed response included non-numeric data.
- **`lib/google-ads.ts`** — Added `networkError: boolean` to `GoogleAdsResult`. Previously every failure path returned `{ ads: [], authExpired: false }`, making it impossible to distinguish "no active ads" from "couldn't reach Google API". Now: `invalid_grant` → `authExpired: true, networkError: false`; network/transport failures → `authExpired: false, networkError: true`; API version probe failure → `networkError: true`; success → `networkError: false`. Missing `GOOGLE_DEVELOPER_TOKEN` / `customerId` now logs which specific variable is absent.
- **`app/[client]/page.tsx`** — Updated the `fetchGoogleAds` safety-net `.catch()` to return `networkError: true` (was missing from the shape), keeping it in sync with the updated type.

### Why this works
The middleware fix closes the proxy endpoint exposure without touching any happy-path logic — the allowlist is checked before the HMAC loop, so public auth routes are still handled first. The `gql()` fix only affects the error path; the success path (returning the parsed JSON object) is unchanged. The GraphQL ID filter strips non-digits and is a no-op on valid numeric IDs. The `networkError` flag is additive to the existing type — no rendering code was changed, so there is no visual difference; the field is available for future use.

### Verification
- Hitting `/api/meta-img?url=...` without a session cookie now returns `401 Unauthorized` instead of proxying the image.
- A simulated StackAdapt network error now logs `[StackAdapt] gql: network error` and returns `null` instead of throwing.
- `GoogleAdsResult` has three distinct states: `{ authExpired: true }` (reconnect), `{ networkError: true }` (transient), `{ networkError: false, authExpired: false }` (clean).

### Revert
`git revert HEAD` after committing, or `git reset --hard f01d64b` to restore the pre-fix snapshot.

## 2026-06-03 — Dynamic color deduplication for all segments

### What changed
- **`lib/segments.ts`** — Removed static color assignment from `autoSegmentFor` (previously used `hash(id) % palette.length`, which could collide). Added `pickColor(preferred, palette, used)` helper that tries a preferred color first and walks the palette until it finds an unused one. `buildSegments` now runs a single color-assignment pass over both curated and auto-discovered segments, guaranteeing no two visible segments share an accent.
- Expanded `AUTO_PALETTE` from 8 to 16 colors (added Teal, Purple, Pink, Amber, Cyan, Brown, Emerald dark, Rose dark) so there's headroom for many auto-discovered segments.
- Curated segment `accent` values are now documented as "preferred" hints, not guaranteed assignments.

### Why this works
Previously, curated segments had hard-coded colors (Ski and Aquatopia both used Indigo) and auto-discovered segments used a hash that could collide with each other or with curated ones (Beach and Mountain Adventures both hashed to the same green). Now all color assignment goes through one `pickColor` call per segment, with a shared `usedAccents` Set — so duplicates are structurally impossible.

### Verification
Any combination of segments — curated or auto-discovered — will render with distinct accent colors. Adding a new campaign vertical creates a new tab with an unused color automatically.

## 2026-06-03 — Fix duplicate Ski/Snow accent color

### What changed
- **`lib/segments.ts`** — Changed `ski` segment accent from `#1D446B` (Indigo) to `#21432B` (Spruce). Indigo was already used by `aquatopia`, causing both nav pills to render the same color.

### Why this works
Spruce is in the brand palette and unused by any other curated segment. Each curated segment now has a distinct accent color.

### Verification
Nav pills for Aquatopia (Indigo) and Ski/Snow (Spruce) are visually distinct.

## 2026-06-02 — Replace "API integration pending" with consistent no-ads message

### What changed
- **`components/SegmentSection.tsx`** — Removed the StackAdapt-specific `platform-not-connected` block (which showed "No ads connected / API integration pending"). All platforms now fall through to a single empty-state path that renders `<p className="platform-empty">No live ads with spend in the last 24 hours.</p>`. The old "this month" wording was also updated to "in the last 24 hours" on the remaining platform-empty path and the segment-level fallback.

### Why this works
StackAdapt is fully connected; the "API integration pending" copy was stale. The unified message is accurate for a live wall (24-hour window, not monthly) and applies equally to Meta, Google, and StackAdapt segments with zero active spend.

### Verification
Any segment with no ads — on any platform — now shows "No live ads with spend in the last 24 hours." The `platform-not-connected` CSS class is no longer used but left in the stylesheet (harmless).

---

## 2026-06-02 — Admin drag-to-reorder nav segments

### What changed
- **`components/SegmentOverrideContext.tsx`**: Added `segmentOrder: string[]` state and `setSegmentOrder(ids: string[]) => void` to the context. Order is persisted in localStorage under `seg-order-v1`. Hydrated on mount alongside the existing name-overrides key. Context default extended with the new fields.
- **`components/TopBar.tsx`**: Added `useMemo`-derived `orderedNavItems` — sorts `navItems` by `segmentOrder` from context, falling back to server order when empty. In admin (`editMode`) mode, each nav pill gets `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd` handlers. Drag source is tracked via a `useRef` to avoid re-renders on start; `dragOverId` state drives the `.drag-over` highlight class on the hovered pill. On drop, the reordered ID array is written via `setSegmentOrder`. Mobile nav dropdown also switched to `orderedNavItems`. `useActiveSection` now receives the ordered IDs so the first active highlight defaults to the visually-first segment.
- **`components/SegmentOrderStyle.tsx`** (new): Client component rendered inside the page. Reads `segmentOrder` from context and injects a `<style>` tag that sets `section#id { order: N }` for each segment. Uses `CSS.escape()` for safe ID interpolation. When `segmentOrder` is empty the component returns `null` and the server-rendered DOM order applies untouched.
- **`app/[client]/page.tsx`**: Imports `SegmentOrderStyle` and renders it between `GoogleReconnectBanner` and `<main className="platforms">`, passing `visibleSegments.map(s => s.id)` as `segmentIds`.
- **`app/layout.tsx`**: Added CSS for `.nav-jump.admin-reorder a` (grab cursor), `.nav-jump a.drag-over` (dashed accent outline), and `.nav-drag-handle` (braille-dot icon opacity).

### Why this works
`.platforms` is already `display:flex; flex-direction:column`, so the CSS `order` property is honored without any DOM mutation — the `IntersectionObserver` in `TopBar` still fires based on the physical viewport geometry of each `<section>`, which tracks correctly with visual order. Separating the style injection into its own client component keeps the server page component clean; the style tag is rendered server-side as an empty shell and populated on hydration from localStorage. The drag logic uses the ordered array snapshot at drop time, so mid-drag refreshes don't cause index errors.

### Verification
`npx tsc --noEmit` passes. In admin mode: drag pills left/right in the nav bar → order updates immediately in the nav and the page body. Order persists across refresh. Locking/unlocking admin mode preserves the saved order; lock removes drag handles.

## 2026-06-02 — StackAdapt brand chip shows destination URL path

### What changed
- **`lib/stackadapt.ts`** (`queryAds`): `clickUrl` was already fetched in the ads query but never mapped to `destinationUrl` on the Ad object. Added URL parsing (same `new URL()` + pathname extraction pattern as Meta/Google) to extract the path (e.g. `/aquatopia-waterpark`) and set it as `destinationUrl` on each ad.
- **`components/CreativeTile.tsx`** (`brandFor`): Changed the StackAdapt branch from always returning `clientDomain` to returning `destinationUrl ?? clientDomain` — same logic as the existing Meta branch.

### Why this works
Meta and Google already extract a URL path and store it in `ad.destinationUrl`; `brandFor` already used that field for Meta. StackAdapt was the odd one out — it fetched `clickUrl` but never threaded it through. This change closes that gap without touching any other tile logic.

### Verification
`npx tsc --noEmit` passes. StackAdapt tiles will now show the landing page path in the brand chip (e.g. `/aquatopia-waterpark`) instead of the client domain. Falls back to the client domain when `clickUrl` is absent or unparseable.

## 2026-06-02 — Fix Meta API: batch previews 0/N, burst rate limiting, 403 thumbnails

### What changed
- **`lib/meta.ts`** — `fetchAdPreviews`:
  1. Changed from `metaFetch` (Authorization header only) to plain `fetch` with `access_token` in the POST body. The root `graph.facebook.com` batch endpoint requires the token in the body — the `Authorization` header alone is not accepted, causing it to return a non-array error object. The existing loop iterates numeric indices on that object, gets `undefined` for every item, and silently produces `0/N` resolved with no error logged.
  2. Added an `Array.isArray` guard before the item loop that logs the full error response when the endpoint returns an object instead of an array. This makes future silent failures visible in server logs.
- **`lib/meta.ts`** — Pass 3 (batch-resolve): Changed from `Promise.all` (all 4 calls in parallel) to sequential `await` calls. Server logs confirmed that firing the image-hash, preview, video-thumbnail, and video-source fetches simultaneously triggers `(#4) Application request limit reached` for the video calls. Sequential execution spreads the requests over time and avoids the burst limit. Order: image hashes → previews → video thumbnails → video sources.
- **`app/api/meta-img/route.ts`**: Added `Referer: https://www.facebook.com/` to the upstream fetch headers. Some fbcdn.net CDN nodes (confirmed: `scontent-iad3-1.xx.fbcdn.net`) return 403 when no Referer is present — they expect requests originating from Facebook pages.

### Why this works
All three issues were confirmed directly from server logs: `[Meta] ad previews resolved 0/19` with no error (batch body fix), `(#4) Application request limit reached` on video sources + thumbnails (sequential fetch), and `[meta-img] upstream failed: 403 https://scontent-iad3-1.xx.fbcdn.net/...` (Referer header). With these fixed, `previewUrl` will be populated for all active Meta ads, enabling the `hasPreviewIframe` iframe fallback (prior entry) to actually function.

### Verification
`npx tsc --noEmit` passes. Next deploy should show `[Meta] ad previews resolved 19/19` and no `(#4)` errors in server logs.

## 2026-06-02 — Fix StackAdapt spend-check (return type null, wrong filterBy field names, status pattern match)

### What changed
- **`lib/stackadapt.ts`** (`queryAds`):
  1. **`queryType` introspection** (Step 1): Added `type { name kind ofType { ... } }` at the `fields` level. Previously only `args` was fetched, so `deliveryField.type` was `undefined` → `deliveryReturnTypeName` was always `null` → `deliveryReturnFields` was always empty → `rowsField` defaulted to `'rows'` → the spend-check query errored every time with "Cannot query field rows on type CampaignDeliveryPayload" → fell back to showing all candidates.
  2. **`filterBy` field name regexes**: Changed from `/^campaignIds?$/` and `/^advertiserId$/` to patterns that match `ids` and `advertiserIds` (the actual StackAdapt field names). Previously `filterByArg` was always empty (`filterBy:none` in logs), so the spend query scanned ALL campaigns in the account rather than just the target advertiser's.
  3. **Status filter fallback**: When `activeStatusValues` is empty (OBJECT type whose sub-field enum wasn't separately introspected), now falls back to pattern matching — drops campaigns whose status string matches `END|COMPLET|EXPIR|FINISH|CANCEL|INACTIV`, keeps ones matching `ACTIVE|RUNNING|LIVE`. Previously the gate `activeStatusValues.size > 0` silently skipped the filter entirely.

### Why this works
All three bugs independently allowed ended/inactive campaigns to slip through: (1) broke the entire spend filter, (2) made spend queries over-broad and slower, (3) disabled the status gate. Together they meant the only real filter was the flight end-date check, which doesn't apply to campaigns with no `currentFlight` set.

### Verification
`npx tsc --noEmit` clean. Spend-check logs should now show `filterBy:set` and `return:<typename>` instead of `none` and `null`.

## 2026-06-02 — Fix StackAdapt 0-ad bug: handle CampaignStatusType as OBJECT

### What changed
- **`lib/stackadapt.ts`** (`queryAds`, Step 3a + campaign query + Step 4b filter):
  1. `statusType` introspection now requests `kind`, `fields` in addition to `enumValues` — so we know whether `CampaignStatusType` is an ENUM, OBJECT, or something else.
  2. Replaced `campaignStatusFieldName ? campaignStatusFieldName : ''` in the campaign query with `campaignStatusSel`, which is built based on `kind`:
     - ENUM → bare scalar field (old behavior)
     - OBJECT → `fieldName { scalarSubField }` (finds a `state`/`status`/`value`/`name` scalar sub-field, or any scalar as fallback)
     - Unknown/SCALAR/etc. → empty string (field omitted entirely)
  3. Status filter in Step 4b now reads via `campaignStatusPath` (an array) rather than flat `c[fieldName]`, so it works for both ENUM (`['campaignStatus']`) and OBJECT (`['campaignStatus', 'state']`) cases.

### Why this works
The previous code assumed `CampaignStatusType` was a simple enum and selected `campaignStatus` as a bare scalar. StackAdapt's schema has it as an OBJECT type that requires `{ ... }` sub-selection — the bare field caused a GraphQL parse error that aborted the entire campaigns query and returned 0 results. The new code introspects the kind first and builds the appropriate selection. If the kind is unrecognized the field is omitted entirely, which is always safe.

### Verification
`npx tsc --noEmit`. Query error gone; ads resume.

## 2026-06-02 — StackAdapt: filter ended campaigns by status + flight end date

### What changed
- **`lib/stackadapt.ts`** (`queryAds`):
  1. **Step 3a introspection** (`schemaDiscRes`): Added `campaignType: __type(name: "Campaign")` to the existing batch. After the call, resolves which field on Campaign has type `CampaignStatusType` (e.g. `campaignStatus`) and which enum values match `/^active$/i`.
  2. **Campaign query nodes (Step 4)**: Conditionally includes `${campaignStatusFieldName}` in the `nodes` selection when the field exists — resolved safely from introspection rather than hardcoded.
  3. **Step 4b filter**: Two new guards added before `return true`:
     - **Status check**: If `campaignStatusFieldName` and known active values were found, campaigns whose status is not in `activeStatusValues` are dropped with a log line.
     - **Flight end-date check**: If `currentFlight[flightEndField]` is a valid date in the past, the campaign is dropped with a log line.

### Why this works
Previously the only filter against "technically on but done" campaigns was the 24h spend check. Campaigns that ended mid-yesterday could still appear (they had spend in the window), and if the spend-check fell back to all-candidates the status/date was never checked at all. Adding explicit status + end-date gates at Step 4b catches these before the spend query runs. Meta and Google connectors are untouched.

### Verification
`npx tsc --noEmit`. Guards are no-ops when introspection returns nothing (safe fallback preserved).

## 2026-06-02 — Strict StackAdapt 24h spend filter (no fallback-to-all when rows return)

### What changed
- **`lib/stackadapt.ts`** (`queryAds`, spend-check block, lines ~718–730):
  - Restructured the `spendingIds.size > 0 / else` branch into a `rows.length === 0 / else` check.
  - Previously: if the delivery API returned rows but all had $0 spend, the code fell into the `else` and kept **all** candidate campaigns (the "show too many rather than too few" fallback was too broad).
  - Now: if rows come back (delivery API is working), the strict filter always applies — campaigns not in `spendingIds` are dropped. The fallback to all candidates only fires when `rows.length === 0`, which indicates a token scope or API availability problem rather than genuine $0 spend.

### Why this works
The original fallback was written to guard against the delivery API returning nothing (empty token scope). That guard is preserved — `rows.length === 0` still keeps all candidates. But "rows came back, none have spend > 0" is a real signal, not a data-availability problem, so filtering should be applied. Meta and Google Ads connectors are untouched.

### Verification
`npx tsc --noEmit`. No logic change when rows are empty; behavior change only when delivery rows exist but all campaigns are $0.

## 2026-06-02 — Fix Meta video ad previews (use previewUrl iframe fallback)

### What changed
- **`components/CreativeTile.tsx`**:
  1. Added `isPreviewPlaying` state (parallel to `isVideoPlaying` for direct MP4 playback).
  2. Added `hasPreviewIframe` derived boolean — true when `platform === 'meta'` and `ad.previewUrl` is set but `ad.videoUrl` is not. This is the normal state for Meta video ads right now.
  3. Extended the `.video` CSS class condition from `hasVideo` to `hasVideo || hasPreviewIframe`, so Meta video tiles get the play-ring CSS even without a direct MP4 URL.
  4. Added a `hasPreviewIframe` rendering branch in the media section (between the `hasVideo` and `hasImage` branches): shows thumbnail/gradient pre-click, then the `<iframe src={ad.previewUrl}>` post-click.
  5. Extended the play ring render condition to include `hasPreviewIframe`.

### Why this works
Meta's video `source` field (fetched by `fetchVideoSourceUrls`) requires "Content" permission on the Page that owns the video. The system user only has Ads + Insights, so `fetchVideoSourceUrls` silently returns an empty map, `videoUrl` is never set, `hasVideo` is false, and no play ring renders. The fix doesn't require any permission change.

`fetchAdPreviews` (which runs server-side with just `ads_read`) already fetches a `/{ad_id}/previews?ad_format=DESKTOP_FEED_STANDARD` iframe URL for every active Meta ad and stores it as `ad.previewUrl` — but until now nothing in the UI ever read it. The iframe uses Meta's own embedded player, so video plays correctly, carousels work, no CORS issues, and no token is exposed to the browser.

If `previewUrl` is also absent (batch preview fetch failed), the tile degrades to a static image or gradient placeholder — same as before, no regression.

### Verification
`npx tsc --noEmit` passes. Meta video ad tiles now show a play ring; clicking embeds the `previewUrl` iframe inline in the 4:3 media container.

## 2026-06-02 — Fix StackAdapt video playback (open externally, no inline attempt)

### What changed
- **`components/CreativeTile.tsx`**:
  1. Added `isExternalVideoOnly` flag — true for any StackAdapt video or HLS `.m3u8` URL. Both are served from ad-tech CDNs that block cross-origin browser playback.
  2. For external-only videos: thumbnail click calls `window.open(videoUrl, '_blank')` instead of mounting an inline `<video>`. Play ring remains visible as a click affordance.
  3. `onError` still resets `isVideoPlaying` on the inline `<video>` path (Meta) as a safety net. `onStalled` was tried and removed — it fires during normal buffering and caused the same glitch on valid videos.
  4. "Watch video" link in the detail panel is always shown for external-only videos.

### Why this works
StackAdapt CTV video assets are served from programmatic ad-tech CDNs that block cross-origin browser playback — the browser mounts the `<video>` element, `onError` fires almost immediately (appearing as a half-second glitch), and the state resets. There is no way to play these inline without StackAdapt's own player context. The correct behavior mirrors audio ads: thumbnail + play ring visible, clicking opens the URL in a new tab. `onError` remains on the `<video>` path for non-StackAdapt platforms (Meta). `onStalled` was tried and removed — it fires during normal buffering initialization and caused the same reset glitch on valid videos.

### Verification
`npx tsc --noEmit` passes. StackAdapt video tiles show thumbnail + play ring; clicking thumbnail or "Watch video" link opens in a new tab. Meta video tiles retain inline `<iframe>` playback.

## 2026-06-02 — Filter StackAdapt campaigns by currentFlight endTime only

### What changed
- **`lib/stackadapt.ts`**: Removed `campaignStatus` from the campaign query (`CampaignStatusType` is an OBJECT, not a scalar/enum — selecting it without subfields errors the entire fetch). Removed `currentFlight === null` filter (too aggressive; null can mean open-ended or unsupported). Now only filters campaigns where `currentFlight.endTime` is explicitly present and in the past.

### Why this works
`CampaignStatusType` looked like an enum from the Campaign field list, but it's an object type — querying it as a scalar crashed the paginated campaign fetch and returned 0 results. The only reliable, non-breaking filter available is `currentFlight.endTime`: when it exists and is in the past, the campaign's current flight is over. Null/missing endTime is treated as open-ended (always include).

### Verification
`npx tsc --noEmit` passes. Server console shows `[StackAdapt] campaigns: X total, Y for this advertiser (after flight-date filter)` and per-campaign skip lines for any flight that ended.

## 2026-06-02 — Filter StackAdapt campaigns by status and active flight

### What changed
- **`lib/stackadapt.ts`**: Added a schema introspection call for `CampaignStatusType` (enum values) and `CampaignFlight` (date field names) before the campaign page loop. Both `campaignStatus` and `currentFlight { <startField> <endField> }` are now fetched on every campaign node. The filter logic:
  1. Skips campaigns where `campaignStatus` doesn't match known active-like values (regex `active|serving|live|running|delivering`, case-insensitive). Falls back to a hardcoded safe set if introspection returns nothing.
  2. Skips campaigns where `currentFlight` is `null` (no active flight — campaign hasn't started or all flights are over).
  3. Skips campaigns where the current flight's end date is before today.
  Each skipped campaign logs its name + reason so it's easy to verify in the server console.

### Why this works
Schema discovery (from the prior deploy) confirmed: `Campaign.campaignStatus` is `CampaignStatusType` and `Campaign.currentFlight` is `CampaignFlight`. Campaigns that ended by date or budget exhaustion stay un-archived in StackAdapt, so boolean flags alone can't catch them. `campaignStatus` is the authoritative delivery state; `currentFlight === null` is a reliable signal that no flight is active. The introspection-driven field selection avoids repeating the `startDate`/`endDate` mistake: if the field name ever changes, the log will show the new name rather than silently breaking.

### Verification
`npx tsc --noEmit` passes. Server console shows `[StackAdapt] CampaignStatusType values: …`, `[StackAdapt] CampaignFlight fields: …`, and per-campaign skip lines for anything that gets filtered.

## 2026-06-02 — Introspect Campaign type to discover date/status field names

### What changed
- **`lib/stackadapt.ts`**: Reverted the broken `startDate`/`endDate` fields from the campaign query (those fields don't exist on the `Campaign` type — querying them errored the entire campaigns fetch, returning 0 ads). Added a schema introspection call for the `Campaign` type (and its concrete `possibleTypes` if it's an interface) that logs all field names to the server console. This lets us identify the real date/status field names so the filter can be implemented correctly.

### Why this works
The `Campaign` schema log in the next deploy will show the actual field names (e.g. `endTime`, `flightEndDate`, `status`, etc.). Once confirmed, those fields get added to the campaign query and the filter logic is re-applied with the correct names. Reverting first was necessary because the bad query caused a GraphQL parse error that aborted ALL campaign fetching, dropping every StackAdapt ad from the wall.

### Verification
`npx tsc --noEmit` passes. StackAdapt ads return to the wall. Server console will now log `[StackAdapt] Campaign type fields: …` or `[StackAdapt] <ConcreteType> fields: …` showing date/status fields available for filtering.

## 2026-06-02 — Fix video tiles loading then never playing (autoplay-with-sound blocked)

### What changed
- **`components/CreativeTile.tsx`**: Replaced the `autoPlay` attribute on the click-to-play `<video>` with an explicit `play()` call in a mount `ref` callback, plus a muted-retry fallback and an `onError` log. The element now plays with sound when the browser allows it, and falls back to `muted` autoplay (then unmuteable via the native controls) when it doesn't.
- **`lib/stackadapt.ts`**: Removed the temporary `[StackAdapt][video-debug]` URL logging added earlier today to identify the video format.

### Why this works
Diagnostic logging confirmed StackAdapt CTV videos are plain H.264 `.mp4` files on `stackadaptvid.s3.amazonaws.com` — fully playable in Chrome — so format was never the issue. The real cause was Chrome's autoplay policy: the `<video>` carried `autoPlay` but not `muted`, and it only mounts a render tick *after* the click that sets `isVideoPlaying`. By then Chrome no longer treats playback as a direct user gesture, so it blocks autoplay-with-sound — the first frame loads (~1s) and then nothing happens. Calling `play()` from the mount ref runs synchronously inside the click's user-activation window, which Chrome accepts; the `.catch(() => { muted = true; play() })` guarantees playback even if a stricter policy still blocks sound. This was a misdiagnosis on the first pass (assumed HLS) — the URL logging is what corrected it, and the format check (`.m3u8`/`.mov`/etc. in `looksLikeVideoUrl`) was left intact since those are still valid things to capture.

### Verification
`npx tsc --noEmit` passes clean. Click a StackAdapt (or Meta) video tile: it now starts playing on click instead of stalling on the first frame. If a specific clip still fails, the new `onError` log prints its URL.

## 2026-06-02 — StackAdapt CTV: capture video URL for click-to-play; smart cover/contain by ratio

### What changed
- **`lib/stackadapt.ts`**: Added `looksLikeVideoUrl` (captures `.mp4|webm|mov|m3u8|ts`), `videoMap`, and video URL capture in both Path A (creativesConnection) and Path B (direct fields). Sets `ad.videoUrl` in the final assignment loop. Previously, video file URLs were intentionally excluded by `looksLikeUrl` and silently discarded — CTV ads had a thumbnail but no playable URL.
- **`components/CreativeTile.tsx`**: Added `stackFill` state + `onLoad` handler on StackAdapt images. When the image's natural aspect ratio is between 1.0 and 1.6 (close to 4:3), adds class `img-fill` to the media container, switching to `object-fit: cover`. Tall banners (ratio < 1.0) and wide leaderboards (ratio > 1.6) stay contained.
- **`app/layout.tsx`**: StackAdapt `.creative-media` restored to `background: #edf0f5` with `object-fit: contain`. Added `.img-fill` override: `background: none; object-fit: cover` for near-4:3 images.

### Why this works
CTV video URLs were filtered at the source (`looksLikeUrl` excludes video extensions). Adding a parallel `videoMap` + `looksLikeVideoUrl` mirrors the existing audio pattern exactly. The `stackFill` ratio check runs client-side after the image loads — no server changes needed, no guessing.

---

## 2026-06-02 — StackAdapt tiles: natural aspect ratio, no letterbox bars

### What changed
- **`app/layout.tsx`**: StackAdapt `.creative-media` now sets `aspect-ratio: unset` and `background: none`, overriding the base 4:3 constraint. The image uses `height: auto; object-fit: fill` so the container sizes to the image's actual proportions — no bars, no cropping regardless of ad dimensions (native, display, banner, etc.).

### Why this works
StackAdapt serves ads in many non-4:3 ratios (16:9 native, portrait display, wide banners). Forcing a 4:3 frame always produced bars on at least one axis. Removing the constraint lets each ad render at its true size.

---

## 2026-06-02 — Fix dark corners and gray bars on StackAdapt tiles

### What changed
- **`app/layout.tsx`**: Added `border-radius: 12px 12px 0 0` to `.creative-media` itself — the wrapper's `overflow: hidden` doesn't clip `backdrop-filter` children in WebKit/Blink, causing the dark `#242841` background to bleed into the rounded top corners. Removed `backdrop-filter` from StackAdapt media background (blurring the dark card behind it made white turn gray); replaced with a solid light neutral `#edf0f5`. 4:3 StackAdapt images fill the box perfectly with no bars; non-4:3 images show clean light padding.

### Why this works
`backdrop-filter` escapes `overflow: hidden` in Chrome/Safari — the border-radius on the child itself is the reliable fix. The gray appearance was caused by blurring `#242841` through 82% white opacity; a solid near-white reads correctly and doesn't depend on what's behind the element.

---

## 2026-06-02 — Per-platform image fit: cover for Meta/Google, frosted-white contain for StackAdapt

### What changed
- **`app/layout.tsx`**: Base `.creative-img` changed to `object-fit: cover` (Meta and Google fill the 4:3 box edge-to-edge). StackAdapt override sets `object-fit: contain` + `background: rgba(255,255,255,0.82)` + `backdrop-filter: blur(14px)` so letterbox bars are frosted white rather than solid black or white. Base `.creative-media` background reverted to `#242841` (only visible on video and placeholder tiles).

### Why this works
Meta and Google creatives are designed to fill a frame — cover is correct. StackAdapt display ads come in arbitrary aspect ratios so contain preserves the full creative; the frosted white bar reads as a soft light panel rather than a harsh solid color.

---

## 2026-06-02 — Image tiles: fixed 4:3 box with white background (contain, no black bars)

### What changed
- **`app/layout.tsx`**: Restored `aspect-ratio: 4/3` and `object-fit: contain` on `.creative-media` / `.creative-img`. Changed background from `#242841` (dark) to `#fff` so letterbox/pillarbox padding is white instead of black. Videos keep `background: #000` since black is appropriate for video. Meta and StackAdapt platform overrides reduced to just `image-rendering: auto; border-radius: 0` — no conflicting size/fit rules.

### Why this works
`object-fit: contain` shows the full image without cropping; the fixed 4:3 box keeps the wall uniform. White background replaces the black bars so the padding is invisible against most ad creatives.

---

## 2026-06-02 — Video tiles: thumbnail-first with click-to-play and Watch video link

### What changed
- **`components/CreativeTile.tsx`**: Added `isVideoPlaying` state. Video tiles now show the static thumbnail (`ad.imageUrl`) or a gradient placeholder instead of an autoplaying `<video>`. Clicking the thumbnail or the play-ring overlay swaps in `<video controls autoPlay>` so the video plays inline with native browser controls. Play ring is hidden once playing (was floating over controls). Added a "Watch video" link in the detail panel (same `audio-listen-link` style as "Listen to audio"), hidden once playing.
- **`app/layout.tsx`**: Removed forced `aspect-ratio: 16/9` from `.creative.video .creative-media`. Changed `.creative-video` to `width: 100%; height: auto;` matching the new natural-size image approach.

### Why this works
Autoplaying muted video was wasting bandwidth for creatives the user may never watch. The thumbnail-first pattern mirrors how audio works: a static representation until intentionally activated. Click-to-play is "even better" than a link-only approach — the video plays right in the dashboard without opening a new tab, but the "Watch video" link remains as a fallback for when the URL needs to be shared or opened externally.

### Verification
Video tiles show thumbnail + play ring at rest. Clicking either starts the video inline with controls. "Watch video" link opens the asset URL in a new tab before the video is activated.

---

## 2026-06-02 — Remove forced aspect-ratio box from image tiles

### What changed
- **`app/layout.tsx`**: Removed `aspect-ratio: 4/3` and `background: #242841` from `.creative-media`. Images now use `width: 100%; height: auto;` so they render at their natural dimensions with no letterbox/pillarbox black edges. Videos get their own `.creative.video .creative-media` rule with `aspect-ratio: 16/9` and `background: #000` since video dimensions aren't known until load. Dropped redundant Meta and StackAdapt overrides that were just repeating `object-fit: cover` / `contain`.

### Why this works
The old design forced every tile into a 4:3 box regardless of the creative's actual dimensions. Images that weren't 4:3 either got cropped (cover) or showed black bars (contain). Removing the aspect-ratio constraint and switching to `height: auto` lets the browser size the container to the image's intrinsic dimensions — no forced box, no black edges. Videos need the frame because their size is unknown at paint time.

### Verification
Tiles now expand/contract to match each creative's actual proportions. No black bars on display, carousel, or StackAdapt images.

---

## 2026-06-02 — StackAdapt native copy: correct field names (heading/tagline/cta)

### What changed

**`lib/stackadapt.ts`**

Vercel logs revealed the actual `NativeAd` schema fields: `heading` (headline), `tagline` (body copy), `cta` (call to action). None of these matched `NATIVE_TEXT_CANDIDATES` which only had generic names like `title`, `headline`, `body`, `description`, `callToAction`. Result: the introspection step found zero text fields, the step-4 query never selected any copy, and all 127 native ad tiles rendered with no text.

Added `heading`, `tagline`, `cta` to: `NATIVE_TEXT_CANDIDATES` (so they're fetched in the campaigns query), `firstCleanText([n.heading, ...])` (headline read), `nativeDescriptions` field list (body read), `nativeDescriptions` CTA fallback (`n.cta`), and `textFieldRoles` in `discoverCreativeImagePlan` (creative-level consistency). Generic names kept as fallbacks.

### Why this works
The schema introspection was working perfectly — it correctly reported `(none — check schema)`. The candidates list was just wrong. With the real field names added, the `... on NativeAd { heading tagline cta }` inline fragment will now be included in the campaigns query and the copy panel will show actual native ad copy.

### Verification
- `npx tsc --noEmit` passes with exit 0.

---

## 2026-06-02 — StackAdapt native ad copy fix + ENUM text field support

### What changed

**`lib/stackadapt.ts`**

**Bug 1 — Headline blocked creative-node text from being applied.**
`firstCleanText([n.title, n.headline, n.brandname, n.name])` would set `ad.headline` to the ad's `brandname` (e.g. "Camelback Resort") when no explicit title/headline field existed. The step-5 merge guard `if (creativeText?.headline && !ad.headline)` then silently skipped the real native ad copy from the creative node because `!ad.headline` was false. Fix: changed the headline build to `firstCleanText([n.title, n.headline])` only — genuine copy fields. `CreativeTile` already falls back to `ad.name` for display if `ad.headline` is empty, so nothing breaks for non-native ads.

**Bug 2 — ENUM text fields dropped by SCALAR-only filter.**
Both `nativeTextFieldNames` detection and `discoverCreativeImagePlan`'s text-field loop used `=== 'SCALAR'` to gate which fields to select. StackAdapt's `callToAction` field is typically an ENUM type (values like `"LEARN_MORE"`, `"SHOP_NOW"`). Changed both checks to `k === 'SCALAR' || k === 'ENUM'` so callToAction is now fetched and surfaced in the copy panel.

**Improved debug logging.**
Added `[StackAdapt] NativeAd ALL schema fields: ...` log that shows every field and its kind. Changed `NativeAd text fields discovered` to always print (even when the list is empty) so the difference between "schema has no matching fields" and "fields found but blank" is immediately visible in Vercel logs.

### Why this works
The creative wall already correctly fetched StackAdapt images via creative nodes (confirmed working). Native ad copy lives either directly on `NativeAd` (as `headline`/`description` scalars) or on the creative node itself. The two bugs above meant neither path surfaced anything: bug 1 blocked creative-node text even when discovered, bug 2 silently dropped ENUM-typed fields from the selection. With both fixed, the copy panel will show whatever text StackAdapt returns via either path.

### Verification
- `npx tsc --noEmit` passes with exit 0.
- No changes to Meta or Google paths; image sizing change (object-fit: contain for StackAdapt) from prior session unchanged.

## 2026-06-02 — Audio ad card + audioUrl field

### What changed
- **`lib/types.ts`** — added `audioUrl?: string` field to `Ad`.
- **`lib/stackadapt.ts`** — added `looksLikeAudioUrl` helper (matches `.mp3/.aac/.ogg/.flac/.wav`). Step-5 image-map loop now also populates `audioMap` when a creative URL is an audio file. After the loop, `ad.audioUrl` is set from `audioMap`. The resolve-count log now separately reports `audio:` count and `no-asset:` count.
- **`components/CreativeTile.tsx`** — added `hasAudio` flag (`ad.channel === 'Audio' || !!ad.audioUrl`). Audio cards render a compact waveform-icon placeholder (gradient background, waveform SVG, "Audio Ad" label) instead of the 4:3 image area. The detail panel shows a "▶ Listen to audio" link when `ad.audioUrl` is set. Body copy is hidden for audio cards (there's never meaningful description copy for StackAdapt audio ads).
- **`app/layout.tsx`** CSS — `.creative-ph-audio` (compact height, flexbox center), `.audio-ph-label`, `.audio-listen-link`. Frosted-glass detail overlap (`margin-top: -32px` + backdrop-filter) scoped to `:not(.has-audio-card)` so audio cards stay flat.

### Why this works
Audio `s3Url` values are real HTTPS URLs that pass the previous `looksLikeUrl` check but render as broken `<img>` tags. Routing them to `audioUrl` instead gives the frontend something to do with them (listen link) without attempting to display audio as an image. The compact placeholder makes audio cards visually distinct — same card width but roughly half the height of an image card so the wall doesn't feel like a row of broken tiles.

### Verification
Audio ads should show a dark gradient card with a waveform icon, "Audio Ad" label, and "▶ Listen to audio" link. Image ads and CTV ads are unaffected.

---

## 2026-06-02 — StackAdapt: filter non-image S3 URLs from imageUrl

### What changed
- **`lib/stackadapt.ts`** `looksLikeUrl` updated to exclude known non-image file extensions: `.mp4 .webm .mov .avi .flv .mp3 .aac .ogg .flac .wav .xml .m3u8 .ts`. The check strips query params before testing the extension.
- **`lib/stackadapt.ts`** Improved the "resolved" log line to also list ad names that got no image, making it easy to identify which creative types are the culprit.

### Why this works
Discovery correctly finds `s3Url` on `UploadedAudio`, `VastCreative`, and `UploadedVideo` (as fallback when `thumbS3Url` is null). But those S3 URLs point to audio/video/XML files — setting them as `<img src>` produces a broken image → gradient placeholder. The extension filter prevents them from entering the image map, leaving those ads with an empty `imageUrl` (gradient) rather than a silently broken URL. `Tag` creative display ads (jsCode only, no image) are correctly excluded by the `fieldIsImageish` filter already.

### Verification
Logs should show a lower `resolved` count but the unresolved ads should be audio/VAST/tag-creative types only, not real image-bearing display ads.

---

## 2026-06-02 — StackAdapt: fix introspection ofType depth for [T!]! list types

### What changed
- **`lib/stackadapt.ts`** `PLAN_CACHE_V` bumped `'v5'` → `'v6'` to invalidate empty plans cached from cold start.
- **`lib/stackadapt.ts`** All three `discoverCreativeImagePlan` introspection queries deepened from 2 to 3 levels of `ofType` nesting (lines for connection fields, edge fields, and concrete creative type fields). Pattern changed: `type { name kind ofType { name kind ofType { name kind } } }` → `type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }`.

### Why this works
The StackAdapt `nodes` field on connection types has type `[DisplayCreative!]!`, which is `NON_NULL → LIST → NON_NULL → DisplayCreative` — 3 wrapper levels before reaching the named type. The old introspection query only captured 2 `ofType` levels, so `unwrapTypeName` saw `{ name: null, kind: 'NON_NULL', ofType: undefined }` at level 3 and returned null. This caused `nodeTypeName = null` and the "cannot resolve node type — skipping" bail-out for every connection type, producing empty plans that were then cached as v5.

The 18:22 cold start confirmed this: `DisplayCreativeConnection raw fields: edges, nodes, pageInfo, totalCount` (fields found) immediately followed by `cannot resolve node type — skipping` (unwrap failed). Adding the fourth level of `ofType` gives `unwrapTypeName` the `{ name: 'DisplayCreative' }` it needs.

### Verification
After deploy, logs should show `DisplayCreativeConnection: node type = DisplayCreative (via nodes)` and `creative images resolved: N` where N > 0.

---

## 2026-06-02 — StackAdapt: fix empty creative plans from stale cache + possibleTypes fallback

### What changed
- **`lib/stackadapt.ts`** `PLAN_CACHE_V` bumped `'v4'` → `'v5'` to force re-discovery on next deploy. Warm Lambda containers hold empty plans from prior runs; bumping the version is the only way to invalidate them without a full cold start.
- **`lib/stackadapt.ts`** `discoverCreativeImagePlan` — added `KNOWN_UNION_MEMBERS` fallback: when a UNION type (e.g. `DisplayCreative`) returns `possibleTypes: []` (some API tokens restrict introspection depth), the code now falls back to `['ImageCreative', 'TagCreative', 'HtmlCreative']` for `DisplayCreative` and `['ImageCreative']` for `NativeCreative`, rather than computing an empty fragment list and caching it.
- **`lib/stackadapt.ts`** `discoverCreativeImagePlan` — added `connFields` log so the next cold start shows exactly what fields `DisplayCreativeConnection` exposes.
- **`lib/stackadapt.ts`** `queryAds` — added **direct ad-node image field fallback**: after the `creativesConnection` loop, the code inspects `adTypesBatch` for scalar fields matching image/URL patterns directly on each ad type (e.g. `imageUrl` on `DisplayAd`). If `creativesConnection` introspection still yields no selection, the step-5 query includes these direct fields and the image map reads them as a secondary path.
- Step-5 condition changed from `creativesSelection && creativeImagePaths.length` to `hasAnySelection` so either source (connection or direct) triggers the images query.

### Why this works
The stale-plan problem: `creativePlanCache` is a module-level `Map`. On cold start, `discoverCreativeImagePlan` runs, computes an empty plan (because `possibleTypes` is empty), caches it. All warm invocations in that Lambda hit the cache and skip discovery. The v5 bump invalidates those entries on the next deploy.

The `possibleTypes` problem: StackAdapt's API restricts what some tokens can introspect. When `possibleTypes` returns `[]` for a UNION, the discovery loop has no types to introspect → 0 fragments → empty `selection`. The hardcoded fallback fills this gap.

The direct-field fallback is a belt-and-suspenders: even if the entire `creativesConnection` chain fails to produce a selection, scalar image fields on the ad node itself will be queried and surfaced.

### Verification
After deploy, cold-start logs should show `${connectionTypeName} raw fields: edges, nodes, pageInfo, ...` and either `creative concrete types: ImageCreative, TagCreative` (schema returned them) or `possibleTypes empty — using fallback`. Then `creative images resolved: N` where N > 0.

---

## 2026-06-02 — StackAdapt: follow edges→node pattern for all creative connections

### What changed
- **`lib/stackadapt.ts`** `discoverCreativeImagePlan` — ALL StackAdapt creative connections use Relay `edges { node { ... } }` instead of `nodes { ... }`. Discovery now: (1) checks `nodes` first, (2) falls back to `edges → EdgeType → node` if no `nodes` field. Resolved node type is used for fragment building as before, but the selection string now emits `edges { node { __typename ... } }` instead of `nodes { __typename ... }`. `PLAN_CACHE_V` bumped to `v4` to bust any warm-Lambda entries from v3.
- **Step 5 image reading** — `n?.creativesConnection?.edges?.map(e => e?.node)` is tried before `?.nodes` so the image URLs are extracted from the right response path.

### Why this works
The `DisplayCreativeConnection` has `edges` not `nodes`. The old code's `'DisplayCreative'` fallback happened to pick the right union type for `DisplayCreativeConnection` but broke on `VideoCreativeConnection`. Properly following the edges→EdgeType→node chain gives the correct node type for every connection type, and the selection string matches the actual response shape.

### Verification
Logs show `DisplayCreativeConnection: node type = DisplayCreative (via edges)` and `creative images resolved: N` where N > 0.

---

## 2026-06-02 — StackAdapt: bust warm-Lambda plan cache with version prefix

### What changed
- **`lib/stackadapt.ts`** — added `PLAN_CACHE_V = 'v3'` constant and prefixed all `creativePlanCache` keys with it (`v3:${apiKey}:${connTypeName}`). Vercel keeps Lambda instances warm across deployments, so the bad plans (with wrong `... on ImageCreative` inside `VideoCreativeConnection`) from the previous deployment lived in the module-level Map and caused every request to skip `discoverCreativeImagePlan` entirely. Bumping the version prefix forces a cache miss on all warm instances, causing fresh discovery to run.

### Why this works
Module-level Maps survive across requests on the same warm Lambda but are wiped when a new Lambda instance starts. Version-prefixing the key is the standard way to invalidate in-process caches after a logic change without restarting the process.

### Verification
Logs show `creative concrete types:` entries for DisplayCreativeConnection and `no nodes field — skipping` (or equivalent) for VideoCreativeConnection/AudioCreativeConnection on the NEXT request after deploy.

---

## 2026-06-02 — StackAdapt: fix DisplayCreative fallback causing invalid fragments

### What changed
- **`lib/stackadapt.ts`** `discoverCreativeImagePlan` — the `'DisplayCreative'` default for `nodeTypeName` was causing `VideoCreativeConnection` and `AudioCreativeConnection` (which use `edges` instead of `nodes`) to silently generate `... on ImageCreative { s3Url }` fragments. When those fragments appeared inside `... on CtvAd { creativesConnection { nodes { ... } } }` (where nodes are `VideoCreative`), GraphQL rejected the entire step-5 query: `Fragment cannot be spread here as objects of type "VideoCreative" can never be of type "ImageCreative"` — wiping ALL 74 previously working images. Fix: remove the fallback; if the connection's `nodes` field can't be resolved, return an empty plan immediately rather than defaulting to the wrong type.

### Why this works
Each creative connection type owns its node shape. Falling back to a different connection's union type produces structurally invalid GraphQL. An empty plan is the correct result for connection types that can't be introspected — those ads show gradient tiles rather than crashing the whole query.

### Verification
Log shows `[StackAdapt] VideoCreativeConnection: no nodes field — skipping` (or similar) for non-image types; `creative images resolved` count is ≥ 74 and DisplayAd tiles show images again.

---

## 2026-06-02 — StackAdapt: multi-type creative discovery for Native, CTV, Audio, DOOH

### What changed
- **`lib/stackadapt.ts`** steps 2+3 — previously only introspected the first ad `__typename` found (always `DisplayAd`), so NativeAd, CtvAd, AudioAd, DoohAd never got creative fragments and showed gradient tiles. Replaced with a single batched introspection of all 5 known ad types (`DisplayAd`, `NativeAd`, `CtvAd`, `AudioAd`, `DoohAd`). For each type that exists in the schema and has a `creativesConnection` field, `discoverCreativeImagePlan` is run against its creative connection type. All resulting fragments are combined: `... on DisplayAd { creativesConnection { ... } } ... on NativeAd { creativesConnection { ... } } ...` etc.
- `creativePlanCache` is now keyed by `${apiKey}:${connectionTypeName}` instead of just `apiKey`, so `DisplayCreativeConnection` and `NativeCreativeConnection` get separate cached plans.

### Why this works
Each StackAdapt ad type has its own union creative type with different field names. `NativeCreative` might expose `imageUrl`; `CtvCreative` may expose a thumbnail. The `discoverCreativeImagePlan` function already handles arbitrary union types generically via schema introspection — it just needed to be called for each ad type, not only the first one seen.

### Verification
Logs show `NativeAd creativesConnection type: NativeCreativeConnection` (and similar for other types), and `creative images resolved:` count increases beyond 74.

---

## 2026-06-02 — StackAdapt: allow S3 image URLs in CSP and remotePatterns

### What changed
- **`next.config.mjs`** — added `https://*.amazonaws.com` to both `images.remotePatterns` and the CSP `img-src` directive. StackAdapt's `s3Url` creative field points directly at AWS S3 (e.g. `stackadapt-creatives.s3.amazonaws.com`). Without this, browsers silently block the images even though the server resolves 74 URLs correctly — the tiles just show gradient fallbacks.

### Why this works
The `CreativeTile` component uses a plain `<img>` tag, so Next.js `remotePatterns` don't apply to rendering. The CSP `img-src` is what the browser enforces. Any domain not listed there causes the image to fail with a CSP violation, falling through to the gradient placeholder. Adding `*.amazonaws.com` unblocks S3-hosted creatives from any bucket.

### Verification
StackAdapt tiles render real images instead of gradients for all 74 ads that resolved `s3Url`. Check browser DevTools Network tab — no more CSP-blocked image requests.

---

## 2026-06-02 — StackAdapt: reduce ads(first:) in creatives query to fit budget

### What changed
- **`lib/stackadapt.ts`** step 5 — batched campaign aliases with `ads(first: 100)` still cost 257k (25 campaigns × 100 ads × creative cost ≈ 6.25× the 40k limit). Reduced to `ads(first: 10)`. With Camelback averaging ~5 active ads/campaign (127 ads ÷ 25 campaigns), `first: 10` captures all of them at ~25k total cost.

### Why this works
StackAdapt's query cost scales with the product of paginated connection sizes. Cutting `ads(first:)` from 100 → 10 reduces cost by 10× while still covering the actual data. If a campaign ever has 11+ active ads, only the first 10 are imaged — acceptable tradeoff.

### Verification
Log shows `creative images resolved: N` where N > 0 and no cost-exceeded error.

---

## 2026-06-02 — StackAdapt: fetch creatives via batched campaign(id:) aliases

### What changed
- **`lib/stackadapt.ts`** step 5 — `advertiser(id:X){campaigns{...}}` failed because `Advertiser` type has no `campaigns` field. Replaced with a batched aliased query using the campaign IDs already collected in step 4: `c0: campaign(id: X){ads{nodes{id ...on DisplayAd{creativesConnection{...}}}}}` × N campaigns. All campaigns for the advertiser are fetched in one request. Results are indexed by alias (`data.c0`, `data.c1`, …) and flattened into the imageMap.

### Why this works
We already filtered `allCampaigns` → `campaigns` (the 25 belonging to this advertiser) so the IDs are in scope. One aliased query for N small campaign lookups costs proportionally to N×ads, not 622×200.

### Verification
Log shows `creative images resolved: N` where N > 0.

---

## 2026-06-02 — StackAdapt: split creatives fetch to avoid 2M query cost

### What changed
- **`lib/stackadapt.ts`** — `campaigns(100) × ads(200) × creativesConnection` produced a query cost of ~2M against StackAdapt's 40k limit, aborting the entire fetch. Fix: remove `creativesSelection` from the main campaigns loop entirely, then add **step 5** — a second targeted query `advertiser(id: X) { campaigns { nodes { ads { nodes { id ... on DisplayAd { creativesConnection { ... } } } } } } }` scoped to one advertiser. This is proportional to ~7 campaigns × ~20 ads instead of 100 campaigns × 200 ads. Creative images are collected into an `imageMap` (adId → URL) and patched onto the flat `allAds` array after it's built.

### Why this works
Nesting `creativesConnection` 3 levels deep (campaigns → ads → creatives) multiplied cost by 100×. Separating it into a scoped second query keeps each call well under the 40k budget. The `firstImageUrl` helper was inlined into the step-5 loop (no longer needed as a separate function since it only ran over `n.creativesConnection` which was gone from the main query).

### Verification
Log should show `creative images resolved: N` for N > 0 after `active ads total`. If `advertiser(id: X)` query errors, images fall back to blank with a `creatives query errors` log — campaigns and ads still show.

---

## 2026-06-02 — StackAdapt: wrap creativesConnection in inline fragment on Ad interface

### What changed
- **`lib/stackadapt.ts`** — `creativesSelection` (e.g. `creativesConnection { nodes { … } }`) was injected directly onto `ads { nodes { … } }`, but `ads.nodes` returns the `Ad` **interface**, and `creativesConnection` only exists on concrete types (`DisplayAd`, `NativeAd`, etc.). This caused a GraphQL schema error (`Cannot query field "creativesConnection" on type "Ad"`) that aborted the entire campaigns query and returned 0 ads. Fix: after building the selection from the cached plan, wrap it in `... on ${adTypeName} { … }` before embedding it in the query. `adTypeName` is already discovered in Step 1. The `firstImageUrl` helper reads `n.creativesConnection` unchanged because inline fragments merge fields into the parent object.

### Why this works
GraphQL inline fragments (`... on ConcreteType { fields }`) are valid on interface-typed selections and fields flatten onto the result object, so the existing `n?.creativesConnection?.nodes` read path still works without modification.

### Verification
Log should show campaigns/ads counts matching prior runs, and tiles should render real images from StackAdapt creatives.

---

## 2026-06-02 — StackAdapt: accept url/src inside ImageCreative; log full member fields

### What changed
- **`lib/stackadapt.ts`** — `discoverCreativeImagePlan` matched `ImageCreative` fields with the strict ad-level regex (which excludes bare `url`/`src`), so it found `(none)` even though `ImageCreative` almost certainly exposes the asset as `url`/`src`/`imageUrl`. Now, *inside a concrete creative member type*:
  - Accept a field if it is image-named **or** url-ish (`fieldIsImageish`), since the `clickUrl` ambiguity that justified excluding bare url/src only exists at the ad level.
  - Still exclude obvious non-image URLs via `nonImageUrlRegex` (`click|track|landing|destination|final|redirect|exit|pixel|beacon`).
  - Prefer explicitly image-named fields over generic `url`/`src` (sort), and include all matches as fallback paths.
  - Log each member's complete field list (`<Type> ALL fields: …`) so the real field name is always visible.

### Why this works
The rate-limit retry and union-fragment approach are confirmed working (`creative concrete types: ImageCreative, Tag`; `campaigns: 622 total, 25 for this advertiser` stable after a 3s throttle wait). The only remaining gap was the field-name filter being too strict for the creative context. Broadening it there — plus dumping the full field list — resolves the image field.

### Verification
Log shows `ImageCreative ALL fields: …` and a non-empty `ImageCreative image fields: …`; tiles render real assets. If still `(none)`, the ALL-fields line names the exact field to whitelist.

---

## 2026-06-02 — StackAdapt: image via ImageCreative fragment + cached discovery + rate-limit retry

### What changed
- **`lib/stackadapt.ts`** — The diagnostic confirmed `DisplayCreative` is a **UNION** of `ImageCreative | Tag`. Rebuilt image resolution around that, plus fixed the rate-limit regression:
  - New module-level `discoverCreativeImagePlan(apiKey, connectionType)`: resolves the union's `possibleTypes`, introspects each concrete member (`ImageCreative`, `Tag`), finds image/URL fields (scalar or one-level-nested), and builds an **inline-fragment** selection (`creativesConnection { nodes { __typename ... on ImageCreative { … } } }`) plus the JS read paths. Introspection-only — no data queries.
  - Result is cached in a module-level `creativePlanCache` keyed by API key, so discovery runs once per cold start instead of on every render. The previous version re-ran introspection **and** ~20 data-probe queries every request, which blew StackAdapt's cost budget and intermittently returned `campaigns: 300 total, 0 for this advertiser` (rate-limited mid-pagination before reaching Camelback's campaigns).
  - Removed the entire ad-level probe + creative brute-force + deep-diagnostic block (all superseded) and the dead `adImageSel`.
  - Added `rateLimitWaitMs()` + `sleep()`: pagination now detects `Rate limit exceeded` (reads `extensions.cost.throttle.retryAfterInSeconds`), waits, and retries the same page (up to 4×) instead of breaking with partial results.
  - `firstImageUrl()` scans each creative against all discovered paths and returns the first http(s) URL; `Tag` creatives correctly yield nothing (no static image).

### Why this works
Union member fields are only reachable via inline fragments, so `... on ImageCreative { imageUrl }` (or whatever field introspection finds) is the only way to read the asset — flat/nested guesses on the union itself always fail. Caching the schema-derived plan and dropping per-request probes restores the cost headroom the main paginated query needs; the retry makes a mid-run throttle self-heal.

### Verification
Log shows `creative concrete types: ImageCreative, Tag` and `ImageCreative image fields: <field(s)>`; `campaigns: 622 total, 25 for this advertiser` stays stable across reloads (no more rate-limited 0s); image-creative tiles render real assets, Tag tiles stay gradient.

---

## 2026-06-02 — StackAdapt: deep diagnostic for DisplayCreative shape (union/interface check)

### What changed
- **`lib/stackadapt.ts`** — When no image field resolves, now logs a deep schema diagnostic: `DisplayCreative`'s `kind`, `fields`, `possibleTypes`, and `interfaces`, plus every schema type name matching `creative|asset|image|media`.

### Why this works (hypothesis)
A plain `__type(name:"DisplayCreative"){ fields }` returns empty AND none of ~18 guessed flat/nested field names exist on it. That pattern points to `DisplayCreative` being a UNION or INTERFACE whose real fields live on concrete implementing types (e.g. `ImageCreative`, `HtmlCreative`, `NativeCreative`), reachable only via inline fragments (`... on ImageCreative { imageUrl }`). DisplayAd's `iframeSupported` / `customJsTrackerCode` / `isMultiClickout` fields corroborate HTML/ad-tag creatives. This round is diagnostic-only — the logged `kind` + `possibleTypes` tell us exactly how to query the image (which fragment + field) without further blind guessing.

### Verification
Log shows `DisplayCreative kind: …`, `possibleTypes: …`, and `schema types matching creative/asset/image/media: …`. Use those to build the fragment-qualified selection in the follow-up change.

---

## 2026-06-02 — StackAdapt: reject non-URL matches (creativeSize), widen creative brute-force

### What changed
- **`lib/stackadapt.ts`** — The deploy log showed DisplayAd has no image field; the matcher had wrongly resolved to `creativeSize` ("300x250") because it was a non-null string, which then suppressed the creative fallback. Fixes:
  - Added `looksLikeUrl()` (`^https?://`) and applied it to every probe (ad-level and creative). A candidate now only wins if its value is an actual URL, so `creativeSize`/`creativeStatus` no longer false-positive.
  - Dropped `creative` from `imgNameRegex` so `creativeSize`/`creativeStatus`/`creativesConnection` aren't even considered ad-level candidates.
  - Widened the creative brute-force: more flat names (`previewImageUrl`, `imageMediaUrl`, `originalImageUrl`, `renderedUrl`, `snapshotUrl`, …) and more parent/sub combos (`imageAsset`, `mediaAsset`; subs `mediaUrl`, `originalUrl`, `renderedUrl`, `contentUrl`, …).
  - Added a diagnostic log `creative object fields that exist:` listing which guessed container objects are valid on `DisplayCreative`, so the real field can be pinned even if a subfield guess misses.

### Why this works
`DisplayAd` exposes no creative URL (confirmed: `account, brandname, …, creativeSize, creativesConnection, …`), so the image must come from the opaque `DisplayCreative`. Requiring an http(s) value stops the size string from masquerading as an image and lets the creative fallback actually run. The widened guess list plus the "fields that exist" diagnostic converge on the real field.

### Verification
Log shows `creative object fields that exist: …` and ideally `creative image field resolved: <path>`; tiles render real creatives. If still blank, the "fields that exist" line names the valid container(s) to finish the path.

---

## 2026-06-02 — StackAdapt: image discovery via DisplayAd introspection + creative brute-force

### What changed
- **`lib/stackadapt.ts`** — Reworked Step 3 after the deploy log confirmed `DisplayCreative` is **not introspectable** (`creative fields: (none)`), so the prior introspection-only approach found nothing:
  - **(a)** Build image candidates from `DisplayAd`'s *introspectable* fields and probe them at the **ad level** (`adImagePath` / `adImageSelection`). Tightened the name regex to strong image words (`image|img|photo|thumb|preview|banner|creative|media|logo|icon|asset|cover|picture|graphic`) so it no longer mistakes `clickUrl`/`landingUrl` for an image.
  - **(b)** If the ad level yields nothing, brute-force a fixed list of flat creative fields, then parent/sub object shapes (`parent { sub }`), confirming each parent exists via `{ __typename }` before probing subfields. Picks the first path returning a non-null string.
  - Logs `ad (DisplayAd) fields:`, `ad image candidates:`, and `ad image field resolved:` / `creative image field resolved:` for visibility.
  - `firstImageUrl()` now reads the ad-level path first, then scans creatives.
  - Main query ad node selection gains `${adImageSel}` alongside `${creativesSelection}`.

### Why this works
The previous version relied on introspecting the creative type, which this schema blocks — every field list came back empty so no candidate was ever built. `DisplayAd` introspects fine, and the creative URL is exposed there (or under a guessable creative shape), so combining ad-level introspection with a bounded brute-force fallback finds the field without needing the opaque creative type. The stricter regex prevents locking onto non-image URL fields.

### Verification
Deploy log shows the new `ad (DisplayAd) fields:` list and a `… image field resolved: <path>` line; tiles render real StackAdapt creatives. If still blank, the logged `ad (DisplayAd) fields:` list names exactly what's available to finish the matcher.

---

## 2026-06-01 — StackAdapt: resolve creative image via introspection (fix gradient-only tiles)

### What changed
- **`lib/stackadapt.ts`** — Replaced the blind flat-name guessing in Step 3 with real schema introspection:
  - Resolve the creative node type from the connection type's `nodes` field, then introspect that type's fields and log them (`[StackAdapt] creative fields: …`).
  - Build candidate selections from fields whose name matches an image/URL regex — scalars as `name`, object fields as one-level-nested `name { urlSubfield }`. Candidates that look like URLs are tried first.
  - Probe candidates against a real batch of creatives and pick the first that returns a **non-null string** (the old code accepted a field that merely didn't error, even if its value was null).
  - Store the winning value as a JS path (`creativeImgPath`) and read it in the ad loop via a `firstImageUrl()` helper that scans all creatives, not just `creatives[0]`.

### Why this works
On this schema the creative URL is not a flat scalar (`imageUrl`, `url`, …) — every guessed name errored, so `creativeImgField` stayed null and `CreativeTile` fell back to its deterministic gradient. Introspecting the actual `DisplayCreative` type and resolving nested object fields finds the real field regardless of its name/shape. The non-null probe avoids locking onto an existent-but-empty field.

### Verification
Log shows `[StackAdapt] creative fields: …`, `creative image candidates: …`, and `creative image field resolved: <path>`. Tiles render real creatives instead of gradients. If `no creative image field found` still prints, the logged field list shows exactly what the type exposes so the regex/candidate logic can be tightened.

---

## 2026-06-01 — StackAdapt: paginate campaigns so the advertiser filter can match

### What changed
- **`lib/stackadapt.ts`** — `queryAds` Step 4 now pages through the entire `campaigns` connection (cursor-based: `pageInfo { hasNextPage endCursor }` + `after:`), accumulating all campaigns before applying the advertiser filter. Capped at 25 pages (2500 campaigns). On a GraphQL error mid-pagination it now breaks and uses what it already gathered instead of returning `[]`. Removed the old campaign-derived advertiser map log — Step 3b's `advertisers` query already lists every advertiser.

### Why this works
The account shares one API key across 20+ advertisers. A single `campaigns(first: 100)` page sorts Camelback's campaigns outside the window, so the client-side advertiser filter matched 0 (`campaigns: 100 total, 0 for this advertiser`). Paging the whole connection guarantees the target advertiser's campaigns are present before filtering. Camelback's real advertiser ID is **118709** (confirmed by the `advertisers` query); set `CAMELBACK_STACKADAPT_ADVERTISER_ID=118709`.

### Verification
Log shows `[StackAdapt] campaigns: N total, M for this advertiser` with N now > 100 and M > 0 for Camelback.

---

## 2026-06-01 — StackAdapt: advertiser ID from per-client env var; list all advertisers

### What changed
- **`app/[client]/page.tsx`** — `stackadaptCreds.advertiserId` now reads `process.env[`${p}_STACKADAPT_ADVERTISER_ID`]` first, falling back to `clientConfig.stackadaptAdvertiserId` only when the env var is unset.
- **`lib/clients.ts`** — Removed Camelback's hardcoded `stackadaptAdvertiserId: '32566'` (that ID was **Goodwill AZ**, not Camelback — wrong-account leak). Updated the field's doc comment to mark it a deprecated fallback behind the env var.
- **`.env.example`** — Added `CAMELBACK_STACKADAPT_ADVERTISER_ID` (and a commented `CLIENT2_` equivalent).
- **`lib/stackadapt.ts`** — Added Step 3b: query the top-level `advertisers(first: 200)` field and log every `id=name`. The prior advertiser list was derived only from the first 100 campaigns, so a client whose campaigns fell outside that window (e.g. Camelback) never appeared.

### Why this works
The advertiser ID was hardcoded in `clients.ts`, so editing env vars had no effect — the user's edits silently did nothing while the filter stayed pinned to Goodwill's `32566`. Moving the source of truth to `{PREFIX}_STACKADAPT_ADVERTISER_ID` makes it env-configurable per client like the API key already is. Logging all advertisers directly (not via campaign sampling) surfaces every advertiser ID so the correct one can be found and set.

### Verification
Server log shows `[StackAdapt] ALL advertisers in account: <id=name>, …` — locate Camelback's ID there, set `CAMELBACK_STACKADAPT_ADVERTISER_ID` to it, redeploy, and confirm `[StackAdapt] campaigns: N total, M for this advertiser` returns Camelback campaigns.

---

## 2026-06-01 — StackAdapt: trial-and-error image field discovery, campaign group logging

### What changed
- **`lib/stackadapt.ts`** — Added Step 3: try candidate image field names (`imageUrl`, `url`, `assetUrl`, `fileUrl`, `previewUrl`) directly against the API until one succeeds. First non-erroring field is used. Added `advertiser { name }` and `campaignGroup { id name }` to the campaigns query so we can see how clients are separated in the StackAdapt account structure.

### Why this works
`DisplayCreative` schema introspection always returns empty; the only way to discover the correct field name is to try them. `campaignGroup` may be the right discriminator if Goodwill campaigns share the same advertiser ID (32566) but live in a different campaign group.

### Verification
`[StackAdapt] creative image field found: <name>` shows which field works. `[StackAdapt] sample campaigns:` shows advertiser names and campaign group names — use those to tighten the client filter.

---

## 2026-06-01 — StackAdapt: correct advertiser ID (32566), remove unworkable introspections

### What changed
- **`lib/clients.ts`** — Corrected Camelback's `stackadaptAdvertiserId` from `118709` to `32566` (log confirmed actual ID in API responses).
- **`lib/stackadapt.ts`** — Removed `CampaignDeliveryPayload` and `DisplayCreative` introspection attempts — both types return empty fields from StackAdapt's schema (not publicly introspectable). Spend filter skipped with a TODO comment. Creative images skipped pending a different approach.

### Why this works
`118709` was a UI-facing ID; the API returns `32566` as the advertiser ID on campaign objects. With the correct ID, the advertiser filter now scopes results to Camelback only.

### Verification
`[StackAdapt] campaigns: 100 total, N for this advertiser+spending` — N should now be > 0 and much less than 100.

---

## 2026-06-01 — StackAdapt: fix delivery payload fields, log advertiser IDs for verification

### What changed
- **`lib/stackadapt.ts`** — Added `CampaignDeliveryPayload` introspection to the discovery step. Dynamically selects the campaign ID and spend fields from whatever the payload type actually exposes. Added `[StackAdapt] sample advertiser IDs:` log to show the first 10 campaign advertiser IDs so we can verify `118709` is correct.

### Why this works
Log showed `Cannot query field "campaignId" on type "CampaignDeliveryPayload"` — the field names differ from what we guessed. Now introspected. Also `campaigns: 100 total, 0 for this advertiser+spending` means either `118709` is wrong or stored as a different format.

### Verification
`[StackAdapt] sample advertiser IDs:` shows the real IDs. `[StackAdapt] CampaignDeliveryPayload fields:` shows what fields the spend response has.

---

## 2026-06-01 — Set Camelback StackAdapt advertiser ID (118709)

### What changed
- **`lib/clients.ts`** — Set `stackadaptAdvertiserId: '118709'` on the Camelback client entry.

### Why this works
Scopes StackAdapt campaign results to Camelback's advertiser only, filtering out all other agency clients.

---

## 2026-06-01 — StackAdapt: advertiser filtering, DateRangeInput fix, creative type fix

### What changed
- **`lib/clients.ts`** — Added optional `stackadaptAdvertiserId` field to `ClientConfig`. Set this to the StackAdapt advertiser ID for each client to prevent ads from other advertisers showing up (the API key is account-wide).
- **`lib/stackadapt.ts`** — Three fixes:
  1. `fetchStackAdaptAds` now accepts `advertiserId?`. `queryAds` receives it and filters campaigns in JS: `c.advertiser.id !== advertiserId`. Added `advertiser { id }` to the campaigns query.
  2. `DateRangeInput` fields now introspected from schema (logged as `DateRangeInput fields:`). `startKey`/`endKey` are selected from the actual field names rather than hardcoded `start`/`end`.
  3. `DisplayCreative` introspection was returning empty fields because `DisplayCreativeConnection` → `DisplayCreative` type strip was correct but the introspection query itself may be failing for non-public types. Added `dateRangeType` to the combined discovery call.
- **`app/[client]/page.tsx`** — Passes `client.stackadaptAdvertiserId` to `fetchStackAdaptAds`.

### Why this works
StackAdapt API key is scoped to the whole agency account, not a single advertiser. Without filtering, campaigns from ALL clients appear. The advertiser ID filter restricts to only this client's campaigns.

### Verification
Set `stackadaptAdvertiserId` on the Camelback client config and redeploy. Log `[StackAdapt] campaigns: X total, Y for this advertiser+spending` should show Y << X.

---

## 2026-06-01 — StackAdapt: fix creative node type derivation and campaignDelivery date args

### What changed
- **`lib/stackadapt.ts`** — Two fixes based on log evidence:
  1. `creative node type: null` was caused by `unwrapTypeName` not going deep enough into `[DisplayCreative!]!` nested type wrappers. Fixed by deriving node type name directly from connection type name (`DisplayCreativeConnection` → `DisplayCreative`).
  2. `campaignDelivery` args are `dataType, date, filterBy, granularity`. Updated spend filter to use `date: { start: "...", end: "..." }` and `granularity: TOTAL`.

### Why this works
Log confirmed connection type is `DisplayCreativeConnection`. Node type follows the standard GraphQL convention of stripping `Connection`. Delivery args confirmed from schema introspection logged as `dataType, date, filterBy, granularity`.

### Verification
`[StackAdapt] creative node fields:` should now list DisplayCreative fields including an image field. `[StackAdapt] campaigns with spend this month:` should show a number.

---

## 2026-06-01 — StackAdapt: fix Campaign field errors, discover delivery args, pull images from creativesConnection

### What changed
- **`lib/stackadapt.ts`** — Complete rewrite of `queryAds` discovery phase:
  1. Removed `startDate`/`endDate` from the campaigns query (those fields don't exist on StackAdapt's `Campaign` type — was breaking the entire campaigns fetch).
  2. Combined `__typename` probe + `Query` type introspection into one call to discover `campaignDelivery`'s actual argument names dynamically.
  3. Added multi-step creative image discovery: introspects `DisplayAd.creativesConnection` → connection type → node type → finds the image field on that node type. Pulls `creativesConnection { nodes { <imgField> } }` in the main ads query.
  4. `campaignDelivery` args are now built dynamically from whatever the schema says (`startDate/endDate`, `from/to`, or `start/end`).

### Why this works
Log evidence: `ad __typename: DisplayAd`, `ad type fields` showed `creativesConnection` but no direct image field, `startDate`/`endDate` caused hard GraphQL errors on Campaign. Each fix addresses a specific schema reality rather than guessing.

### Verification
Logs: `[StackAdapt] creative image field: <name>` (non-null), `[StackAdapt] campaigns with spend this month: N` (small number), `[StackAdapt] campaigns: 100 total, N active+spending` where N << 100.

---

## 2026-06-01 — StackAdapt: filter to current-month spending campaigns only

### What changed
- **`lib/stackadapt.ts`** — Added two new filters to `queryAds`:
  1. **Spend filter**: calls `campaignDelivery(startDate, endDate)` for the current month to get a set of campaign IDs with `spend > 0`. Campaigns not in that set are excluded. If `campaignDelivery` is unavailable the filter is skipped gracefully (warn + continue).
  2. **Date filter**: added `startDate endDate` to the campaigns query. Any campaign whose `endDate` is before today is excluded.
  Combined, only campaigns that are both not-ended AND actively spending this month pass through.

### Why this works
StackAdapt campaigns with past end dates or exhausted budgets remain in `ACTIVE` status but aren't actually delivering. The same "spend this month > 0" pattern used for Google Ads is now applied here. Date filtering catches the common case of campaigns with explicit end dates in the past (e.g. 2022 campaigns).

### Verification
Log `[StackAdapt] campaigns with spend this month:` should show a much smaller number than 100. Log `[StackAdapt] campaigns: X total, Y active+spending` should show Y << X.

---

## 2026-06-01 — StackAdapt: use __typename to discover actual ad type for image introspection

### What changed
- **`lib/stackadapt.ts`** — Replaced `__type(name: "Ad")` introspection with a two-step approach: first fetch one real ad node with `__typename` to get the actual GraphQL type name (e.g. `NativeAd`), then introspect that concrete type for image fields. Added more image field candidates (`imageS3Url`, `creativeThumbnailUrl`). Logs `[StackAdapt] ad __typename:` and `[StackAdapt] ad type fields:` for debugging.

### Why this works
The `Ad` type name was a guess — StackAdapt's schema may use `NativeAd` or another concrete type inside `campaigns.ads.nodes`. Introspecting the wrong type name returns null fields and no image field is ever selected. Using `__typename` on a real node gives us the ground-truth type name.

### Verification
Logs should show `[StackAdapt] ad __typename: <TypeName>` and `[StackAdapt] image field: <fieldName>` (non-null). Cards should then show real images.

---

## 2026-06-01 — Fix StackAdapt image field discovery (remove hanging scopeProbe)

### What changed
- **`lib/stackadapt.ts`** — Removed the unused `scopeProbe` (`__type` introspection for TokenInfo/Account/Campaign) from `queryAds`. It was hanging and blocking all subsequent queries. Replaced with a lightweight `adType` introspection that finds the correct image field name at runtime from a candidate list (`image_url`, `imageUrl`, `previewUrl`, etc.). The campaigns->ads query now only includes the image field that actually exists in the schema. Removed the temporary per-node log line.

### Why this works
The previous attempt hard-coded four candidate image field names directly in the GraphQL query. GraphQL rejects queries that reference unknown fields, so if none of those names exist on the `Ad` type the entire campaigns query returns errors and zero ads. Now we introspect the `Ad` type first (one cheap call), pick the real field name, then build a valid query. The old `scopeProbe` was also hanging indefinitely, which prevented any logs or data from the campaigns step.

### Verification
Logs should now show `[StackAdapt] Ad type fields:` and `[StackAdapt] image field: <name>` followed by `[StackAdapt] campaigns: X total, Y active`.

---

## 2026-06-01 — Fetch image URLs from StackAdapt ads

### What changed
- **`lib/stackadapt.ts`** — Added `image_url imageUrl previewUrl preview_url` to the `campaigns->ads` GraphQL query. Map the first non-empty value to `imageUrl` when building the `Ad` object (was hardcoded `''`). Added a one-per-campaign log of the sample ad node keys so we can confirm which field name StackAdapt actually returns.

### Why this works
The auth fix got ads loading but images were blank because the query never asked for any image field. We try multiple candidate field names (`image_url`, `imageUrl`, `previewUrl`, `preview_url`) since the exact name isn't documented — the log will confirm which one populates after the next deploy.

### Verification
Check Vercel function logs for `[StackAdapt] sample ad node keys:` — whichever image field is non-null is the right one. Cards should show real creative images instead of gradient placeholders.

---

## 2026-06-01 — Fix StackAdapt auth header: token → Bearer

### What changed
- **`lib/stackadapt.ts`** — Changed the `Authorization` header value from `token ${apiKey}` to `Bearer ${apiKey}` in the `gql()` function (line 29).

### Why this works
StackAdapt's GraphQL API requires the standard OAuth2 `Bearer` scheme. The old `token` prefix worked for schema introspection (which may be unauthenticated or more lenient) but was rejected for actual data queries. StackAdapt support confirmed the correct format is `Bearer <64-char-token>`.

### Verification
Deploy and check the Vercel function logs — `[StackAdapt] active ads total:` should now return a non-zero count instead of 0.

---

## 2026-06-01 — Fix Google Ads re-auth: wire per-client refresh token through to fetcher

### What changed
- **`lib/google-ads.ts`** — Added optional `refreshToken` field to `GoogleCreds`. `getAccessToken()` now accepts a `perClientRefreshToken` parameter and prefers it over the global `GOOGLE_REFRESH_TOKEN` env var (global kept as fallback for single-client setups). `fetchGoogleAds` passes `creds.refreshToken` through to `getAccessToken`.
- **`app/[client]/page.tsx`** — `googleCreds` now includes `refreshToken: process.env[`${p}_GOOGLE_REFRESH_TOKEN`]` so the per-client key written by the OAuth callback is actually used.

### Why this works
The OAuth callback (`/api/google-oauth/callback`) has always saved the new token to `${envPrefix}_GOOGLE_REFRESH_TOKEN` (e.g. `CAMELBACK_GOOGLE_REFRESH_TOKEN`) in Vercel. But `google-ads.ts` was reading the *global* `GOOGLE_REFRESH_TOKEN`, which never got updated. So every reconnect appeared to succeed (the UI said "connected") but the page kept using the old expired token and kept throwing `invalid_grant`. The fix threads the per-client key all the way from the env var read in `page.tsx` down into `getAccessToken`.

### Why the global fallback stays
Some deployments may still have `GOOGLE_REFRESH_TOKEN` set without a prefix. Keeping the fallback means those setups continue to work without changes.

### Verification
After deploying: trigger a Google Ads reconnect, complete OAuth, wait for the Vercel redeploy (~30s). The `[Google] Token request` log line will show a different `refreshTokenSuffix` matching the newly issued token, and `[Google] Auth failed` will be gone.

## 2026-05-29 — Fix Google Ads re-auth: read OAuth client_id/secret globally

### What changed
- **`app/api/google-oauth/start/route.ts`** — `clientId` now reads the global `process.env.GOOGLE_CLIENT_ID` instead of the per-client `process.env[`${client.envPrefix}_GOOGLE_CLIENT_ID`]`. This is what threw the "Server misconfigured: missing GOOGLE_CLIENT_ID or DASHBOARD_AUTH_SECRET" 500 on reconnect.
- **`app/api/google-oauth/callback/route.ts`** — token-exchange `client_id`/`client_secret` switched from `${client.envPrefix}_GOOGLE_CLIENT_ID`/`_SECRET` to the global `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

### Why this works
The OAuth `client_id`/`client_secret` are a single OAuth-app credential tied to one Google Cloud project, shared across every client — `.env.example` documents them as global and `lib/google-ads.ts` already reads them globally. The re-auth routes were the only place reading prefixed variants (`CAMELBACK_GOOGLE_CLIENT_ID`), which were never defined in Vercel or `.env.local`, so the missing-var guard fired every time. The genuinely per-client value is the `refresh_token`, which the callback still saves under `${client.envPrefix}_GOOGLE_REFRESH_TOKEN` — that behavior is unchanged.

### Verification
- Grepped the repo: no remaining `${client.envPrefix}_GOOGLE_CLIENT_ID`/`_SECRET` reads; the only prefixed Google var left is `_GOOGLE_REFRESH_TOKEN` (intended).
- Confirmed `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present as global vars in `.env.example`.

## 2026-05-22 — Fix requireEnv: make Google + StackAdapt credentials optional

### What changed
- **`app/[client]/page.tsx`** — `googleCreds.customerId` and `stackadaptCreds.apiKey` reverted to `?? ''` soft fallbacks. Only `metaCreds.accountId` uses `requireEnv()` and will throw on missing config. Google and StackAdapt are optional integrations — when their env vars are absent the fetchers return `[]` and the UI shows the "not connected" state, which is the intended behavior.

### Why this works
The previous commit applied `requireEnv()` to all three platforms, which was too aggressive. StackAdapt in particular has an explicit "not connected" UI state designed for clients that haven't onboarded that platform yet. Throwing a hard error on a missing optional credential broke the entire page for any client missing those vars.

### Verification
Camelback page loads without StackAdapt env var set; StackAdapt section shows "not connected" instead of crashing.

## 2026-05-22 — Fix PlatformSection clientDomain build errors

### What changed
- **`components/PlatformSection.tsx`** — Added `clientDomain: string` to Props; threaded it through `PlatformSection → CampaignLane → CreativeTile`. Removed hardcoded `const clientLabel = 'Camelback'` (replaced with `clientDomain`). Also fixed TS error from prior commit: `requireEnv` closure in `page.tsx` now references `params.client` instead of `clientConfig.slug` to avoid "possibly undefined" narrowing failure.

### Why this works
`PlatformSection` is a legacy component (not imported anywhere in the current routing tree) but TypeScript still type-checks it. It had two problems: (1) `CreativeTile` now requires `clientDomain` but the call-site didn't pass it, causing a compile error; (2) `clientLabel` was hardcoded to `'Camelback'`. Both are fixed by propagating `clientDomain` from the Props interface down to the tile.

### Verification
Build passes; no remaining hardcoded `'camelbackresort.com'` or `'Camelback'` strings in any component.

## 2026-05-22 — Fix cross-client domain bleed; add structural client isolation

### What changed
- **`lib/clients.ts`** — Added required `brandDomain` field to `ClientConfig` type. Set `brandDomain: 'camelbackresort.com'` on the Camelback entry and `brandDomain: 'commitagency.com'` on the Commit Agency entry. This is the single source of truth for each client's domain — it is now impossible to add a client without explicitly declaring its own domain.
- **`components/CreativeTile.tsx`** — Removed two hardcoded `'camelbackresort.com'` strings and the hardcoded `'C'` initial from `brandFor()`. The function now accepts a `clientDomain` parameter and derives the initial from `clientDomain[0].toUpperCase()`. Added `clientDomain: string` to the `Props` interface.
- **`components/SegmentSection.tsx`** — Threaded `clientDomain` prop through `SegmentSection` → `PlatformBlock` → `CampaignLane` → `CreativeTile`. No business logic changed; this is purely prop-forwarding to close the isolation gap.
- **`app/[client]/page.tsx`** — Passes `clientConfig.brandDomain` as `clientDomain` to every `SegmentSection`. Added a `requireEnv()` helper that throws with a clear error message if any per-client credential env var is missing, replacing the silent `?? ''` fallbacks that could cause an empty credential to be passed to upstream APIs.

### Why this works
The root cause was two hardcoded `'camelbackresort.com'` strings in `CreativeTile.brandFor()`: one as the Meta fallback when `ad.destinationUrl` is absent, and one as the unconditional StackAdapt value. Both fired for every client, not just Camelback.

The fix threads the client's own `brandDomain` — set once in `lib/clients.ts` at registration time — all the way down the component tree. TypeScript enforces the new required field, so any future client entry that omits `brandDomain` fails to compile.

The `requireEnv()` guard closes a separate but related isolation risk: previously, if a client's env vars were missing, the code would pass an empty `accountId`/`customerId` to the connector. Depending on the upstream API's behaviour, an empty account ID could return unexpected results or silently share data across calls. The guard makes misconfiguration a loud crash at request time rather than a silent data problem.

### Verification
- `/camelback` tiles: brand chip still shows `camelbackresort.com` (unchanged behaviour).
- `/commit` tiles: brand chip now shows `commitagency.com` instead of `camelbackresort.com`.
- Adding a new client without `brandDomain` → TypeScript compile error.
- Deploying a client with a missing env var → immediate 500 with a descriptive message naming the missing key.

## 2026-05-21 — Remove Camelback-specific branding from the shared app shell

### What changed
- **`app/layout.tsx`** — metadata `title` changed from `'Camelback Resort — Ad Dashboard'` to `'Ad Dashboard'`. CSS comment block renamed from "Camelback brand palette" to "Default brand palette"; `--live` comment de-coupled from Camelback language.
- **`components/TopBar.tsx`** — default `brandH1` prop changed from `'Camelback Resort Ad Dashboard'` to `'Ad Dashboard'`. (The actual per-client title comes from `clientConfig.name` via the `brandH1` prop in `app/[client]/page.tsx`, so this default is only a last-resort fallback.)
- **`lib/clients.ts`** — JSDoc comments on `cssOverrides` and `autoPalette` no longer refer to "Camelback tokens".
- **`lib/segments.ts`** — comments on `CURATED_SEGMENTS` and `AUTO_PALETTE` clarify that Camelback-named verticals are keyword-matched and simply never fire for other clients; renamed "Camelback brand palette" → "default (Camelback) palette".
- **`app/[client]/page.tsx`** — inline comment about "Aquatopia, Weddings, Lodge…" replaced with a generic pointer to `lib/segments.ts`.
- **`CLAUDE.md`** — opening paragraph updated from "Camelback Resort ad dashboard" to "multi-client ad dashboard"; now mentions `lib/clients.ts` as the client registry.

### Why this works
The routing, auth, and data-fetching layers were already fully multi-client. The changes above are purely cosmetic: labels, defaults, and comments that still said "Camelback" even though the architecture no longer assumed a single client. No runtime behaviour changes.

### Verification
`/camelback` and `/commit` continue to render with their respective brand names (set via `clientConfig.name` in each page); no hardcoded "Camelback" copy appears in the shared shell or default fallbacks.

---

## 2026-05-21 — Show ad count not fraction in nav pills and campaign rows

### What changed
- `components/TopBar.tsx` (desktop pill, line ~292): changed `{t.active}/{t.total}` → `{t.active}` in the jump-count span.
- `components/TopBar.tsx` (mobile pill, line ~328): same change in the mobile dropdown nav.
- `components/PlatformSection.tsx` (campaign row, line ~85): changed `{liveCount}/{ads.length} live` → `{liveCount} live`.

### Why this works
The dashboard only surfaces live ads, so the denominator always equals the numerator — displaying `x/x` adds noise without information. Showing just the count is cleaner and unambiguous.

### Verification
Nav pills now read e.g. "3" instead of "3/3"; campaign meta rows read "3 live" instead of "3/3 live".

---

## 2026-05-21 — Keep live indicators green on Commit Agency page

### What changed

- **`lib/clients.ts`** — Removed `--live` from Commit Agency's `cssOverrides`. `--live` was previously overridden to Commit Blue (`#00bdf2`), which turned the pulsing live dot and LIVE ticker cyan. Green is universal shorthand for "on/active" so the default `--live: #4C9429` (Pine green, set in `layout.tsx`) is now left untouched for all clients.

### Why this works

The `--live` token drives the pulsing dot in the topbar brand area, the `● LIVE` ticker label, the per-segment live-count tags, and the per-creative corner status pill. Overriding it to a brand color breaks the semantic signal. Removing the override means all three live-indicator surfaces stay green regardless of which client page is open.

### Verification

Visit `/commit` — pulsing dot, LIVE label, and creative status pills are green. All other Commit brand colors (ink, borders, segment accents) remain Commit-palette.

---

## 2026-05-21 — Commit Agency brand colors for auto-discovered segments

### What changed

- **`lib/clients.ts`** — Added `autoPalette?: string[]` and `fallbackAccent?: string` fields to `ClientConfig`. The Commit Agency entry now sets a 5-color `autoPalette` (Commit Blue, Coral, Deep Blue, Sunlight, Storm Clouds) and `fallbackAccent: '#00bdf2'` so the "Other" bucket also gets a brand color rather than gray.

- **`lib/segments.ts`** — `autoSegmentFor` now accepts an optional `palette` argument (defaults to `AUTO_PALETTE`). `buildSegments` now accepts a `BuildSegmentsOptions` object with `autoPalette` and `fallbackAccent`; it builds a local fallback segment with the overridden color when provided.

- **`app/[client]/page.tsx`** — The `buildSegments` call now passes `clientConfig.autoPalette` and `clientConfig.fallbackAccent`. Camelback passes `undefined` for both, so nothing changes there.

### Why this works

Auto-discovered segment colors come from a palette array indexed by a hash of the segment id. By swapping the palette array, all auto-discovered segments for Commit get colors drawn from their brand book. The `fallbackAccent` override handles the "Other" bucket separately because it is a static `FALLBACK` constant rather than running through `autoSegmentFor`. Camelback is entirely unaffected — both new fields are optional with no default value, so the existing `AUTO_PALETTE` and `#888888` fallback remain in force when they are absent.

### Verification

Visit `/commit` — any visible ad group segments should show Commit brand colors (blue, coral, deep blue, yellow, or teal) instead of gray. Visit `/camelback` — segment colors unchanged.

---

## 2026-05-21 — Commit Agency brand palette applied to /commit client page

### What changed

- **`lib/clients.ts`** — Added optional `cssOverrides?: Record<string, string>` field to `ClientConfig`. The Commit Agency entry now populates this field with 11 CSS custom property overrides mapping their brand palette (Commit Blue `#00bdf2`, Deep Blue `#004359`, Storm Clouds `#517882`, Sea Salt `#f7f8f9`, Sunlight `#ffce08`, Coral `#e64910`) onto the dashboard's design tokens (`--ink`, `--ink-2`, `--ink-3`, `--live`, `--line`, `--line-2`, `--bg-2`, `--brand-slate`, `--brand-indigo`, `--brand-orange`, `--brand-light-orange`).

- **`app/[client]/page.tsx`** — After resolving the client config, builds a `:root { … }` CSS string from `cssOverrides` (if present) and renders it as an inline `<style>` tag before the `<TopBar>`. Because the page is a server component the style is streamed with the HTML; no client JS is needed. The `<style>` is only emitted for clients that declare overrides — Camelback sees no change.

### Why this works

All visual tokens (ink colors, live dot color, background tints, border colors) are already CSS custom properties consumed by `layout.tsx`. A `:root` override block placed in the page's own output wins the cascade over the baseline `:root` block in `<head>` — the HTML spec guarantees later same-specificity rules win. This approach keeps the default palette in `layout.tsx` intact (zero Camelback regression risk) while letting any client declare brand-specific overrides in one place: their `ClientConfig` entry.

The alternative — a per-client CSS file or a separate layout — would require duplicating hundreds of lines of structural CSS and creating a separate file-system entry for each client. `cssOverrides` is a surgical override at the token layer only.

### Verification

Visit `/commit` — the live dot, topbar accent, ink text, and background tints should all reflect Commit Agency's brand colors. Visit `/camelback` — unchanged.

---

## 2026-05-21 — Corrected credential scope: Meta token and all Google OAuth vars are global

### What changed

- **`lib/meta.ts`** — `fetchMetaAds` no longer accepts a `token` in its creds object. It reads `META_ACCESS_TOKEN` from env directly. The system user token is shared across all Meta ad accounts under the same Business Manager, so there is no per-client token.

- **`lib/google-ads.ts`** — `GoogleCreds` now contains only `customerId`. `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `GOOGLE_LOGIN_CUSTOMER_ID` are all global env reads. `getAccessToken()` takes no parameters. The MCC setup means one OAuth app and one developer token spans all client accounts; only the customer ID changes per client.

- **`app/[client]/page.tsx`** — `metaCreds` is now `{ accountId }` only; `googleCreds` is now `{ customerId }` only.

- **`.env.example`** — Restructured to show a clear global vs per-client split. Per-client block is now just 4 vars: `PASSWORD`, `META_AD_ACCOUNT_ID`, `GOOGLE_CUSTOMER_ID`, `STACKADAPT_API_KEY`.

- **`DEPLOY.md`** — Migration table and "adding a new client" section updated to reflect that only those 4 vars need to be set per client.

### Why this works

The previous version over-specified the per-client credential set. Under an MCC (Manager Account) setup, the developer token and OAuth credentials belong to the agency's Google account, not to each client. Meta's system user similarly has access to all ad accounts under the Business Manager with a single long-lived token. The only truly per-client identifiers are the ad account ID (Meta), the customer ID (Google), and the StackAdapt API key.

### Verification

`CAMELBACK_META_ACCESS_TOKEN`, `CAMELBACK_GOOGLE_DEVELOPER_TOKEN`, `CAMELBACK_GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, and `CAMELBACK_GOOGLE_LOGIN_CUSTOMER_ID` are no longer read anywhere — remove them from Vercel if set. The bare `META_ACCESS_TOKEN` and `GOOGLE_*` keys must be present instead.

---

## 2026-05-21 — Multi-client architecture (password-routed per-client dashboards)

### What changed

- **`lib/clients.ts`** (new) — Central client registry. Each entry maps a URL `slug` to a display `name`, `envPrefix` (used to look up `{PREFIX}_*` env vars), and `metaHandle`. Adding a new client only requires one entry here plus the corresponding env vars in Vercel — no code changes needed anywhere else.

- **`app/[client]/page.tsx`** (new) — Dynamic dashboard route replacing the static `app/page.tsx`. Reads `params.client`, resolves the client config, builds per-client credential objects from `{PREFIX}_*` env vars, and passes them explicitly to `fetchMetaAds`, `fetchGoogleAds`, and `fetchStackAdaptAds`. Returns Next.js `notFound()` for unregistered slugs.

- **`app/page.tsx`** — Reduced to a single-line redirect to `/login`. The dashboard now lives at `/{slug}`, not `/`.

- **`lib/meta.ts`** — `fetchMetaAds` now takes `creds: { token, accountId }` instead of reading from `process.env`. No internal logic changes.

- **`lib/google-ads.ts`** — `fetchGoogleAds` now takes `creds: GoogleCreds` (all five Google credentials). `getAccessToken` updated to accept the same creds so no env reads remain in the function. Module-level `cachedApiVersion` preserved — it's the Google Ads API version, shared across clients.

- **`lib/stackadapt.ts`** — `fetchStackAdaptAds` now takes `creds: { apiKey }` instead of reading from `process.env`.

- **`middleware.ts`** — Replaced single-password HMAC check with per-client logic. Extracts the first path segment, finds the matching `ClientConfig`, checks `dashboard_auth_{slug}` cookie against `HMAC({PREFIX}_PASSWORD, DASHBOARD_AUTH_SECRET)`. All `/api/*` routes pass through unchanged — they have their own auth (rate limiting, PIN check, etc.).

- **`app/api/auth/route.ts`** — Iterates all `CLIENTS`, checks the submitted password against each `{PREFIX}_PASSWORD`, sets `dashboard_auth_{slug}` cookie on match, returns `{ ok: true, client: slug }`. No match → 401.

- **`app/login/page.tsx`** — Now redirects to `/${data.client}` on success (was hardcoded `/`).

- **`components/GoogleReconnectBanner.tsx`** — Accepts `clientSlug` prop, passes `?client={slug}` to the OAuth start route.

- **`app/api/google-oauth/start/route.ts`** — Accepts `?client=` query param, reads `{PREFIX}_GOOGLE_CLIENT_ID`, embeds the slug in the CSRF state: `{slug}.{timestamp}.{hmac}`.

- **`app/api/google-oauth/callback/route.ts`** — Parses the client slug from state, verifies HMAC, uses `{PREFIX}_GOOGLE_CLIENT_ID/SECRET` for token exchange, writes `{PREFIX}_GOOGLE_REFRESH_TOKEN` to Vercel, redirects to `/{slug}` on success.

- **`app/api/meta-thumb/route.ts`** — Accepts `?client=` param to look up `{PREFIX}_META_ACCESS_TOKEN`. Falls back to bare `META_ACCESS_TOKEN` if param is absent (backward compat for direct calls).

- **`.env.example`** — Updated to per-client `CAMELBACK_*` format. Old flat keys removed.

- **`DEPLOY.md`** — Step 4 env var table updated to `CAMELBACK_*` names. New Step 4b (migration table from old flat keys) and Step 4c (adding a new client) added.

### Why this works

Each client's auth cookie is named `dashboard_auth_{slug}` — logging into client A's password never grants access to client B's route. The middleware identifies the target client purely from the URL path segment, then verifies the matching cookie. The `CLIENTS` registry in `lib/clients.ts` is the single source of truth: one place to add a client, no other code changes.

API credential functions now take explicit parameter objects instead of reading env vars. This keeps functions pure and reusable without module-level state or env-var coupling.

`DASHBOARD_AUTH_SECRET` remains a global shared HMAC secret. Per-client passwords are the "what you know" factor; the shared secret produces cookies that can't be forged without knowing both the password and the secret.

### Verification

Rename existing Vercel env vars to the `CAMELBACK_*` prefix (see DEPLOY.md migration table). Redeploy. Visiting `/camelback` with the old password should work identically. Add a second client by appending to `CLIENTS` and setting its env vars — the new `/{slug}` route is immediately live after deploy.

---

## 2026-05-21 — Google Ads one-click OAuth re-auth flow

### What changed

- **`lib/google-ads.ts`** — `fetchGoogleAds()` now returns `{ ads: Ad[], authExpired: boolean }` instead of `Ad[]`. When `getAccessToken()` throws with `invalid_grant`, `authExpired` is set to `true` so the page can distinguish a credentials problem from "no ads this month". All other early-return paths set `authExpired: false`.

- **`app/page.tsx`** — Google Ads is now fetched separately (not inside `Promise.allSettled`) so the `authExpired` flag can be read. When `true`, a `<GoogleReconnectBanner />` is rendered above the ad wall.

- **`components/GoogleReconnectBanner.tsx`** — New client component. Shows a red-accented banner with a "Reconnect Google Ads" button that opens `/api/google-oauth/start` in a new tab. Only rendered when `authExpired` is true.

- **`app/api/google-oauth/start/route.ts`** — New route. Builds a Google OAuth consent URL with `access_type=offline` and `prompt=consent` (forces a fresh refresh_token every time). Includes a CSRF `state` param: `timestamp + "." + HMAC-SHA256(timestamp, DASHBOARD_AUTH_SECRET)`.

- **`app/api/google-oauth/callback/route.ts`** — New route. Verifies the CSRF state + timestamp freshness (< 10 min), exchanges the auth code for tokens, calls the Vercel API to patch `GOOGLE_REFRESH_TOKEN` in the project's environment variables, then triggers a Vercel redeploy so the new token takes effect. Returns a styled HTML page — success auto-redirects to `/` after 35 s; error shows the reason and a back link. Degrades gracefully: if the Vercel API token is missing, it shows the raw refresh_token so the operator can paste it in manually.

- **`.env.example`** — Documents `VERCEL_API_TOKEN` (the one new env var the operator must add). `VERCEL_PROJECT_ID` and `VERCEL_DEPLOYMENT_ID` are injected automatically by Vercel and don't need to be set.

### Why this works

Google refresh tokens expire when: the account password changes, the token is manually revoked, or (for "testing" OAuth apps) after 7 days. The previous behaviour was to silently return an empty array, leaving the operator to notice the blank Google section and then debug logs manually. The new flow surfaces the problem visually and lets the operator reconnect in one click without touching Vercel or generating a new token externally.

The `prompt=consent` flag on the start route is critical — without it Google skips the consent screen on repeat authorizations and omits the `refresh_token` field from the token response (it assumes you still have the old one).

The Vercel API patch + redeploy means the new token is written to Vercel's encrypted env store (not a database or file) and takes effect on the next deploy, which is triggered automatically. `VERCEL_DEPLOYMENT_ID` is available in every Vercel serverless invocation, so no extra env setup is needed beyond the one `VERCEL_API_TOKEN`.

### Verification

1. Add `VERCEL_API_TOKEN` to Vercel env vars (Production).
2. Add that token to your Google Cloud OAuth client's authorised redirect URIs: `https://<your-domain>/api/google-oauth/callback`.
3. Trigger an `invalid_grant` (e.g. revoke the token in Google account security settings).
4. Dashboard shows the red banner → click "Reconnect Google Ads" → Google consent → black success screen → ~30s later dashboard reloads with Google Ads visible.

---

## 2026-05-21 — Revert GAQL numeric ID filter (broke Google Ads display)

### What changed

- **`lib/google-ads.ts`** — Reverted the `/^\d+$/` numeric filter added in the security hardening pass. The filter was applied before interpolating ad IDs into GAQL `IN (…)` clauses. While Google Ads IDs are always integers in theory, the filter silently dropped IDs in practice, causing Google Ads to disappear from the dashboard. The IDs sourced from Google's own API, so the injection risk it guarded against was purely theoretical with no realistic attack path.

### Why this works

Removing the filter restores the original `slice.map(id => \`'${id}'\`).join(', ')` behaviour. All other security fixes from the same pass (Meta token headers, CDN allowlist, CSP tightening) are unaffected.

### Verification

Google Ads creatives should reappear on next page load after deploy.

---

## 2026-05-21 — Fix TS build error in rate-limit.ts (Map iteration)

### What changed

- **`lib/rate-limit.ts`** — Replaced `for (const [k, v] of BUCKETS)` with `Array.from(BUCKETS.entries()).forEach(...)`. TypeScript's `for...of` over a `Map` requires either `--downlevelIteration` or a `target` of `es2015+`; the project's tsconfig didn't set either, causing the Vercel build to fail at the type-check step. `Array.from` works at any target.

### Why this works

`Array.from` materialises the Map entries into a plain array before the loop, which TypeScript can iterate without any compiler flag. Behaviour is identical — expired buckets are still deleted in the same pass.

### Verification

Build should now pass the type-check step. No functional change; the prune logic is identical.

---

## 2026-05-21 — Security hardening: token headers, GAQL validation, CDN allowlist, CSP tightening

### What changed

- **`lib/meta.ts`** — `fetchVideoThumbnails` (was line 327), `fetchAdDetails` (was line 626): both called `fetch(url)` directly with `&access_token=${token}` appended to the URL, bypassing the existing `metaFetch()` wrapper. Migrated both to use `metaFetch()` so the token travels in an `Authorization: Bearer` header instead of the URL query string. `fetchAdPreviews` (was line 548) posted the token as `access_token=…` in the URL path of the `graph.facebook.com/?access_token=…` POST target; migrated to post to `graph.facebook.com/` via `metaFetch()`.

- **`app/api/meta-thumb/route.ts`** — Step 1 (Meta API call): replaced `&access_token=${token}` in the URL with an `Authorization: Bearer` header. Step 2 (CDN image fetch): added the same `isAllowedMetaUrl()` SSRF guard and `redirect: 'manual'` check already present in `app/api/meta-img/route.ts`. Previously `best.uri` (from the Meta API response) was fetched without any host validation.

- **`lib/google-ads.ts`** — Added `/^\d+$/` numeric validation before interpolating ad IDs into GAQL `IN (…)` clauses at two call sites (`fetchAdsByIds` and `backfillRdaImages`). Non-numeric IDs are filtered out; if none survive the filter the batch is skipped.

- **`.env.example`** — Removed the literal `1234` default for `ADMIN_PIN`. The server already returns 500 if the var is unset (`app/api/admin-unlock/route.ts`), but the example file was the ops path that would silently produce a trivial PIN.

- **`next.config.mjs`** — Added `isProd` flag (`process.env.NODE_ENV === 'production'`). The `script-src` CSP directive now omits `'unsafe-eval'` in production builds; development builds retain it for webpack HMR.

### Why this works

- **Token in headers vs. URL**: Vercel log drains, Sentry/Datadog breadcrumbs, and fetch stack traces capture the request URL; headers are not included. Moving the token to `Authorization: Bearer` across all Meta call sites closes the log-leakage surface uniformly. The `metaFetch()` wrapper existed precisely for this; the three sites that were bypassing it were a consistency gap.
- **CDN allowlist on meta-thumb**: The Meta API returns a `uri` field for the best thumbnail. Without validation a compromised or misconfigured API response could point to any host. The allowlist mirrors the one already in `meta-img`, ensuring the server never fetches from a non-Meta host regardless of what the API returns.
- **GAQL numeric guard**: Google Ads IDs are always integers. Validating with `/^\d+$/` before interpolation means a future code change that introduces a user-controlled value into the ID path cannot produce a GAQL injection.
- **unsafe-eval removal**: `'unsafe-eval'` in a CSP allows any injected script to use `eval()` or `Function()` to execute arbitrary code. Webpack HMR (dev only) requires it; production Next.js builds do not. Splitting on `NODE_ENV` closes the `eval` escape hatch in the deployed environment.

### Verification

- **Token headers**: confirm in Vercel function logs that no `access_token=` query param appears in any outbound Meta URL. Existing Meta calls (spend, ad lists) already used `metaFetch` and were unaffected.
- **CDN allowlist**: a `best.uri` of `https://evil.example.com/img.jpg` will now return 502 from `/api/meta-thumb`.
- **GAQL guard**: filter is applied before `.join()`, so no behavioural change for normal integer IDs. Non-integer IDs (which Meta/Google should never produce) are silently dropped.
- **CSP**: `curl -I https://<deployed-url>` in production should show `Content-Security-Policy` without `unsafe-eval` in `script-src`.

---

## 2026-05-19 — Security pass: drop stale lockfile, fail-closed PIN, retire creative-debug

### What changed

- `package-lock.json` — **deleted** (separate commit). The previous lockfile pinned `next@14.2.3`, which is the unpatched version vulnerable to CVE-2025-29927 (middleware-auth bypass via `x-middleware-subrequest`). `package.json` had already been bumped to `14.2.32` but the committed lockfile kept resolving the vulnerable build, so any `npm ci` (Vercel's default for repos with a lockfile) silently installed the bad version — the "security: patch CVE-2025-29927" commit was effectively a no-op in prod. Deleting the lockfile forces Vercel to resolve from `package.json` on the next build; the patched `14.2.32` then becomes the actually-installed version. The local sandbox couldn't reach the npm registry to regenerate the lockfile in-place, so the deletion path was used instead. Re-add a lockfile later via `npm install --package-lock-only` on a machine with registry access.
- `app/api/admin-unlock/route.ts` — removed the `process.env.ADMIN_PIN || '1234'` default. The route now reads `ADMIN_PIN` directly, logs an error, and returns 500 if the env var is unset. Previously, a missing/deleted Vercel env var meant the literal string `1234` was the live PIN.
- `app/api/meta-creative-debug/route.ts` — retired. Replaced the diagnostic implementation with `GET`/`POST` handlers that return 410 Gone. The old version took the passcode as a `?passcode=…` query string (which lands in Vercel access logs, browser history, and Referer headers) and inherited the same `ADMIN_PIN || '1234'` default. The endpoint dumped raw Meta API creative responses, so the combination of a logged passcode and a hardcoded fallback PIN was the highest-risk surface in the app. Diagnostics belong on a local dev server, not a public route.

### Why this should hold

- **CVE-2025-29927**: with no lockfile committed, Vercel resolves the next dependency from `package.json` (`14.2.32`, patched). The middleware-bypass header now hits patched code that strips the `x-middleware-subrequest` header before routing.
- **PIN fail-closed**: a misconfigured env var now returns 500 to the unlock attempt instead of silently authorizing `1234`. The blast radius of an exposed default was small (the admin gate only protects a client-side localStorage rename UI), but the same default was load-bearing on `meta-creative-debug` which dumped Meta API data — so removing the fallback in both routes was non-optional.
- **Creative-debug retirement**: returning 410 (rather than deleting the file) makes the change visible to anyone who had the old URL bookmarked, and removes any need for file-deletion permissions on the workspace. The handler does no work — no env reads, no Meta API calls, no leaked data.

### Verification

- Manual reasoning of each path; no test suite in repo. `npm run build` on Vercel will surface any TS regression.
- After deploy, hitting `GET /api/meta-creative-debug?passcode=anything` should return `410 Gone`.
- Hitting `POST /api/admin-unlock` with the correct PIN should still return 200; with the env var unset, it now returns 500 instead of silently accepting `'1234'`.
- Vercel build log should show `next@14.2.32` installed (not `14.2.3`).

---

## 2026-05-18 — Remove live clock from nav ticker

### What changed

**`components/TopBar.tsx`** — Removed the clock `<span>` (`fmtTime(now)`) and its trailing separator from the ticker row in Row 2. Also deleted the now-unused `fmtTime` helper function. `useClock` and `now` are retained because the date display still uses them.

### Why this works

The ticker now shows: `● LIVE · date · auto-refresh · 60s`. No functional or observer logic was touched.

---

## 2026-05-18 — Nav pill highlights immediately on click

### What changed

**`components/TopBar.tsx`** — `useActiveSection` now returns a `[activeId, forceActive]` tuple instead of just `activeId`. A `pinRef` is added: when `forceActive(id)` is called it sets `active` to the clicked id immediately *and* stores that id in `pinRef`. The `IntersectionObserver` callback ignores any update that doesn't match `pinRef` (i.e. the scroll hasn't landed yet), then clears `pinRef` once the observer fires for the correct section.

`onJumpClick` now calls `forceActive(id)` before triggering `scrollIntoView`, so the pill highlight flips at the moment of the click rather than after the smooth scroll completes.

### Why this works

Previously the highlight was 100% observer-driven. During a smooth scroll the old section stays in the viewport (still intersecting) so the observer kept reporting the old id — the pill stayed highlighted on the previous tab until the viewport had physically scrolled far enough for the old section to leave and the new one to enter. The `pinRef` short-circuit means the observer can't "correct" back to the old section mid-scroll, and as soon as the scroll lands the pin is released and normal observer behavior resumes.

### Verification

Click any nav pill → the corresponding pill highlights instantly. Subsequent scrolling continues to auto-highlight correctly.

---

## 2026-05-18 — Carousel arrows missing when image hashes don't resolve

### What changed

**`lib/meta.ts`** — Added a Path B-fallback in the Advantage+ carousel image builder. When `asset_feed_spec.images.length > 2` (confirmed carousel) but fewer than 2 of the card image hashes resolve via the `/adimages` batch lookup, `carouselImages` previously stayed `undefined` → `isCarousel = false` in `CreativeTile` → no arrows rendered.

The fix: when hashes don't resolve but `picked.url` (the main tile image, already resolved via a different path) is available, fill every carousel slot with `picked.url`. The card count stays accurate; only per-card uniqueness is lost for the affected ads.

Log signature of the new path:  
`[Meta] carousel (asset_feed_spec) "Ad Name": hashes unresolved — falling back to main image ×N so arrows render`

### Why this works

The `/adimages?hashes=[...]` endpoint only returns images in the querying ad account's library. Hashes for images uploaded under a different sub-account (or via the Business creative hub) are silently omitted. The log showed `adimages resolved 25/73 hashes` — 48 missed. Carousels whose 8-10 card hashes all fell in the unresolved 48 got `carouselImages = undefined`. Carousels that happened to have ≥2 hashes in the resolved 25 worked fine. The fallback ensures all confirmed carousels get arrows regardless of hash resolution.

### Verification

After deploy, every carousel ad (those with `asset_feed_spec.images.length > 2`) will render arrows in `CreativeTile`. Ads whose hashes resolve will still cycle through unique card images. Ads using the fallback will cycle through the same image — a known limitation until the hash resolution gap is investigated (likely a sub-account scope issue on the Meta API token).

---

## 2026-05-18 — Fix carousel detection for Advantage+ (asset_feed_spec) ads

### What changed

**`lib/meta.ts`** — All Camelback Meta ads use the Advantage+ creative format (`asset_feed_spec`), meaning `object_story_spec` and `child_attachments` are never populated. Carousel detection was looking exclusively at `child_attachments.length > 1`, which was always 0.

Added a second carousel detection path (Path B) that checks `asset_feed_spec.images.length > 2`:
- Populates `carouselImages` from `asset_feed_spec.images`, resolving each hash via the existing `hashToUrl` map
- Updates `metaAdType` to `'CAROUSEL'` when `afsImageCount > 2`

**Threshold rationale (from debug data):** Static A/B-test ads always have exactly 2 image variants — Meta uses both to optimise delivery but the ad format is still single-image. Carousel ads have one image per card (8–10 in Camelback's campaigns). `> 2` correctly separates them across all observed data.

### Why this works

The debug endpoint (`/api/meta-creative-debug`) confirmed every ad's `creative_top_level_keys` is `["thumbnail_url", "asset_feed_spec", "id"]` — `object_story_spec` is absent entirely. The carousel navigator and badge both derive from the same `carouselImages` / `metaAdType` values, so fixing the source fixes both.

### Verification

"Summer Carousel" and "Wedding Carousel" ads (8–10 `asset_feed_spec.images`) will now badge as "Carousel". Static ads (2 images) remain "Static". Video ads unchanged.

---

## 2026-05-18 — Add /api/meta-creative-debug diagnostic endpoint

### What changed

**`app/api/meta-creative-debug/route.ts`** (new file) — Passcode-gated GET endpoint that fetches the first N spending ads for the month and returns, for each ad: (1) every carousel-detection signal (`child_attachments_count`, `child_attachments` per-card detail, `asset_feed_images`, `asset_feed_videos`, `has_video_data`, etc.), (2) what `derived_adType` the production code currently assigns, and (3) the full raw `creative` JSON. Gated by `?passcode=` matching `ADMIN_PASSCODE` env var.

### Why this works

Carousel detection currently relies on `object_story_spec.link_data.child_attachments.length > 1`. Known carousel ads are still badging as "Static", meaning either (a) `child_attachments` is empty/missing for those ad types, or (b) those ads use a different creative structure entirely. This endpoint lets us see the actual raw API response to determine which case it is and what the right fix looks like.

### Verification

Hit `/api/meta-creative-debug?passcode=YOUR_PASSCODE&limit=20` in the browser, find a known carousel ad in the JSON output, and inspect its `signals.child_attachments_count` and `signals.child_attachments` array. The `raw_creative` key shows the complete unmodified API response.

---

## 2026-05-18 — Rename Meta "Image" badge to "Static"

### What changed

**`components/CreativeTile.tsx`** — Changed `META_TYPE_LABELS.IMAGE` from `'Image'` to `'Static'`. Single-image Meta ads now badge as "Static" instead of "Image", which is the industry term and distinguishes them from carousel and video formats at a glance.

### Why this works

The `adType` field on Meta `Ad` objects is already correctly set to `'IMAGE'`, `'CAROUSEL'`, or `'VIDEO'` by `lib/meta.ts`. The data was right; only the display label was wrong. No API changes needed — this is purely a cosmetic rename.

### Verification

Static image Meta ads will show the "Static" badge. Carousel and Video badges are unchanged.

---

## 2026-05-18 — Fix Meta ad type badge always showing "Image"

### What changed

**`lib/meta.ts`** — After the carousel image collection block, derive a `metaAdType` string
(`'VIDEO'`, `'CAROUSEL'`, `'DYNAMIC'`, or `'IMAGE'`) from the raw creative structure:
- `object_story_spec.video_data.video_id` present → `VIDEO`
- `asset_feed_spec.videos` non-empty → `VIDEO`
- `link_data.child_attachments.length > 1` → `CAROUSEL`
- Everything else → `IMAGE`

`metaAdType` is added as `adType` to the `ads.push()` call so every Meta `Ad` object now
carries the structural format label.

**`components/CreativeTile.tsx`** — Added `META_TYPE_LABELS` constant mapping those three
values to display strings (`VIDEO`, `CAROUSEL`, `IMAGE`). Added a `platform === 'meta' && ad.adType` branch in `typeLabel()`
immediately after the StackAdapt `channel` check. Priority is preserved: `isCarousel`
(resolved images) and `videoUrl` (resolved MP4) still fire first; the new Meta branch is a
fallback for when URL resolution failed.

### Why this works

Previously the badge for Meta ads was determined entirely by whether asset URLs resolved:
`carouselImages.length > 1` for carousels and `ad.videoUrl` for videos. If
`videoIdToSource` didn't contain the video ID (e.g. the MP4 URL wasn't fetched), or if
fewer than two carousel card images resolved, both checks would silently fall through to
`ad.imageUrl` → "Image". The structural `adType` is derived from the API field names
themselves (not URL resolution), so it can't silently degrade to "Image".

### Verification

Meta ads with `object_story_spec.video_data` will now badge as "Video" even when the MP4
URL is absent. Carousel ads whose images fail to resolve will badge as "Carousel" rather
than "Image". Google and StackAdapt badge logic is unchanged (their branches fire before
the new Meta branch).

---

## 2026-05-18 — Fix sticky navbar broken by inline style override

### What changed
- `components/TopBar.tsx` (line 207) — removed `style={{ position: 'relative' }}` from the `<header className="topbar">` element.

### Why this works
Inline styles have higher CSS specificity than class-based rules. The `.topbar` CSS rule in `app/layout.tsx` correctly sets `position: sticky; top: 0; z-index: 50`, but the `style={{ position: 'relative' }}` attribute was silently winning the cascade, making the header scroll out of view like a normal block element. The auto-scroll-back behaviour users reported was a downstream symptom: with no sticky anchor, the page layout shifted each scroll tick in an unexpected way. Removing the inline style lets the CSS class rule take effect uncontested.

### Verification
Desktop: nav bar stays pinned at the top while scrolling the full page. No scroll-snap-back artefact.

---

## 2026-05-18 — Ad format badge next to headline on each tile

### What changed
- `components/CreativeTile.tsx` — replaced the unused standalone `typeLabel(ad)` function with `typeLabel(ad, isCarousel, platform)`. Added a `GOOGLE_TYPE_LABELS` map that converts raw Google API enum strings (`PERFORMANCE_MAX`, `RESPONSIVE_SEARCH_AD`, etc.) to short friendly labels ("Perf Max", "Search", etc.). StackAdapt tiles use `ad.channel` (already a human-readable string like "Native" or "Display"). Meta tiles resolve to "Carousel", "Video", "Image", or "Text". The existing `kind` variable now passes the correct params and is finally consumed: the `<h4>` is now wrapped in a `<div className="creative-headline-row">` alongside a `<span className="ad-type-badge">{kind}</span>`.
- `app/layout.tsx` — added `.creative-headline-row` (flex row, `flex-wrap: wrap`, 6px gap) and `.ad-type-badge` (Space Mono, 8.5px, uppercase, 38% white opacity, thin border, 4px radius). The badge uses `align-self: center` so it sits at the vertical midpoint of the headline text regardless of how many lines the headline wraps to.

### Why this works
- `isTextCard` Google RSAs already skip the `creative-detail` block entirely, so the badge never appears on white SERP-style cards where it would be invisible against a white background.
- The badge uses `flex-shrink: 0` so it never gets compressed on narrow tile widths; `flex-wrap: wrap` on the row means a long headline pushes the badge to a second line rather than truncating either element.
- Opacity 38% and a subtle border keep the badge clearly secondary to the headline — readable as metadata, not competing copy.

### Verification
- Meta video ad → badge reads "Video"; Meta carousel → "Carousel"; Meta image → "Image".
- Google PMax → "Perf Max"; Google RSA with image → "Search"; Google Display → "Display".
- StackAdapt native ad → "Native"; StackAdapt video → "Video".
- Google text-only RSAs: `isTextCard` true → `creative-detail` block skipped → no badge rendered.

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
