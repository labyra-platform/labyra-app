# ADR-032: AI Scaling Strategy

**Status:** Accepted (consolidated R191-4, 2026-05-22).
**Scope:** How the 6-tier AI stack scales toward ~50 users and beyond, and which
upgrades/architectures are explicitly deferred or rejected.

## Context

The AI stack (ADR-019 tiers, ADR-020 cost controls, ADR-021 inter-tier
protocols) is in production. Several scaling questions recur; this ADR records
the decisions so they are not re-litigated each session.

## Decisions

### Rate limiting (toward ~50 users)
Gemini API quota is per GCP **project**, not per key. Splitting keys/projects
per tenant is an anti-pattern (operational sprawl, no real quota gain). Correct
direction as we approach ~50 users: raise GCP to Tier 2 (higher RPM) + keep the
app-level per-tenant rate limit (`_rate_limits`) + Cost Guard per-tenant cap.

### Retry / backoff (G-6, R191-3)
The @google/genai SDK retries transient errors (429 + 5xx) with exponential
backoff natively. We make it explicit and budget-aware rather than hand-rolling
a wrapper (which would stack on the SDK retry):
- `getClient()` constructor: `httpOptions { timeout: 20000, retryOptions:
  { attempts: 3 } }` (global default; fits fast complete()).
- `streamChat()` override: `httpOptions { timeout: 40000, retryOptions:
  { attempts: 2 } }` (T2 RAG ~25s; worst case stays within chat route
  maxDuration 60). Stream retries only initial connection; mid-stream drop is
  fatal (no token replay).
- Caveat: SDK ignores the 429 `retry_delay` hint and uses fixed backoff (known
  Google limitation). Acceptable at our scale.

### Deferred / rejected
- **Gemini 3.5 Flash for T0–T2**: deferred. ~3x cost; gemini-3-flash works fine.
  Revisit when 3.5 is GA on the Gemini API (currently -preview).
- **Per-tenant API key/project split**: rejected (see Rate limiting).
- **Agent auto-writing scientific analysis code**: rejected. Breaks
  reproducibility + the scientific-doc rule. The worker stays deterministic.
- **Interactions API / Managed Agents (v3.5 deck)**: mostly defer; beta = risk.

### Region (cross-ref ADR-033)
Vercel function region = `sin1` (co-located with Firestore asia-southeast1). Do
not move to US — N+1 Firestore would cross continents.

## Consequences

- Retry is now explicit and bounded; a hung Gemini call fails fast + retries
  instead of holding the function to maxDuration.
- The scaling posture is documented in one place; future sessions extend this
  ADR by appending rather than re-deciding.
