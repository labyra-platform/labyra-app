# Architecture Decision Records (ADR)

> Append-only log of significant architectural decisions.
> Each entry: Context, Decision, Consequences, Alternatives considered.
> Format inspired by Michael Nygard's ADR template.

---

## ADR-001: Use TypeScript ESM throughout

**Date**: 2026-04 (R71-72 LabBook migration)
**Status**: Accepted

**Context**: Started as monolithic HTML+JS. Type safety + module system needed for scale.

**Decision**: TypeScript with ESM (`type: module` in package.json). Vite build for LabBook BKU, Next.js for Labyra-app.

**Consequences**:
- All new code in `.ts` / `.tsx`
- `import` syntax everywhere (no CommonJS `require`)
- Stricter type discipline, slower initial dev velocity, faster long-term

**Alternatives**: JavaScript with JSDoc types (rejected: insufficient for refactor confidence), CommonJS (rejected: Node ESM is future).

---

## ADR-002: Multi-tenant via path prefix `/tenants/{tid}/`

**Date**: 2026-05 (Phase B.5 R150-R156g)
**Status**: Accepted, foundational

**Context**: SaaS direction requires tenant isolation. Choice: shared DB with tenantId filter, separate DBs, or path-based.

**Decision**: Path-based isolation. All tenant data lives under `/tenants/{tenantId}/...` in Firestore. Pinecone uses `namespace = tenantId`. Storage uses `papers/{tenantId}/` prefix.

**Consequences**:
- Firestore security rules trivially express tenant isolation
- Cost per tenant clearly attributable
- GDPR deletion: one path delete handles tenant offboarding
- Cross-tenant analytics requires aggregation layer (BigQuery export future)

