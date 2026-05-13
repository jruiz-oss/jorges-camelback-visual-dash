import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Camelback Resort — Ad Dashboard',
  description: 'Active ad visual dashboard powered by Commit Agency',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inter is the single biggest "this feels like a real app" upgrade —
            loaded with preconnect for snappy first paint. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          html, body { min-height: 100%; }
          /* Smooth scroll for the in-page logo-jump nav. */
          html { scroll-behavior: smooth; }
          /* Sections offset their scroll position so jumps don't land
             underneath the sticky header. */
          section[id] { scroll-margin-top: 96px; }

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1e293b;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;

            /* Modern off-white. The previous slate+indigo gradient stack felt
               2021-SaaS; warm cream reads as premium and is what current apps
               (Notion, Mercury, Linear's light theme) lean on. Very subtle
               top→bottom shift gives the page just a touch of depth. */
            background: linear-gradient(180deg, #fbfaf7 0%, #f5f4ef 100%);
            background-attachment: fixed;
            background-repeat: no-repeat;
          }

          /* Card hover lift — subtle tactile feedback that says "this is
             interactive". Cheap on the GPU because transform + box-shadow only. */
          .ad-card {
            transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
            will-change: transform;
          }
          .ad-card:hover {
            transform: translateY(-2px);
            box-shadow:
              0 12px 24px rgba(15, 23, 42, .10),
              0 2px 6px rgba(15, 23, 42, .06);
            border-color: #cbd5e1;
          }

          /* Refresh button gets the same treatment so it feels alive on the
             sticky header. */
          .lift-on-hover {
            transition: transform .15s ease, box-shadow .15s ease;
          }
          .lift-on-hover:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 14px rgba(15, 23, 42, .10);
          }

          /* Platform jump buttons in the sticky nav — logo-only squares. */
          .platform-jump-btn {
            width: 36px; height: 36px;
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: 9px;
            background: #fafaf7;
            border: 1px solid #e5e7eb;
            color: #334155;
            cursor: pointer;
            text-decoration: none;
            transition: background .15s ease, border-color .15s ease, transform .15s ease;
          }
          .platform-jump-btn:hover {
            background: #ffffff;
            border-color: #cbd5e1;
            transform: translateY(-1px);
          }
          .platform-jump-btn:active {
            transform: translateY(0);
          }
          .platform-jump-btn--disabled {
            opacity: 0.32;
            cursor: not-allowed;
          }
          .platform-jump-btn--disabled:hover {
            background: #fafaf7;
            border-color: #e5e7eb;
            transform: none;
          }

          /* Thin, calm scrollbar for the per-campaign horizontal scroll rows.
             Firefox uses scrollbar-color / -width; WebKit needs the pseudo. */
          .campaign-scroll {
            scrollbar-width: thin;
            scrollbar-color: #cbd5e1 transparent;
          }
          .campaign-scroll::-webkit-scrollbar { height: 8px; }
          .campaign-scroll::-webkit-scrollbar-track { background: transparent; }
          .campaign-scroll::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 4px;
          }
          .campaign-scroll::-webkit-scrollbar-thumb:hover {
            background-color: #94a3b8;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
