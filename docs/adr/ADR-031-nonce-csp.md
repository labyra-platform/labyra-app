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

---

## Addendum R191-2 (2026-05-22) — Plotly inline style is expected, not a blocker

During R191-1 burn-in, the spectra route logs a CSP violation:

> Executing inline script violates ... 'script-src' ... at spectra:8
> hash sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk=

Investigation (Plotly issues #2355, #4585; PR #7109): this is Plotly.js's
internal `addStyleRule` injecting **inline CSS**, not an executing script. It is
covered by our `style-src 'unsafe-inline'` and is harmless — Plotly's
maintainers confirm the same styles are already shipped in `plotly.css`, so
charts render even if the inline style were blocked. The DevTools Console shows
**No errors** (no real script-src / unsafe-eval violation); zod jitless removed
the only genuine eval source.

**Decision:** accept as-is. No fix needed. When flipping CSP Report-Only ->
enforce (domain batch), this Plotly inline-style report is expected and does NOT
block charts because `style-src` keeps `'unsafe-inline'`. Do not mistake it for a
regression.

Plotly + strict script-src caveat (for the future): the basic react-plotly.js
charts we use do not require 'unsafe-eval'. Avoid eval-dependent Plotly methods
(e.g. `Plotly.d3.csv`) so script-src can stay nonce-only. If full style-src
tightening is ever pursued, import `plotly.css` explicitly and drop the runtime
addStyleRule path (see PR #7109) — out of scope now.