**Alternatives**:
- Shared collections with `tenantId` field filter (rejected: error-prone, easy to forget filter, security rules complex)
- Separate Firestore projects per tenant (rejected: doesn't scale, billing nightmare)

---

## ADR-003: Provider abstraction for LLMs

**Date**: 2026-05-12 (R160-ai-3a)
**Status**: Accepted

**Context**: Multiple LLM providers needed for tier dispatch (cheap T1 vs expensive T3) and vendor risk mitigation.

**Decision**: Define `LLMProvider` interface. Implementations: `AnthropicProvider`, `GeminiProvider`. Selected per tier via `selectProvider(tier)`.

**Consequences**:
- Easy to add OpenAI, Mistral chat, etc. by implementing interface
- Tier dispatcher (Haiku classifier) selects model independently of business logic
- Cost calculation centralized per provider

**Alternatives**:
- Single provider (Anthropic only): rejected — vendor lock-in, no cheap tier option
- LangChain abstraction: rejected — too much overhead, complex types

---

## ADR-004: Tier-based routing with 20/60/20 distribution

**Date**: 2026-05-12 (R160-ai-3b)
**Status**: Accepted

**Context**: Cost optimization without sacrificing quality. Most queries are simple lookups (cheap T1), few are complex synthesis (expensive T3).

**Decision**: Haiku 4.5 classifier routes each query to T1 (Gemini Flash, $0.075/M), T2 (Sonnet, $3/M), or T3 (Opus, $15/M). Target distribution: 20% T1, 60% T2, 20% T3.

**Consequences**:
- Avg cost per query ~$0.005 vs ~$0.05 if Opus-default
- Classifier itself costs ~$0.0007/query (Haiku is cheap)
- T1 has tool calling for lab data lookups
- T3 has reflection layer (ai-4)

**Alternatives**:
- User-selected model: rejected (most users don't know which to pick)
- Always-Sonnet: rejected (T1 cases waste money, T3 cases lose quality)
- Pure heuristic routing: rejected (Haiku classifier more accurate)

---

## ADR-005: Mistral OCR over Chandra for paper processing

**Date**: 2026-05-12 (R160-ai-5a)
**Status**: Accepted

**Context**: Original AI_ARCHITECTURE planned Chandra OCR. Reassessed for cost + accuracy.

**Decision**: Use Mistral OCR 3 as default. Implement via `OcrProvider` interface for future swap-ability.

**Consequences**:
- 97% cost savings ($1 vs $65/1000 pages Textract baseline)
- Better scientific paper accuracy (96.6% on tables, native LaTeX)
- Better multilingual support (Vietnamese papers)
- Interface preserves migration to on-prem (enterprise data residency)

**Alternatives**:
- Chandra (rejected: cost, unknown scientific benchmarks)
- AWS Textract (rejected: 84.8% tables, expensive)
- Tesseract self-host (rejected: 75% accuracy, poor LaTeX)

---

## ADR-006: Pinecone over Firestore Vector Search

**Date**: 2026-05-12 (R160-ai-5a)
**Status**: Accepted

**Context**: Original plan was Firestore Vector Search (native). Reassessed for multi-tenant SaaS scale.

**Decision**: Pinecone Serverless with one namespace per tenant.

**Consequences**:
- Multi-tenant query cost: 1 RU per 1 GB (vs 100 RU for metadata filter on 100 tenants in Firestore Vector)
- Physical isolation per tenant (offboarding = delete namespace, instant)
- Built-in rerank via Pinecone Inference (future option)
- Vendor adds $50/m baseline (Starter free for now)
- Migration complexity if abandoning later

**Alternatives**:
- Firestore Vector Search (rejected: beta, no rerank integration, weak multi-tenant)
- Qdrant self-hosted (rejected: ops overhead pre-PMF)
- pgvector + Supabase (rejected: would require new DB)

---

## ADR-007: Stage 1 in-process queue for paper pipeline (not Cloud Run + PubSub)

**Date**: 2026-05-12 (R160-ai-5b planning)
**Status**: Accepted

**Context**: User initially asked for "full enterprise-grade" pipeline with Cloud Run + PubSub + observability. Strategy doc review flagged this as overengineering pre-PMF (< 10 papers/day, 20+ planned but not active users).

**Decision**: Stage 1 simple monolith. In-process async with `InProcessQueue`. `JobQueue` interface scaffolds future `PubSubQueue` swap.

**Consequences**:
- Ship time: 2 sessions vs 6-7 sessions
- Zero additional infrastructure cost
- Single deployment, simpler debugging
- Migration when justified: ~600 LOC, business logic unchanged
- Risk: if traffic explodes, must migrate quickly (mitigated by interface scaffolding)

**Alternatives**:
- Full Cloud Run + PubSub now (rejected: premature optimization, strategy doc cites this as "single biggest strategic danger")
- No queue interface at all (rejected: painful refactor when migrating)

---

## ADR-008: Governance layer (quota + cost tracking) from Stage 1

**Date**: 2026-05-12 (R160-ai-5b planning)
**Status**: Accepted

**Context**: Strategy doc identifies "AI cost explosion" as CRITICAL risk. Tenant quotas needed before launch.

**Decision**: Build `governance/quota.ts` + `governance/tiers.ts` in ai-5b-1. Enforce on every operation (upload, embed, reason). Tiers: Free $0 / Starter $29 / Pro $99 / Enterprise custom.

**Consequences**:
- ~200 LOC cost in ai-5b-1
- Safe to launch with public pricing later
- Cost transparency per tenant from day 1
- Soft caps (90%) + hard caps (100% returns HTTP 429)

**Alternatives**:
- Defer governance to "later" (rejected: launch-blocker if abused, retrofit is harder)
- Hard-coded $5/m dev cap (rejected: doesn't match pricing model)

---

## ADR-009: Content-hash idempotency for papers

**Date**: 2026-05-12 (R160-ai-5b planning)
**Status**: Accepted

**Context**: User may re-upload same paper. Need dedup without forcing user to check first.

**Decision**: `paperId = SHA-256(pdf_bytes)`. Cross-version comparison via hash equality.

**Consequences**:
- Natural deduplication
- Re-upload short-circuits (skip processing if exists)
- Audit trail: same hash = same content
- Cross-tenant: same hash + different tenant = different doc path = no leakage

**Alternatives**:
- UUID paperId (rejected: no dedup)
- Filename-based (rejected: trivially defeated)

---

## How to add a new ADR

1. Append to this file (don't edit historical entries — append-only)
2. Number sequentially (ADR-NNN)
3. Date YYYY-MM-DD
4. Status: Accepted / Superseded by ADR-NNN / Rejected
5. Sections: Context, Decision, Consequences, Alternatives considered

---

## ADR-010: shadcn Form + Table mandatory for all UI

**Date**: 2026-05-13 (R160-data-1c)
**Status**: Accepted

**Context**: Initial CRUD pages (R160-data-1) used hand-rolled `<label>` + `<input>` + `<table>`
with hardcoded Vietnamese text. User feedback: inconsistent with rest of app, hard to enforce
accessibility, mixed Vietnamese/English in `/en` locale.

**Decision**: All forms MUST use shadcn `Form/FormField/FormItem/FormLabel/FormControl/FormMessage`
pattern. All tables MUST use shadcn `Table/TableHeader/TableBody/TableRow/TableHead/TableCell`.
Buttons wrapping `Link` use `Button asChild`.

**Consequences**:
- Accessibility (WCAG 2.2 AA) automatic via Radix UI primitives
- Validation errors render inline via `FormMessage` (no custom error UI)
- Forms feel professional, consistent with rest of app
- Slightly more verbose than raw HTML (but boilerplate is mechanical)

**Alternatives considered**:
- Headless UI + custom styling — rejected: more work, no a11y guarantee
- Mantine — rejected: would diverge from existing shadcn investments
- Keep hand-rolled — rejected: failed user expectation of "professional UI"

---

## ADR-011: Doc ID injection pattern `{...doc.data(), id: doc.id}`

**Date**: 2026-05-13 (R160-spectra-2 hotfix)
**Status**: Accepted

**Context**: Legacy Firestore documents (pre-R160) lack `id` field. When mapping
`snap.docs.map(d => d.data() as Entity)`, the resulting objects have `id: undefined`.
React then sees `<TableRow key={undefined}>` for all rows → "duplicate key" warning.

**Decision**: All Firestore query functions inject `doc.id` when reading data:
```typescript
snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Entity)
return { ...snap.data(), id: snap.id } as Entity;
```

**Consequences**:
- React keys always present, no warnings
- Legacy data continues to work without migration
- Field `id` in document body becomes redundant for new writes, but kept for type contract

**Alternatives considered**:
- Migration script to add `id` field to all legacy docs — rejected: more risk, requires
  one-time orchestration; defensive pattern preferred
- Skip `id` in interfaces, expose only at query layer — rejected: breaks contracts

---

## ADR-012: Stage 2 Phase 1 uses Firebase Storage (not native GCS bucket)

**Date**: 2026-05-13 (R160-spectra-1)
**Status**: Accepted, revisitable

**Context**: Database report (`docs/labyra-experiment-database-report.md`) prescribes
native GCS bucket with custom IAM for tenant isolation. Labyra already has Firebase Storage
configured (papers use it) with Admin SDK + storage.rules + Signed URLs.

**Decision**: Use Firebase Storage for Phase 1. Path convention follows the report
(`tenants/{tenantId}/spectra/{spectrumId}/...`). Tenant isolation via Firebase Storage rules
(declarative) instead of native GCS IAM conditions.

**Consequences**:
- Same GCS under the hood — no real architectural difference
- Faster to ship: ~1 day vs ~1 week native GCS setup
- Existing Admin SDK helpers reused (`getSignedUrl`, `getSignedDownloadUrl`)
- Migration to native GCS bucket possible later if multi-region or per-tenant bucket needed
  for compliance/sovereignty

**Alternatives considered**:
- Native GCS bucket with per-tenant IAM — rejected for Phase 1: 5x infra time, no immediate benefit
- Skip storage entirely, in-memory upload to Firestore — rejected: 1MB doc limit, doesn't scale

---

## ADR-013: 24 spectrum types in 6 groups, full taxonomy from day one

**Date**: 2026-05-13 (R160-spectra-1)
**Status**: Accepted

**Context**: Database report defines 24 spectrum types (XRD, SAED, HRTEM, UV-Vis, PL, Raman,
FTIR, CV, EIS, GCD, LSV, CA, PEC J-V, IPCE, EIS-light, XPS, EDS, BET, Contact Angle, SEM,
TEM, AFM, Optical microscopy) in 6 analyzer groups. Initial scope discussion: ship 6 common
types first vs full 24.

**Decision**: Ship full taxonomy from day one in `src/lib/spectra/config.ts` with per-type
config (acceptedExtensions, maxSizeBytes, defaultUnits, isImage). Type detection heuristic
from filename auto-suggests type in upload UI.

**Consequences**:
- No artificial limits: any materials science lab can upload their spectra
- i18n catalog has 24 type labels per locale (vi + en)
- Type-specific Phase 2 analyzers (pymatgen, lmfit, impedance.py) will be wired one at a time

**Alternatives considered**:
- 6 types Phase 1 (XRD, UV-Vis, Raman, FTIR, CV, EIS) — rejected: arbitrary cutoff,
  user said full 24 explicitly
- Single type POC (XRD only) — rejected: limits initial user value too much

---

## ADR-014: Anti-hallucination 7-layer architecture (L2 + L3 + L4 + L6 + L7)

**Date**: 2026-05-13 (R160-ai-5e-1/2)
**Status**: Accepted

**Context**: Original AI_ARCHITECTURE Section 6 specified 9 layers. Building all 9 not
practical for Phase 1. Need pragmatic subset that catches common hallucination patterns
(fabricated numbers, fake citations, off-topic engagement, empty-library invention).

**Decision**: Ship 5 layers from the 9-layer plan:
- **L2** Citation enforcement (sentence-level claim → require `[N]` marker)
- **L3** Numerical guard (regex extract → match vs retrieved chunks, with negation context)
- **L4** Rerank score threshold (0.5 cutoff → empty hits if all below)
- **L6** On-topic classifier (Haiku → polite refusal for off-topic)
- **L7** Empty result guard (system prompt rule + post-process)

L1 (input filtering), L5 (refusal training), L8 (provenance UI), L9 (cross-source verify)
remain deferred.

**Consequences**:
- 4/4 fake numerical claims caught in adversarial test
- Empty library queries properly refuse with hedged fallback
- Off-topic queries cost ~$0.0002/query (Haiku classifier) — affordable
- False positives exist on L2 (especially with quotes); accepted for recall

**Alternatives considered**:
- Ship all 9 layers — rejected: 4x effort for diminishing returns at current scale
- Skip post-process layers entirely, rely on system prompt — rejected: insufficient
  enforcement on numerical guard especially

---
