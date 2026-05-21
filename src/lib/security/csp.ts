/**
 * Content-Security-Policy builder. Single source of truth.
 *
 * R191-1: moved from next.config.ts (static headers can't carry a
 * per-request nonce). proxy.ts generates a nonce per request and calls this.
 * script-src drops 'unsafe-inline' + 'unsafe-eval' in prod (nonce +
 * strict-dynamic). style-src keeps 'unsafe-inline' (Tailwind/shadcn runtime
 * styles; see ADR-031). Dev keeps eval/inline for Turbopack HMR.
 *
 * @see docs/adr/ADR-031-nonce-csp.md
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.firebaseapp.com https://apis.google.com"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://*.firebaseapp.com https://apis.google.com`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://storage.googleapis.com",
    "font-src 'self'",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
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
      'https://*.run.app'
    ].join(' '),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
    'report-uri /api/csp-report'
  ].join('; ');
}
