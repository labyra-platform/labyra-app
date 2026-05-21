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
          // CSP — allowlist Firebase + self
          // connect-src: Firestore/Auth/Storage (client-side SDK)
          // Anthropic/Voyage/Pinecone = server-only → không cần ở đây
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              // Scripts: self + Next.js inline eval (dev HMR) + Firebase compat
              isDev
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.firebaseapp.com https://apis.google.com"
                : "script-src 'self' 'unsafe-inline' https://*.firebaseapp.com https://apis.google.com",
              // Styles: self + inline (shadcn/Tailwind inject inline styles)
              "style-src 'self' 'unsafe-inline'",
              // Images: self + data URIs (charts) + Storage signed URLs
              "img-src 'self' data: blob: https://storage.googleapis.com",
              // Fonts: self
              "font-src 'self'",
              // Frames: none
              "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
              // Connect: Firebase Auth/Firestore/Storage + self API
              [
                "connect-src 'self'",
                'https://*.googleapis.com',
                'https://*.firebaseio.com',
                'https://*.firebasedatabase.app',
                'https://firestore.googleapis.com',
                'https://identitytoolkit.googleapis.com',
                'https://securetoken.googleapis.com',
                'https://storage.googleapis.com',
                'https://labyra-app-dev.firebaseapp.com',
                // Pub/Sub + Cloud Run (CSIE trigger từ client nếu có)
                'https://*.run.app',
              ].join(' '),
              // Workers: blob (pdf.js worker)
              "worker-src 'self' blob:",
              // Object/media: none
              "object-src 'none'",
              // Base URI: self only
              "base-uri 'self'",
              // Form action: self only
              "form-action 'self'",
              // Upgrade insecure requests in prod
              ...(!isDev ? ['upgrade-insecure-requests'] : []),
              'report-uri /api/csp-report',
            ].join('; '),
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const analyzeBundle = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default analyzeBundle(withNextIntl(nextConfig));