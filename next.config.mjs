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
}

export default nextConfig
