# ADR-032 — AI Scaling, Rate-Limit Strategy & v3.5 Architecture Evaluation

**Status**: Accepted
**Date**: 2026-05-21 (R187)
**Context**: Founder asked how to scale to ~50 users without API failure, whether
to split API keys/projects per tenant, and whether to adopt the "Labyra Evolution
v3.5" deck (Google Managed Agents + Gemini 3.5 Flash + Managed Sandbox).

---

## Decision 1 — Gemini rate-limit scaling

**Verified fact (2026-05-21 web search)**: Gemini API quota is enforced **per Google
Cloud project**, NOT per API key. Multiple keys in one project share one quota pool.
Tiers: Free 5-15 RPM; Tier 1 (billing on) 150-300 RPM; Tier 2 ($250 cumulative spend
+30d) 1,000+ RPM; Tier 3 4,000+ RPM.

**Rejected**: splitting API key or GCP project per tenant.
- Per-key: useless (shared quota).
- Per-project: operational nightmare at scale (N billing accounts, N service accounts,
  each restarts at Tier 1). Anti-pattern (cf. "no premature microservices").

**Accepted scaling path** (when approaching ~50 users):
1. Keep ONE GCP project; upgrade to **Tier 2** (1,000+ RPM) — covers 50-200 users.
   (50 users × ~2 q/min × ~2.5 tier-calls ≈ 250 RPM peak → Tier 1's 300 bottlenecks,
   Tier 2 comfortable.)
2. **App-level per-tenant rate limit** — already built (`_rate_limits` Firestore).
   Ensures fair quota split, prevents one tenant starving others.
3. **Cost Guard cap per tenant** — already built (Cost Guard v2, 4-gate). THIS is the
   correct meaning of "split cost per tenant": at the telemetry/quota layer, NOT the
   API-key layer.
4. **TODO**: add 429 retry with exponential backoff to Gemini client
   (`src/lib/ai/providers/gemini.ts` only has a single bare catch). Protects against
   transient RESOURCE_EXHAUSTED at peak.

## Decision 2 — Gemini 3.5 Flash adoption (T0-T2)

**Deferred**. Gemini 3.5 Flash ($1.50/$9.00) is ~3x Gemini 3 Flash ($0.50/$3.00).
Current 3-flash-preview works well for T0-T2. Cost matters more than marginal quality
gain at current scale. Re-evaluate when GA on Gemini API (currently -preview; GA only
on Vertex AI) OR if metadata/tool quality issues appear. CAPABILITY_MAP makes the swap
a one-file change. Note: param `thinking_budget`(int) → `thinking_level`(enum: minimal/
low/medium/high) in 3.5.

## Decision 3 — v3.5 deck (Managed Agents / Interactions API / Managed Sandbox)

**Mostly rejected / deferred.** Evaluation:

- **Interactions API + Managed Agents** (replace Route Handlers, Layer B): beta,
  "rolling out in coming weeks" at I/O 2026. DEFER — building the core tier/tool loop
  on a beta API risks breaking changes + deep Google lock-in + loss of the pipeline
  control we just used to fix the tool_timeout bug.

- **Managed Sandbox auto-writes Python for XRD/spectral analysis** (deck slide 4):
  **REJECTED**. Violates two founder principles:
  (a) Scientific reproducibility — current worker is deterministic + documented
      (`docs/scientific-methods/*.md`: Scherrer, profile fitting, DOI refs). Agent
      auto-generating analysis code each run = non-reproducible, unacceptable for
      research (thesis/publication).
  (b) Scientific-documentation rule — auto-generated code has no documented method/
      DOI. Risk of silent scientific error (wrong fit model, baseline, units).
  **Boundary**: AI may ORCHESTRATE (call verified analysis tools), must NOT author
  scientific method logic. Keep worker deterministic.

- **-65% Cloud Run / -4x latency** claims: unsourced projections, not measured. Ignore
  marketing numbers.

**Accepted from deck**: nothing for now. The current architecture (self-controlled
pipeline + deterministic documented worker + CAPABILITY_MAP abstraction) is more robust
for a lab platform requiring scientific trust. Model staleness is cheap to fix (one
CAPABILITY_MAP line); a beta-API + non-reproducible-analysis rewrite is not.

---

## Consequences
- Scaling is a billing-tier + app-layer concern, already 80% built. No re-architecture.
- Worker stays the scientific source of truth (deterministic, documented).
- Revisit Gemini 3.5 + Interactions API when GA + measured need exists.

---

## Status update R191-3 (2026-05-22) — Decision 1 item 4 (retry) DONE

The "TODO: add 429 retry with exponential backoff" under Decision 1 is now
implemented (G-6). The @google/genai SDK retries 429/5xx natively with
exponential backoff; we made it explicit and budget-aware rather than
hand-rolling a wrapper (which would stack on the SDK's own retry):

- `getClient()` constructor: `httpOptions { timeout: 20000, retryOptions:
  { attempts: 3 } }` (global default; fits fast complete()).
- `streamChat()` per-request override: `httpOptions { timeout: 40000,
  retryOptions: { attempts: 2 } }` — T2 RAG is legitimately ~25s, so a longer
  timeout with fewer attempts keeps the worst case within the chat route's
  `maxDuration = 60`. Stream retries only the initial connection (a mid-stream
  drop stays fatal — no token replay).

Caveat: on a 429 the API returns a suggested `retry_delay`, but the SDK ignores
it and uses fixed exponential backoff (known Google limitation). Acceptable at
≤50 users. `@google/genai` 2.3.0 types expose only `attempts` in
HttpRetryOptions; richer fields exist at runtime but are omitted to stay
type-clean.

