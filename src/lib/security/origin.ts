import 'server-only';

/**
 * Origin allowlist for CSRF defense via Origin header check.
 *
 * Stage 1 approach per docs/labyra-strategy.md — simple equality check against
 * a fixed allowlist. Stage 3 (enterprise SOC2) will introduce double-submit
 * CSRF token in addition.
 *
 * Allowlist construction:
 *   - Production domain (NEXT_PUBLIC_SITE_URL env or hardcoded fallback)
 *   - Vercel preview domains (*.vercel.app) — wildcard match
 *   - localhost dev ports
 *
 * Origin header is set by all modern browsers on cross-origin POST. Same-origin
 * may omit Origin (some browsers do this for top-level GET); we only enforce on
 * mutations, where browsers always send Origin per Fetch spec.
 *
 * @phase R162-security
 */

const PRODUCTION_ORIGINS = [
  'https://labyra-app.vercel.app'
  // Future: 'https://app.labyra.com' once custom domain wired
];

const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];

const VERCEL_PREVIEW_RE = /^https:\/\/labyra-app-[a-z0-9-]+\.vercel\.app$/;

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (DEV_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;
  return false;
}

/** Mutation methods that require Origin check. */
export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
