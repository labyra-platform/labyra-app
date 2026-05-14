# Rate limiting

> **Status:** Stage 1 implementation
> **Phase:** R162-security
> **See also:** ADR-015 in `architecture-decisions.md`

## Why

Protect against:
- Cost-runaway attacks on AI endpoints (reanalyze, paper upload)
- Accidental client retry storms (network flakes)
- Single-tenant abuse degrading multi-tenant quality

## Stage 1 design — Firestore counters

Per `labyra-strategy.md`, Stage 1 forbids new infra dependencies (Redis, Upstash, PubSub).
Rate limit therefore uses a Firestore counter document per `(key, windowStart)` tuple.

**Path:** `_rate_limits/{key}`
**Schema:** `{ count: number, windowStart: number, expiresAt: Timestamp }`
**Cleanup:** Firestore TTL on `expiresAt` (set policy in console).
**Concurrency:** atomic via Firestore transaction.

### Current limits

| Route | Limit | Window | Key |
|---|---|---|---|
| POST /api/spectra/[id]/reanalyze | 5 | 60s | `reanalyze:{tenantId}` |
| POST /api/spectra/signed-upload | 30 | 60s | `signed-upload:{tenantId}` |
| POST /api/papers/upload | 30 | 60s | `paper-upload:{tenantId}` |

Other mutation routes are protected by:
- Per-month quota in `governance/quota.ts` (papers, embed tokens, reasoning tokens, $$$)
- Firebase Auth Bearer token requirement (no anonymous access)
- Origin check in `src/middleware.ts` (CSRF defense)

## Migration to Stage 2 (Upstash)

**Triggers** (any):
- 20+ active labs
- Documented abuse incident
- Vercel/Firestore latency > 200ms on rate-limit txns

**Migration steps:**
1. Add `@upstash/ratelimit` + `@upstash/redis` deps
2. Replace `src/lib/security/rate-limit.ts` body — keep `checkRateLimit()` signature
3. Provision Upstash Redis (free tier 10K/day → paid for scale)
4. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel env
5. No route changes required

**Cost comparison:**
- Stage 1 (Firestore): ~$0.06 per 100K rate-limit ops
- Stage 2 (Upstash): $0.20 per 100K, but no Firestore write contention

## Stage 3 (enterprise)

Add at SOC2/SAML stage:
- Per-IP rate limits (in addition to per-tenant)
- Rate limit dashboard for admins
- Distributed lock for cross-region (if multi-region deployed)
