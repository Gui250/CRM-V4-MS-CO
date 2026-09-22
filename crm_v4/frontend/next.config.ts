import type { NextConfig } from 'next'

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3333'

const nextConfig: NextConfig = {
  // Compression buffers the proxied text/event-stream and delays realtime events.
  compress: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }]
  },
}

export default nextConfig
