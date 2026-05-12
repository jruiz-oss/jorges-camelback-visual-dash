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
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
