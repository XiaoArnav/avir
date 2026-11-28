import type { NextConfig } from 'next';

const securityHeaders = [
  // 1. Prevent MIME-sniffing
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // 2. Prevent clickjacking / frame embedding
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // 3. Strict Referrer Policy
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // 4. Permissions-Policy: Restrict camera, mic; allow local geolocation only
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=()',
  },
  // 5. Strict Transport Security (HSTS) - 2 years + subdomains + preload
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // 6. X-DNS-Prefetch-Control
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  // 7. Content-Security-Policy: Tailored for Next.js, SVG charts, and telemetry sources
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.openstreetmap.org https://*.tile.openstreetmap.org https://images.unsplash.com https://*.arcgisonline.com https://services.arcgisonline.com https://wvs.earthdata.nasa.gov https://gibs.earthdata.nasa.gov",
      "connect-src 'self' https://*.open-meteo.com https://api.openaq.org https://airquality.cpcb.gov.in https://data.sensor.community https://generativelanguage.googleapis.com https://va.vercel-scripts.com https://*.arcgisonline.com https://services.arcgisonline.com https://*.openstreetmap.org https://*.tile.openstreetmap.org https://terrain.reearth.land https://gibs.earthdata.nasa.gov https://wvs.earthdata.nasa.gov",
      "worker-src 'self' blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]
      .join('; ')
      .trim(),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // Security: Do not advertise X-Powered-By: Next.js
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@spz-loader/core': false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
