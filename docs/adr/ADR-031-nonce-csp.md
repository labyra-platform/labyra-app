# ADR-031: Nonce-based Content-Security-Policy

**Status:** Accepted (R191-1, 2026-05-22) — Report-Only; enforce deferred.
**Supersedes:** static CSP-Report-Only header in next.config.ts (H1).

## Context

Pre-R191 CSP was a static header relying on script-src 'unsafe-inline'
'unsafe-eval'. 'unsafe-inline' is a major XSS hole; 'unsafe-eval' was
additionally triggered by zod v4's JIT compiler (src/v4/core/doc.ts ->
new Function), violating CSP on every form route. A static header cannot
carry a per-request nonce.

## Decision

1. CSP moves to middleware (src/proxy.ts). Per-request nonce
   (btoa(crypto.randomUUID()), Edge-safe) set on request.headers as
   x-nonce before handleI18nRouting — next-intl@4.12 forwards request
   headers, so Next SSR reads the nonce. A withCsp() closure attaches the
   policy to every response branch. Body: src/lib/security/csp.ts.
2. script-src: 'self' 'nonce-<n>' 'strict-dynamic' in prod — no
   unsafe-inline, no unsafe-eval. Dev keeps both for Turbopack HMR.
3. zod jitless: nonce does not rescue eval. A nonce'd inline script in
   the root <head> sets globalThis.__zod_globalConfig.jitless=true before
   any bundle loads. Validation correctness unchanged.
4. style-src keeps 'unsafe-inline' (Tailwind/shadcn runtime styles; also
   avoids next/image inline-style breakage). Mozilla still grades A.

## Deferred (domain-activation batch)

- Flip Report-Only -> enforce after 7-day burn-in on app.labyra.io.
- HSTS preload + hstspreload.org submission.
- Evaluate report-to alongside report-uri.

## Consequences

- All routes already dynamic (RootLayout reads cookies()) -> nonce costs
  no static rendering. Next 16.2.6 patched for CVE-2025-29927.
- Report-Only during burn-in: a nonce mismatch only logs, never blanks a
  page. Verify on preview (view-source nonce == header nonce; clean
  console) before flipping enforce.
