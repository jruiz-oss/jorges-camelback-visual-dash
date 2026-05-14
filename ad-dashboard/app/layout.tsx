import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Camelback Resort — Ad Dashboard',
  description: 'Active ad visual dashboard powered by Commit Agency',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Space Grotesk (display + UI) + Space Mono (ticker, counts, type chips). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          /* ── Tokens ──────────────────────────────────────────────────────── */
          /* Camelback brand palette:
             Slate #242841 · Indigo #1D446B · Powder Blue #C8E1F7 · Orange #F97529
             Spruce #21432B · Light Moss #C8DA98 · Pine #4C9429
             Light Orange #F7B45B · Light Cream #FFF5E0
             Camelback Red #FB2E33 · Midnight #1F1E23 */
          :root {
            --bg: #ffffff;          /* White */
            --bg-2: #f5f5f5;        /* Off-white */
            --ink: #242841;         /* Slate */
            --ink-2: #5a607c;       /* slate-muted */
            --ink-3: #8d92a8;       /* slate-light */
            --line: rgba(36,40,65,.10);
            --line-2: rgba(36,40,65,.16);

            /* Brand accents */
            --brand-slate: #242841;
            --brand-indigo: #1D446B;
            --brand-powder: #C8E1F7;
            --brand-orange: #F97529;
            --brand-light-orange: #F7B45B;
            --brand-cream: #FFF5E0;
            --brand-spruce: #21432B;
            --brand-pine: #4C9429;
            --brand-moss: #C8DA98;
            --brand-red: #FB2E33;
            --brand-midnight: #1F1E23;

            /* Platform colors — kept as official platform brand colors so each
               channel reads at a glance. */
            --meta: #1877f2;
            --google: #34a853;
            --stack: #ff5a36;
            /* "Live" indicator uses brand Pine — still reads as healthy/green
               but ties the dashboard to Camelback's brand. */
            --live: #4C9429;

            --sans: "Space Grotesk", ui-sans-serif, system-ui, -apple-system, sans-serif;
            --display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
            --mono: "Space Mono", ui-monospace, "SF Mono", Menlo, monospace;
          }

          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { min-height: 100%; }
          html { scroll-behavior: smooth; }
          /* Sections offset their scroll position so jumps don't land
             underneath the sticky two-row header. */
          section[id] { scroll-margin-top: 130px; }

          body {
            background-color: #ffffff;
            background-image: radial-gradient(circle, rgba(36,40,65,.05) 1px, transparent 1px);
            background-size: 22px 22px;
            color: var(--ink);
            font-family: var(--sans);
            font-weight: 400;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            font-variant-numeric: tabular-nums;
          }
          ::selection { background: var(--ink); color: var(--bg); }

          /* ── Pulse (shared live dot animation) ───────────────────────────── */
          @keyframes pulse {
            0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--live) 70%, transparent); }
            70%  { box-shadow: 0 0 0 10px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; }
          }

          /* ── Top bar ─────────────────────────────────────────────────────── */
          .topbar {
            position: sticky; top: 0; z-index: 50;
            background: #ffffff;
            border-bottom: 1px solid var(--line-2);
            box-shadow:
              0 1px 0 rgba(0,0,0,.02),
              0 8px 24px -12px rgba(0,0,0,.12),
              0 2px 6px -2px rgba(0,0,0,.05);
          }
          .topbar-inner { max-width: 1800px; margin: 0 auto; padding: 0 28px; }
          .topbar-row { display: flex; align-items: center; gap: 24px; }
          .topbar-row.r1 { padding: 18px 0 14px; }
          .topbar-row.r2 {
            padding: 10px 0; gap: 18px;
            border-top: 1px solid var(--line);
          }

          .brand { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; }
          .brand .dot {
            width: 9px; height: 9px; border-radius: 50%;
            background: var(--live);
            box-shadow: 0 0 0 0 color-mix(in oklab, var(--live) 60%, transparent);
            animation: pulse 1.8s ease-out infinite;
            flex-shrink: 0;
          }
          .brand-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
          .brand-h1 {
            font-family: var(--display);
            font-weight: 600; letter-spacing: 0;
            font-size: 26px; line-height: 1.05; color: var(--ink);
            white-space: nowrap;
          }
          .brand-sub {
            font-family: var(--mono);
            font-size: 11px; letter-spacing: .04em;
            color: var(--ink-2); text-transform: uppercase;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .brand-sub b { color: var(--ink); font-weight: 500; }

          .top-totals {
            display: flex; align-items: center; gap: 0;
            align-self: center;
            background: var(--bg-2);
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 8px 4px;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
          }
          .top-totals .stat {
            padding: 2px 16px;
            border-right: 1px solid var(--line);
          }
          .top-totals .stat:last-child { border-right: 0; }
          .stat { display: flex; align-items: baseline; gap: 7px; }
          .stat-n {
            font-family: var(--display); font-weight: 600;
            font-size: 18px; line-height: 1; color: var(--ink);
            font-variant-numeric: tabular-nums; letter-spacing: 0;
          }
          .stat-l {
            font-family: var(--sans); font-size: 10px;
            color: var(--ink-2); text-transform: uppercase; letter-spacing: .08em;
            font-weight: 500;
          }

          .refresh {
            appearance: none;
            border: 1px solid rgba(0,0,0,.1);
            background: #fff;
            color: var(--ink);
            padding: 8px 14px; border-radius: 999px;
            font: inherit; font-family: var(--display); font-weight: 500;
            font-size: 12.5px; cursor: pointer;
            display: inline-flex; align-items: center; gap: 8px;
            box-shadow: 0 1px 0 rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.04);
            transition: background .15s, border-color .15s, box-shadow .15s, transform .15s;
          }
          .refresh:hover {
            border-color: rgba(0,0,0,.2);
            box-shadow: 0 1px 0 rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.08);
            transform: translateY(-1px);
          }
          .refresh svg { width: 13px; height: 13px; }
          .refresh .spinner { display: inline-block; transition: transform .6s ease; }
          .refresh.is-spinning .spinner { transform: rotate(360deg); }

          /* ── Jump nav ────────────────────────────────────────────────────── */
          .nav-jump-wrap {
            position: relative; flex: 1; min-width: 0; overflow: hidden;
          }
          /* Fade-out on right edge = horizontal scroll affordance */
          .nav-jump-fade {
            position: absolute; right: 0; top: 0; bottom: 0;
            width: 56px; pointer-events: none; z-index: 4;
            background: linear-gradient(to right, transparent, #ffffff);
          }
          .nav-jump {
            display: flex; gap: 6px; align-items: center;
            width: 100%;
            overflow-x: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(0,0,0,.18) transparent;
            padding-bottom: 3px; /* visible thin scrollbar room */
          }
          .nav-jump::-webkit-scrollbar { height: 3px; }
          .nav-jump::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,.2); border-radius: 2px;
          }
          .nav-jump::-webkit-scrollbar-track { background: transparent; }
          .nav-jump a {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 7px 14px 7px 10px;
            border-radius: 999px;
            text-decoration: none;
            color: var(--ink-2);
            font-family: var(--display); font-weight: 500;
            font-size: 13px; letter-spacing: 0;
            border: 1px solid transparent;
            background: transparent;
            transition: all .15s;
            white-space: nowrap; cursor: pointer;
          }
          .nav-jump a:hover { color: var(--ink); background: rgba(0,0,0,.04); }
          .nav-jump a.active {
            color: var(--ink); background: #fff;
            border-color: rgba(0,0,0,.1);
            box-shadow: 0 1px 2px rgba(0,0,0,.04);
          }
          .nav-jump .jump-mark {
            height: 18px; min-width: 18px; padding: 0 5px;
            border-radius: 5px;
            display: inline-flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            font-size: 9px; font-weight: 700; letter-spacing: .02em; line-height: 1;
          }
          .nav-jump .jump-mark svg { width: 14px; height: 14px; }
          .nav-jump .jump-count {
            font-family: var(--mono); font-size: 10.5px;
            color: var(--ink-3); letter-spacing: .02em;
          }
          .nav-jump a.active .jump-count,
          .nav-jump a:hover .jump-count { color: var(--ink-2); }

          /* ── Live ticker ─────────────────────────────────────────────────── */
          .ticker {
            display: flex; align-items: center; gap: 18px;
            color: var(--ink-2);
            font-family: var(--mono); font-size: 11.5px; letter-spacing: .02em;
            white-space: nowrap; overflow: hidden;
            flex: 0 0 auto;
          }
          .ticker .sep { width: 1px; height: 14px; background: var(--line-2); }
          .ticker .live-mark { color: var(--live); font-weight: 700; }
          @media (max-width: 1100px) {
            .ticker .hide-narrow { display: none; }
          }

          /* ── Segment sections ────────────────────────────────────────────── */
          .platforms {
            max-width: 1800px; margin: 0 auto; padding: 32px 28px 72px;
            display: flex; flex-direction: column; gap: 28px;
          }
          .segment,
          .platform {
            position: relative;
            padding: 28px 28px 32px;
            background: #ffffff;
            border: 1px solid rgba(0,0,0,.1);
            border-radius: 18px;
            box-shadow:
              0 1px 0 rgba(255,255,255,.8) inset,
              0 2px 0 rgba(0,0,0,.03),
              0 8px 24px -6px rgba(0,0,0,.1),
              0 2px 6px rgba(0,0,0,.04);
            scroll-margin-top: 130px;
            overflow: hidden;
          }
          .segment::before,
          .platform::before {
            content: ""; position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 5px; background: var(--accent);
            opacity: 1;
          }

          .segment-head,
          .platform-head {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 24px; align-items: center;
            padding-bottom: 12px;
            margin-bottom: 14px;
            border-bottom: 1px solid var(--line-2);
          }
          .segment-head > div:nth-child(2),
          .platform-head > div:nth-child(2) { display: none; }
          .segment-id,
          .platform-id { display: flex; align-items: center; gap: 18px; }
          .segment-id,
          .platform-id,
          .seg-platform-id { min-width: 0; }
          .segment-mark {
            width: 40px; height: 40px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            position: relative; overflow: hidden;
            background:
              linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,0)),
              var(--accent);
            border: 0;
            color: #fff;
            font-family: var(--display); font-size: 16px; font-weight: 700;
            line-height: 1; letter-spacing: 0;
            box-shadow: 0 6px 14px color-mix(in oklab, var(--accent) 22%, transparent);
          }
          .platform-mark {
            width: 56px; height: 56px; border-radius: 14px;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            position: relative; overflow: hidden;
            background: #fff;
            border: 1px solid var(--line);
            box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.03);
          }
          .platform-mark::after {
            content: ""; position: absolute; inset: 0;
            background: radial-gradient(120% 80% at 0% 0%, rgba(0,0,0,.03), transparent 60%);
            pointer-events: none;
          }
          .platform-mark svg {
            width: 32px; height: 32px;
            position: relative; z-index: 1;
          }
          .segment-name,
          .platform-name {
            font-family: var(--display);
            font-size: 21px; font-weight: 600;
            letter-spacing: -0.01em; line-height: 1.1;
            overflow-wrap: anywhere;
          }
          .platform-name em {
            font-style: normal; font-weight: 300;
            color: var(--ink-3); letter-spacing: 0;
          }
          .segment-meta,
          .platform-meta {
            display: flex; align-items: center; gap: 12px;
            color: var(--ink-2); font-size: 13px;
            margin-top: 8px;
            font-family: var(--mono);
            white-space: nowrap; flex-wrap: wrap;
          }
          .segment-meta .live-tag,
          .platform-meta .live-tag {
            color: var(--live); display: inline-flex; align-items: center; gap: 6px;
          }
          .segment-meta .live-tag::before,
          .platform-meta .live-tag::before {
            content: ""; width: 6px; height: 6px; border-radius: 50%;
            background: var(--live); animation: pulse 1.8s ease-out infinite;
          }
          .segment-totals,
          .platform-totals {
            display: flex; align-items: center; gap: 0;
            align-self: center;
            background: var(--bg-2);
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 10px 4px;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
          }
          .segment-totals .stat,
          .platform-totals .stat {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            padding: 2px 18px;
            border-right: 1px solid var(--line);
          }
          .segment-totals .stat:last-child,
          .platform-totals .stat:last-child { border-right: 0; }
          .segment-totals .stat-n,
          .platform-totals .stat-n { font-size: 22px; font-weight: 600; }
          .segment-totals .stat-l,
          .platform-totals .stat-l { font-size: 10px; }

          .seg-platforms {
            display: flex; flex-direction: column; gap: 16px;
          }
          .seg-platform {
            position: relative;
            padding: 20px 20px 8px 32px;
            background: var(--bg);
            border: 1px solid var(--line);
            border-radius: 12px;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
          }
          .seg-platform:first-child {
            padding-top: 20px;
            border-top: 1px solid var(--line);
          }
          /* Google block content sits much further right than Meta /
             StackAdapt. Two reasons stacked: (1) the SERP-style text card
             has a white background that visually merges with the platform
             container chrome when butted too close to the left edge,
             producing the "clipped" look in the previous screenshots, and
             (2) image-based ads visually anchor with their photo edge while
             text cards anchor with their headline left margin, so identical
             container padding reads as "too tight" on Google specifically.
             Bumping the platform container's left padding shifts both the
             campaign title row AND every lane below it together — a single
             move, not a per-row override. */
          .seg-platform[data-platform="google"] {
            padding-left: 72px;
          }
          .seg-platform-head {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 18px; align-items: center;
            padding-bottom: 14px;
            margin-bottom: 10px;
            border-bottom: 1px solid var(--line);
          }
          .seg-platform-id {
            display: flex; align-items: center; gap: 14px;
          }
          .seg-platform-mark {
            width: 38px; height: 38px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            background: #fff;
            border: 1px solid var(--line);
            box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.03);
          }
          .seg-platform-mark svg { width: 22px; height: 22px; }
          .seg-platform-name {
            font-family: var(--display);
            font-size: 17px; line-height: 1.1; font-weight: 600;
            letter-spacing: 0;
          }
          .seg-platform-meta {
            display: flex; align-items: center; gap: 10px;
            margin-top: 4px;
            color: var(--ink-2);
            font-family: var(--mono); font-size: 12px;
            white-space: nowrap; flex-wrap: wrap;
          }
          .seg-platform-meta .live-tag {
            color: var(--live); display: inline-flex; align-items: center; gap: 6px;
          }
          .seg-platform-meta .live-tag::before {
            content: ""; width: 6px; height: 6px; border-radius: 50%;
            background: var(--live); animation: pulse 1.8s ease-out infinite;
          }
          .seg-platform-totals {
            display: flex; align-items: center; gap: 0;
            background: var(--bg-2);
            border: 1px solid var(--line);
            border-radius: 10px;
            padding: 7px 2px;
          }
          .seg-platform-totals .stat {
            flex-direction: column; align-items: flex-start; gap: 3px;
            padding: 2px 14px;
            border-right: 1px solid var(--line);
          }
          .seg-platform-totals .stat:last-child { border-right: 0; }
          .seg-platform-totals .stat-n { font-size: 17px; font-weight: 600; }
          .seg-platform-totals .stat-l { font-size: 9.5px; }

          .platform-empty {
            color: var(--ink-3);
            font-family: var(--mono); font-size: 12px;
            letter-spacing: .04em; text-transform: uppercase;
            padding: 18px 0 6px;
            border-top: 1px dashed var(--line-2);
          }

          /* ── Campaigns ───────────────────────────────────────────────────── */
          .campaigns { display: flex; flex-direction: column; gap: 18px; padding-top: 6px; }
          .campaign { position: relative; }
          .campaign-head {
            display: flex; align-items: baseline; gap: 14px;
            padding: 6px 0 12px;
          }
          .campaign:not(:first-child) .campaign-head {
            border-top: 1px dashed var(--line-2);
            padding-top: 16px;
          }
          .campaign-name {
            font-family: var(--display);
            font-size: 18px; font-weight: 500;
            letter-spacing: 0; color: var(--ink);
          }
          .campaign-name b {
            color: var(--ink-3); font-weight: 400;
            font-family: var(--mono); font-size: 11px;
            text-transform: uppercase; letter-spacing: .06em;
            margin-right: 10px; vertical-align: 1px;
          }
          .campaign-meta {
            color: var(--ink-3);
            font-family: var(--mono); font-size: 11px;
            letter-spacing: .02em; text-transform: uppercase;
          }
          .campaign-meta .live-dot {
            display: inline-block; width: 6px; height: 6px; border-radius: 50%;
            background: var(--live); margin-right: 6px;
            animation: pulse 1.8s ease-out infinite;
            vertical-align: middle;
          }

          /* ── Creative lane (horizontal scroll) ───────────────────────────── */
          /* The lane scrolls horizontally. Each card takes its natural height
             so the description panel grows to fit however many lines the body
             copy needs. The lane itself auto-sizes its height to the tallest
             card. overflow-y:clip is the safe partner to overflow-x:auto
             (using "visible" would force the browser to also enable Y scrolling),
             and because the lane's height equals max(card heights), clip never
             actually cuts anything off — it just prevents a vertical scrollbar
             from appearing on the lane itself. */
          .lane {
            display: flex; gap: 14px;
            align-items: flex-start;
            overflow-x: auto;
            overflow-y: clip;
            padding: 6px 16px 16px 36px;
            /* scroll-snap-type intentionally removed: with snap enabled, Chrome
               auto-scrolls to the first snap target on page load (scrollLeft=36),
               which consumes the left padding and clips the first card.
               scroll-padding-inline-start does not prevent this initial snap.
               This is an ad wall view, not a carousel — free scrolling is fine. */
            scrollbar-width: thin;
            scrollbar-color: var(--line-2) transparent;
          }
          .lane::-webkit-scrollbar { height: 6px; }
          .lane::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 3px; }
          .lane::-webkit-scrollbar-track { background: transparent; }

          /* (Previous 7px lane-padding nudge for Google removed — the shift
             now lives on the .seg-platform container itself so the campaign
             title row moves in lockstep with the cards. See the
             [data-platform="google"] block above .seg-platform-head.) */

          /* ── Creative tile ───────────────────────────────────────────────── */
          /* Flex-column layout: image on top, text detail below the photo. */
          .creative {
            position: relative; flex: 0 0 auto;
            width: clamp(280px, 19vw, 340px);
            border-radius: 12px; overflow: hidden;
            cursor: default;
            background: transparent;
            display: flex; flex-direction: column;
            transition: transform .25s cubic-bezier(.2,.7,.3,1), box-shadow .25s;
            box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 4px 14px rgba(0,0,0,.04);
          }
          .creative:hover {
            transform: translateY(-3px);
            box-shadow: 0 14px 40px rgba(0,0,0,.18), 0 0 0 1.5px var(--accent);
          }

          /* Wrapper around the photo/video and its overlaid chips.
             Keeps brand chip + Live pill anchored to the image area. */
          .creative-media-wrapper {
            position: relative;
            overflow: hidden;
            border-radius: 12px 12px 0 0;
            background: #242841;
            flex-shrink: 0;
            width: 100%;
          }
          /* Media wrapper always connects to the detail panel below */
          .creative-media {
            display: flex; align-items: center; justify-content: center;
            width: 100%;
            aspect-ratio: 4 / 3;
            overflow: hidden;
            background: #242841;
          }
          .creative-img,
          .creative-video {
            display: block;
            width: 100%; height: 100%;
            object-fit: cover;
          }
          /* Meta tiles match Google PMax: fill the 4:5 frame edge-to-edge
             with object-fit:cover so the image becomes the whole card surface.
             The bottom .creative-detail overlay (rendered for every image/
             video tile) carries the headline + body copy on top. No more
             black contain bars, no separate caption strip. */
          /* Fill the card background with the same dark colour as the detail
             panel so any sub-pixel gap between the media wrapper and the
             copy section below shows dark, not the white page behind it. */
          .creative[data-platform="meta"] {
            background: #242841;
          }
          .creative[data-platform="meta"] .creative-media {
            aspect-ratio: 4 / 3;
            padding: 0;
            background: #1F1E23;
          }
          .creative[data-platform="meta"] .creative-img,
          .creative[data-platform="meta"] .creative-video {
            width: 100%; height: 100%;
            object-fit: cover;
            image-rendering: auto;
            border-radius: 0;
          }
          .creative-ph {
            display: flex; align-items: center; justify-content: center;
            width: 100%; aspect-ratio: 4/3;
            color: rgba(255,255,255,.92);
            font-family: var(--display); font-size: 13px; line-height: 1.25;
            text-align: center; padding: 14px;
            box-sizing: border-box;
          }
          /* info row: brand chip + status pill — OVERLAID on the image, not
             a separator strip between image and text. Positioned absolute
             across the top of .creative-media-wrapper so the image flows
             directly into the copy panel below with no gap or bar. */
          .creative-info-row {
            position: absolute;
            top: 8px; left: 8px; right: 8px;
            z-index: 3;
            display: flex; align-items: center; justify-content: space-between; gap: 6px;
            min-width: 0;
            pointer-events: none;
          }
          .creative-info-row > * { pointer-events: auto; }
          .brand-chip {
            display: inline-flex; align-items: center; gap: 5px;
            background: rgba(0,0,0,.55);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            padding: 3px 9px 3px 3px;
            border-radius: 999px;
            color: rgba(255,255,255,.95); font-size: 10px;
            font-family: var(--display); font-weight: 500;
            border: .5px solid rgba(255,255,255,.18);
            min-width: 0; flex-shrink: 1;
            max-width: 72%; line-height: 1; overflow: hidden;
          }
          .brand-chip-mark {
            width: 16px; height: 16px; border-radius: 50%;
            background: rgba(255,255,255,.92); color: #111;
            font-size: 8.5px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
          }
          .brand-chip span {
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          .corner-status {
            display: inline-flex; align-items: center; gap: 4px;
            font-size: 9px; text-transform: uppercase; letter-spacing: .08em;
            color: rgba(255,255,255,.95); font-family: var(--mono);
            background: rgba(0,0,0,.55);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            padding: 3.5px 8px 3.5px 6px; border-radius: 999px;
            border: .5px solid rgba(255,255,255,.18);
            flex-shrink: 0; white-space: nowrap; line-height: 1;
          }
          .corner-status::before {
            content: ""; width: 5px; height: 5px; border-radius: 50%;
            background: var(--live);
            animation: pulse 1.8s ease-out infinite;
            box-shadow: 0 0 6px var(--live);
          }
          .creative.paused .corner-status::before {
            background: rgba(255,255,255,.4); animation: none; box-shadow: none;
          }
          .creative.paused .corner-status { color: rgba(255,255,255,.65); }

          /* .creative-bottom removed — all text is now in .creative-detail below the photo */

          /* video play affordance */
          .creative.video .play-ring {
            position: absolute; top: 50%; left: 50%;
            width: 38px; height: 38px; border-radius: 50%;
            background: rgba(0,0,0,.32);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            border: .5px solid rgba(255,255,255,.4);
            transform: translate(-50%, -50%);
            z-index: 2; pointer-events: none;
            display: flex; align-items: center; justify-content: center;
            transition: transform .2s, background .2s;
          }
          .creative.video:hover .play-ring {
            transform: translate(-50%, -50%) scale(1.08);
            background: rgba(0,0,0,.5);
          }
          .play-ring::before {
            content: "";
            width: 0; height: 0;
            border-top: 7px solid transparent;
            border-bottom: 7px solid transparent;
            border-left: 11px solid #fff;
            margin-left: 3px;
          }

          /* Text detail sits BELOW the photo — static flow, never an overlay.
             Belt-and-suspenders rules so the full description always wraps
             across however many lines it needs:
             - position is plain "static" (NEVER absolute — prior attempts at
               this caused mid-line clipping via a stale cascaded rule).
             - height/max-height are explicitly unconstrained so the panel
               always grows to fit content.
             - overflow is fully visible — nothing inside this panel may be
               clipped on either axis. The horizontal-scroll lane that contains
               us was the suspected culprit; we override anyway to be safe.
             - We become a flex column so h4 + p stack predictably even if some
               odd inherited display crept in. */
          .creative-detail {
            position: static;
            background: #242841;
            border-radius: 0 0 12px 12px;
            padding: 7px 13px 14px;
            color: #fff;
            pointer-events: auto;
            width: 100%;
            min-width: 0;
            max-height: none;
            height: auto;
            overflow: visible;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 0 0 auto;
          }
          .creative-detail h4 {
            margin: 0;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0;
            line-height: 1.3;
            font-family: var(--display);
            color: #fff;
            word-break: break-word;
            overflow-wrap: anywhere;
            /* No clamp: headline grows to fit (typically 1–2 lines). */
          }
          /* Description: NEVER clamped. Whole body copy is shown, however
             many lines it needs. The .lane (overflow-y:clip) sizes itself
             to the tallest card so nothing is cut off visually. */
          .creative-detail p {
            margin: 0;
            font-size: 11px;
            line-height: 1.5;
            color: rgba(255,255,255,.82);
            font-family: var(--sans);
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: normal;
            overflow: visible;
            text-overflow: clip;
          }
          /* Google-text-RSA footer strip — just holds the Live/Paused pill
             below the SERP card since chips aren't overlaid on text cards. */
          .creative-detail--google-text {
            background: var(--bg-2);
            border-top: 1px solid rgba(0,0,0,.08);
            padding: 8px 7%;
            flex-direction: row;
            justify-content: flex-start;
          }
          .creative-detail--google-text .corner-status {
            position: static;
            background: rgba(0,0,0,.07);
            color: var(--ink-2);
            border-color: rgba(0,0,0,.1);
            backdrop-filter: none; -webkit-backdrop-filter: none;
          }
          .creative-detail--google-text .corner-status::before {
            box-shadow: none;
          }
          .creative.paused .creative-detail--google-text .corner-status::before {
            background: #aaa;
          }

          /* ── Google text card (no image / no video) ──────────────────────
             Clean modern Search-ad preview card. No gradient bg, no overlays —
             the copy IS the creative. Styled to feel like current Google SERP.

             Layout note: text-only Google ads share .creative-ph with image
             placeholders elsewhere, but .creative-ph's 4:3 aspect-ratio left
             a tall band of empty space below the copy. For text cards we
             drop the aspect frame so the card hugs the height of its text. */
          .creative.has-text-card {
            box-shadow:
              0 0 0 1px rgba(0,0,0,.08),
              0 2px 6px rgba(0,0,0,.08),
              0 8px 24px rgba(0,0,0,.10);
          }
          .creative.has-text-card:hover {
            box-shadow:
              0 0 0 1.5px var(--accent),
              0 14px 40px rgba(0,0,0,.18);
          }
          .creative.has-text-card .creative-media-wrapper {
            background: #fff;
            padding: 0;
            border-radius: 12px 12px 0 0;
          }
          .creative.has-text-card .creative-ph {
            aspect-ratio: auto;
            height: auto;
            padding: 22px 7% 20px;
          }
          .creative-ph-card {
            background: #fff;
            color: var(--ink);
            display: flex; flex-direction: column;
            align-items: flex-start; justify-content: flex-start;
            text-align: left;
            padding: 22px 7% 20px;
            gap: 0;
            min-height: 0;
            border: 0;
            border-radius: 12px 12px 0 0;
            box-shadow: none;
          }
          /* "Sponsored" pill — signals ad type without the old label-chip look */
          .ph-serp-meta {
            display: flex; align-items: center; gap: 5px;
            margin-bottom: 10px;
          }
          .ph-serp-badge {
            font-size: 8.5px; font-weight: 500; letter-spacing: .02em;
            color: #186000;
            background: #e8f5e9;
            padding: 2px 7px; border-radius: 3px;
            font-family: var(--sans);
            border: 1px solid #c8e6c9;
            line-height: 1.4;
          }
          /* Legacy label chips (used only in AdCard.tsx) */
          .creative-ph-hl-block {
            width: 100%;
            padding: 0 0 8px;
          }
          .creative-ph-label {
            display: inline-block;
            font-family: var(--mono);
            font-size: 7.5px; font-weight: 700;
            letter-spacing: .12em; text-transform: uppercase;
            color: #fff;
            padding: 2px 6px; border-radius: 3px;
            margin-bottom: 5px;
          }
          .creative-ph-label.lbl-hl  { background: #1558D6; }
          .creative-ph-label.lbl-desc { background: #5f6368; }
          .creative-ph-desc-block {
            width: 100%;
            padding: 8px 0 0;
          }
          /* Headline — modern Google blue, clean spacing. No clamp: full
             headline shown so nothing is silently cut off. */
          .creative-ph-headline {
            font-family: var(--display);
            font-weight: 600;
            font-size: 14px; line-height: 1.3;
            color: #1558D6;
            text-wrap: balance;
            margin-bottom: 9px;
            overflow-wrap: anywhere;
          }
          /* Description — current Google body-text dark grey. No clamp:
             full description shown. */
          .creative-ph-body {
            font-family: var(--sans);
            font-size: 11px; line-height: 1.5;
            color: #3c4043;
            padding-top: 8px;
            border-top: 1px solid rgba(0,0,0,.07);
            overflow-wrap: anywhere;
          }
          /* Google text-card styling lives on .creative-detail--google-text
             above. No further overrides needed here — chips are not drawn
             over the SERP card. */

          /* ── Responsive layout ───────────────────────────────────────────── */
          @media (max-width: 980px) {
            .topbar-inner { padding: 0 18px; }
            .topbar-row.r1 { flex-wrap: wrap; gap: 14px; }
            .brand { flex: 1 1 100%; }
            .top-totals {
              flex: 1 1 auto;
            }
            .refresh { margin-left: auto; }
            .topbar-row.r2 {
              align-items: flex-start;
              flex-direction: column;
              gap: 10px;
            }
            .nav-jump,
            .ticker { width: 100%; }
            .platforms { padding: 22px 18px 60px; gap: 18px; }
            .segment,
            .platform { padding: 22px 22px 26px; }
            .segment-head,
            .platform-head,
            .seg-platform-head {
              grid-template-columns: minmax(0, 1fr);
              gap: 14px;
              align-items: start;
            }
            .segment-totals,
            .platform-totals,
            .seg-platform-totals {
              align-self: flex-start;
            }
            .segment-name,
            .platform-name { font-size: 19px; }
            .creative { width: 240px; }
          }

          @media (max-width: 640px) {
            section[id] { scroll-margin-top: 176px; }
            .topbar-row.r1 { padding: 14px 0 12px; }
            .brand-h1 { font-size: 22px; }
            .brand-sub { font-size: 10px; }
            .top-totals { width: 100%; }
            .top-totals .stat { padding: 2px 12px; }
            .top-totals .stat-n { font-size: 16px; }
            .segment,
            .platform { padding: 20px 18px 24px; }
            .segment-id,
            .platform-id { gap: 13px; align-items: flex-start; }
            .segment-mark,
            .platform-mark { width: 48px; height: 48px; }
            .segment-mark { font-size: 20px; }
            .segment-name,
            .platform-name { font-size: 18px; }
            .segment-meta,
            .platform-meta,
            .seg-platform-meta {
              white-space: normal;
              row-gap: 5px;
            }
            .segment-totals .stat-n,
            .platform-totals .stat-n { font-size: 18px; }
            .seg-platform-name { font-size: 15px; }
            .seg-platform-mark { width: 34px; height: 34px; }
            .campaign-head {
              align-items: flex-start;
              flex-direction: column;
              gap: 5px;
            }
            .campaign-name { font-size: 16px; }
            .lane { gap: 10px; padding-bottom: 14px; }
            .creative { width: 220px; }
          }

          /* ── Footer ──────────────────────────────────────────────────────── */
          .footer {
            max-width: 1800px; margin: 0 auto; padding: 28px;
            color: var(--ink-3); font-size: 11px;
            font-family: var(--mono);
            display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid var(--line);
            gap: 24px; flex-wrap: wrap;
          }
          .footer-tag {
            font-family: var(--mono); color: var(--ink-3);
            font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase;
          }
        ` }} />
      </head>
      <body>
        {children}
        {/* Reset every lane's scroll position to 0 after the browser's initial
            layout pass. scroll-snap-type causes Chrome to auto-scroll to the
            first snap target on load (scrollLeft = padding-left), which clips
            the first card. Two rAF calls ensure this runs after snap settles. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function resetLanes() {
              document.querySelectorAll('.lane').forEach(function(l) {
                l.scrollLeft = 0;
              });
            }
            requestAnimationFrame(function() {
              requestAnimationFrame(resetLanes);
            });
          })();
        ` }} />
      </body>
    </html>
  )
}
