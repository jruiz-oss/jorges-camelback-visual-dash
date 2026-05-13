import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ad Dashboard',
  description: 'Active ad visual dashboard',
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

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1e293b;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;

            /* Depth without drama: a soft indigo glow at the very top fades
               into a quiet slate gradient. background-attachment:fixed keeps
               the wash steady while content scrolls. */
            background:
              radial-gradient(1100px 520px at 50% -160px, rgba(99, 102, 241, .10), transparent 65%),
              radial-gradient(900px 460px at 100% 0%, rgba(56, 189, 248, .06), transparent 60%),
              linear-gradient(180deg, #f8fafc 0%, #eef2f7 60%, #e7ecf3 100%);
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
