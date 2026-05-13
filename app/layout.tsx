import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ad Dashboard',
  description: 'Active ad visual dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f1f5f9;
            color: #1e293b;
            -webkit-font-smoothing: antialiased;
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
