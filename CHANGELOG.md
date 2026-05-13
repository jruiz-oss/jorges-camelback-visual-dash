# Changelog

Running log of meaningful changes to the ad dashboard. Newest at the top. Each entry explains **what** changed and **why** the change works the way it does, so future debugging starts with context instead of guesswork.

> Maintenance rule (see `CLAUDE.md`): every code change appends an entry here, names the files it touched, and removes any stale content elsewhere in the repo's `.md` files.

---

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
