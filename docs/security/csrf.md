# CSRF defense

> **Status:** Stage 1 — Origin header check
> **Phase:** R162-security

## Threat model

Cross-Site Request Forgery: malicious site causes user's authenticated browser to
make a state-changing request to Labyra. Without defense, the session cookie or
Bearer token (if leaked via XSS) could be replayed.

## Stage 1 — Origin check

Modern browsers send `Origin` header on all cross-origin requests AND on all
same-origin mutations (POST/PUT/PATCH/DELETE) per Fetch spec.

`src/middleware.ts` matches all `/api/*` mutation requests and checks the Origin
header against an allowlist:
- Production domain
- Vercel preview deployments (regex `labyra-app-*.vercel.app`)
- localhost dev ports

Mismatch returns 403 `forbidden_origin`.

## Bypass cases (documented)

- **Webhooks** (`/api/webhooks/*`) — verified by HMAC signature, not Origin
- **GET requests** — read-only, no CSRF risk
- **Bearer token from server-to-server** — no browser involvement, no Origin header
  → currently rejected; if needed for ML pipelines, add `/api/internal/*` matcher

## Stage 3 — Double-submit token

When enterprise customer requires SOC2/SAML compliance:
1. Issue CSRF token in cookie (sameSite=Strict, not HttpOnly)
2. Client reads cookie, echoes in `X-CSRF-Token` header on mutations
3. Middleware verifies cookie value === header value
4. Rotate token on auth state change

Reference: OWASP CSRF Prevention Cheat Sheet — Double Submit Cookie pattern.
