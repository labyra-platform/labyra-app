# ADR-025: Paper Domain Auto-Classification (Taxonomy v1)

<!-- R178-3-docs-2026-05-18 -->
<!-- @r178-3-applied -->

**Status**: Accepted
**Date**: 2026-05-18
**Phase**: R178-3

---

## Context

Papers indexed in Labyra accumulate without categorization. Users searching
their library lose retrieval precision because:
- A "WO3 photocatalysis paper" and a "battery cathode XRD study" both return
  for any general query
- AI Assistant scope panel (R178-2) only supports per-paper select — no
  domain-level scope (e.g., "all my photocatalysis papers")
- Filter UX on Papers list has no axis besides confidence (R166)

NotebookLM-style multi-paper RAG (R178-2) demonstrated that scoping by paper
ID improves response quality. The natural next step is **scoping by domain
class** for users with larger libraries (50+ papers) where per-paper select
becomes tedious.

Auto-classification at index time costs ~$0.001/paper, matches the "uy tín
> coverage" principle (verifiable categories with audit trail), and enables
filter UX without manual labeling burden.

## Decision

**Add Step 1d auto-classify to worker pipeline.** After metadata extract
(Step 1b) and book detect (Step 1c), classify paper into taxonomy v1 (36
categories, 4 axes). Persist to `Paper.domain` (primary), `Paper.subtopics`
(0-4), `Paper.domainConfidence`, plus audit log.

### Why now

- R177-1 already migrated metadata extract to Gemini 3 Flash → same infra
- R178-2 multi-paper RAG raised value of domain-level scoping
- Cost trivial (~$0.30/300 papers/tenant/month)

### Why these 36 categories

Materials science is multi-disciplinary. Flat enum forces false dichotomies
("is this photocatalysis OR metal_oxides?"). 2-tier with 4 axes captures
real paper topology:
- **APPLICATION** (13) — dominant use case
- **MATERIALS_CLASS** (9) — material studied (orthogonal to use case)
- **SYNTHESIS** (6) — how made (rarely primary scope)
- **CHARACTERIZATION** (5) — methods focused on
- **META** (3) — non-research types (review, perspective, unknown)

Primary = 25 (App ∪ Mat ∪ Meta); subtopics = 20 (Mat ∪ Syn ∪ Char).

### Why fixed (not per-tenant customizable)

Per-tenant taxonomy adds complexity (per-tenant validators, migration cost)
without proven demand. Defer to R180+ if 2+ tenants explicitly request.

Trade: tenants with niche fields get less precise classification → fallback
`primary='unknown'` acceptable for v1.

### Why inline Step 1d (vs background job)

Atomic pipeline, no extra Pub/Sub topic, no orphan jobs. Cost overhead
negligible (+500ms latency, +$0.001/paper). Background queue doesn't reduce
risk — Gemini surface is the same.

### Why audit log `_audit_classify`

Recording `modelVersion + promptVersion + taxonomyVersion` enables:
- Forensic debug ("which model returned this?")
- Migration planning when bumping versions
- Compliance (audit-loggable AI decisions)
- Cost reconciliation per feature

Pattern mirrors ADR-024 Layer 1 (write-time audit). Layer 2/3 deferred —
classify audit accumulates linearly (~$5 storage/100k papers/year).

## Consequences

### Positive

- Filter UX on Papers list (Phase 3b)
- Domain badge on paper detail page
- Foundation for R179+ domain-scoped AI chat
- Audit-loggable AI classification
- Predictable cost (~$5/active lab/month)
- Reclassify path designed for future taxonomy v2

### Negative

- +1 Gemini dependency per paper (failure → graceful `unknown` fallback)
- +500ms upload→ready latency (acceptable; pipeline already async)
- 36 i18n labels × 2 languages = 72 keys
- Quality depends on Gemini Flash — qualitative tune if reclassify rate >10%

### Operational risks

- **Gemini quota at scale**: monitor + upgrade tier when active
- **Prompt injection**: mitigated by Pydantic enum + truncate + thinking_budget=0
- **Taxonomy drift**: `modelVersion` audit catches; `PROMPT_VERSION` bump
  triggers reclassify

## Alternatives considered

### Alt 1: Flat enum (~15 categories)

Rejected. Loses "photocatalysis using XRD" query — forces composite labels
that balloon taxonomy.

### Alt 2: Background Pub/Sub classify job

Rejected. Adds topic + subscription + race condition (UI shows
'Unclassified' temporarily). Inline is atomic and equally secure.

### Alt 3: Lazy on-demand classify

Rejected. First-filter UX latency ~2s. Creates sparse coverage — papers
never filtered stay unclassified, defeating filter-as-discovery.

### Alt 4: Per-tenant customizable taxonomy

Deferred to R180+. Premature without user demand. Designed to extend via
`tenants/{tid}/_taxonomy_overrides` subcollection.

### Alt 5: Embedding-based clustering

Rejected. Unstable labels (cluster IDs change on retrain), not
human-readable, no axis structure. LLM gives stable slugs + audit + extend.

## Implementation phases

- **R178-3a** (worker): `_taxonomy.py` + `classify.py` + `types.py` ext +
  orchestrator Step 1d + 16 tests + config settings
- **R178-3b** (app): `Paper` schema ext + `taxonomy.ts` + filter chips +
  badge + list integration + backfill + i18n keys
- **R178-3c** (docs): scientific-methods doc + this ADR

## Future revisit triggers

- Reclassify rate > 10% (taxonomy gaps or Gemini drift)
- 2+ tenants request taxonomy customization
- New axes needed (e.g., experimental vs computational)
- Taxonomy v2 migration (bump PROMPT_VERSION + taxonomyVersion)
- Per-paper confidence threshold for "auto-accept vs flag for review"
