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
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // Allow Meta's preview_iframe.php to load inside our iframe elements.
            // 'self' keeps everything else locked down.
            key: 'Content-Security-Policy',
            value: "frame-src 'self' https://www.facebook.com https://staticxx.facebook.com;",
          },
        ],
      },
    ]
  },
}

export default nextConfig
