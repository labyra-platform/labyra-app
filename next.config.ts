import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import withBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    // L2: trimmed to actually-used origins only (removed slingacademy, clerk template leftovers)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist', 'react-pdf'],
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false
  },
  // R179-7b @r179-7-applied: pdfjs-dist requires canvas alias = false in browser
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false
    };
    return config;
  },

  // H1: Security headers — Mozilla Observatory target A (85+/100)
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    return [
      {
        // PERF-12: global immutable read — long cache + SWR.
        source: '/api/material-profiles/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
          }
        ]
      },
      {
        source: '/(.*)',
        headers: [
          // Clickjacking protection
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // MIME sniffing protection
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer policy — don't leak path to external sites
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions policy — disable unused browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // COOP: allow-popups required for Firebase signInWithPopup callback
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          // HSTS — 1 year, includeSubDomains (preload ready for custom domain)
          // vercel.app: score boost even without preload
          ...(!isDev
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
          // R191-1: CSP moved to src/proxy.ts (per-request nonce can't live in
          // a static header). Policy: src/lib/security/csp.ts. See ADR-031.
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const analyzeBundle = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default analyzeBundle(withNextIntl(nextConfig));