/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow ad image domains from each platform
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.facebook.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'googleads.g.doubleclick.net' },
      { protocol: 'https', hostname: '**.stackadapt.com' },
      { protocol: 'https', hostname: '**.stackadapt-static.com' },
    ],
  },
  async headers() {
    // Security headers applied to every response. CSP is intentionally
    // permissive on script-src / style-src because Next.js injects a runtime
    // bootstrap and we inline the design-system CSS in app/layout.tsx — both
    // require `unsafe-inline`. img-src / frame-src are scoped to only the
    // platforms our connectors actually return assets from.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      // Next.js needs unsafe-inline (runtime bootstrap) and unsafe-eval (HMR / Next internals).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Inline styles in app/layout.tsx + Google Fonts.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Images: own origin, data/blob, and every CDN connectors return.
      "img-src 'self' data: blob: https://*.fbcdn.net https://*.facebook.com https://storage.googleapis.com https://googleads.g.doubleclick.net https://*.stackadapt.com https://*.stackadapt-static.com",
      // Meta video MP4s stream from fbcdn.
      "media-src 'self' https://*.fbcdn.net",
      // Meta preview iframes.
      "frame-src 'self' https://www.facebook.com https://staticxx.facebook.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',   value: csp },
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          // 1y HSTS — only honored over HTTPS, which Vercel terminates for us.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
