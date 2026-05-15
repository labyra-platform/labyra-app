# Changelog

<!-- R167-D-2026-05-15 -->

## R167-D — Anti-hallucination doc reconciliation + L8 priority bump (2026-05-15)

### Changed

- `docs/ai/AI_ARCHITECTURE.md`:
  - Section 6 marked as original design spec, pointer to Section 25 + 27
  - Section 25 marked with L6/L7 redefinition notice (original semantics ≠ Section 25 semantics)
  - **NEW Section 27** — Single source of truth checklist for 9-layer implementation status with sub-tasks and re-audit triggers
- `ROADMAP.md` — L8 Ragas eval dashboard bumped to Active priority with checklist

### Decisions

- **L2 status corrected**: from "partial" → "shipped". Homegrown citation-check.ts is decision divergence from Anthropic Citations API spec, not partial implementation.
- **L6/L7 redefinition acknowledged**: Section 25 redefined L6 (on-topic) and L7 (empty result guard) with different semantics from original Section 6 (cross-source / OOD). Original L6/L7 remain unimplemented. Section 27 makes this explicit to avoid future confusion.
- **L8 priority bump**: required before adding any new layer (regression detection). No code changes — doc only.

### Audit baseline

- 6/9 fully shipped: L1, L2, L3, L4, L6-redefined, L7-redefined
- 1/9 partial: L5 (sufficiency only, not unsupported claims)
- 3/9 missing: L6-original (cross-source), L7-original (full OOD), L8 (eval), L9 (HITL+Lab Memory)

### Tech debt deferred (tracked in Section 27 but not Active)

- L5 upgrade — unsupported claims detection
- L6 original — cross-source verification
- L7 original — full OOD detection
- L2 upgrade — Anthropic Citations API native
- L4 upgrade — full CRAG 3-tier
- L9 — HITL Verify + Lab Memory (depends Phase B.6+)

---


## R167 — Async Cloud Run Worker (2026-05-15)

### Shipped (13 patches: R167-A through R167-C2)

**Worker (labyra-spectra-worker, Python Cloud Run):**

- `src/papers/` module — 18 files implementing full pipeline mirroring TS orchestrator
- Pipeline steps: OCR (Mistral) → Metadata (Haiku) → Chunking → Enriching (Haiku, OFF by default) → Embedding (Voyage) → Indexing (Firestore + Pinecone) → Citation Extraction (Crossref/OpenAlex)
- Pydantic types mirror labyra-app TS schemas (`PaperJob`, `PaperDoc`, `Citation`, etc.)
- Idempotency: Pub/Sub at-least-once + deterministic IDs + status='indexed' early return
- Cancellation: poll Firestore `cancelRequestedAt` between steps (cross-process safe)
- Cost accounting per step (OCR/embed/Haiku) — populated in `paper.costUsd`
- Mistral SDK 2.4.5 pinned (internal import: `from mistralai.client.sdk import Mistral`)

**Infrastructure (Pub/Sub + Cloud Run):**

- Topic `paper-processing` + DLQ `paper-processing-dlq` (max 5 attempts, 7d retention)
- Push subscription `spectra-worker-papers-push` → `/papers/process` endpoint
- IAM: Vercel SA `firebase-adminsdk-fbsvc@` → `roles/pubsub.publisher` on topic
- IAM: Worker SA `spectra-worker@` → `roles/pubsub.subscriber` + `roles/secretmanager.secretAccessor`
- Cloud Run service: memory=4Gi, timeout=3600s, concurrency=1
- Secret Manager: `mistral-api-key`, `voyage-api-key`, `pinecone-api-key`

**labyra-app (Vercel publisher cutover):**

- `PubSubQueue` using REST API (gRPC SDK fails on Vercel serverless)
- Factory `getJobQueue()` reads `PAPER_QUEUE_BACKEND` env (`pubsub` | `in-process`)
- Reuses `getAuth()` from `src/lib/pubsub/publisher.ts` (R167-C2 export)
- `PaperProcessingJob` interface extended with `storagePath` + `createdBy` per ADR-018
- Routes updated: `/api/papers/upload`, `/api/papers/[id]/reprocess`
- UI fix: `STEPS` array in `processing-timeline.tsx` now includes `extracting_citations` step (R166-ai6a-3b-fix2 missed this render path)
- Removed duplicate `Paper` interface from `src/lib/ai/rag/types.ts` (source of truth: `src/types/papers.ts`)

### Changed

- **Pipeline runtime location**: TS Vercel function (sync) → Python Cloud Run worker (async via Pub/Sub)
- **Vercel function role**: pipeline orchestrator → publish-only (returns 202 immediately after Pub/Sub publish)
- **Storage path convention**: `gcs_client.parse_gs_url()` now accepts both `gs://bucket/path` and relative paths (worker B8)

### Verified

- **3-page paper Tungsten**: 8 seconds end-to-end (Pub/Sub receipt → indexed)
- **16-page paper Surfactants**: 16.4 seconds end-to-end (vs Vercel 60s timeout — **blocker eliminated**)
- Vercel → Pub/Sub publish via REST + GoogleAuth credentials decode
- Worker pickup + full pipeline + Firestore status transition + Pinecone upsert
- Citation step idempotent (Crossref lookup, deterministic IDs, stats recompute)

### Rollback

- Vercel env `PAPER_QUEUE_BACKEND=in-process` + redeploy → falls back to InProcessQueue (TS orchestrator code retained)

### Architecture decisions

- [ADR-018: Async worker architecture](docs/adr/ADR-018-async-worker-architecture.md)

### Known Issues / Tech Debt → R168

- DOI regex false positives (OCR noise creates variants `.1`, `.l`, `J` suffix)
- `metadata.py` year=0 bug (Haiku JSON type coercion)
- Vercel 4.5MB body limit blocks paper > 4.5MB upload — needs browser-direct-to-Storage pattern
- `src/lib/pubsub/` duplicates HTTP boilerplate between spectra and papers — refactor generic util
- Husky pre-push runs full `pnpm build` (blocked by unrelated branches with TS errors)
- `_force-reset-paper.mjs` misleading name (sets cancelled not queued)
- See `docs/round-r167-handoff.md` for full backlog

---

## R166 — ai-6 GraphRAG Phase 6a (2026-05-15)

<!-- R166-docs-update-2026-05-15 -->

### Added

- **Citation network data layer** ([ADR-017](docs/adr/ADR-017-citation-network.md)):
  - `Citation` type extends `ProvBase` (PROV-O compliant first-class entity)
  - Zod schemas with DOI regex validation + title fallback + confidence enum
  - Deterministic ID generation for idempotent dedup
  - Service: 13 exports (CRUD + lineage queries + lifecycle + denormalized stats)
- **External metadata clients**:
  - Crossref REST API client (free, no key, polite User-Agent with mailto)
  - OpenAlex fallback client (used when Crossref 404)
  - Unified `lookupDoi()` entry point
- **References parser**: DOI extraction from OCR text
  - Heuristic detection of "References" / "Bibliography" / "Tài liệu tham khảo" section
  - Global DOI regex scan with dedup + context capture (±25 chars)
  - Max 100 results safety cap
- **Citation extraction pipeline step**: `runCitationStep()` after indexing (Step 6)
  - Non-blocking (paper indexing succeeds even if Crossref down)
  - Rate limited (200ms between Crossref calls = 5 req/s, well below 50/s limit)
  - Cancellable via AbortSignal at each lookup
  - Cross-references against existing internal papers (auto-link `targetPaperId`)
  - Recomputes denormalized stats per paper

### Changed

- **`PaperStatus` enum**: added `'extracting_citations'` between `'indexing'` and `'indexed'`
- **`STATUS_COLORS` + `STEP_ORDER` records**: updated with new status

### Known Issues

- Vercel OCR timeout (60s default) blocks papers > ~5 pages from indexing
- → Pivoting to **R167 async Cloud Run worker** (see [ADR-018](docs/adr/ADR-018-async-worker-architecture.md))

---

## R165 — Cleanup + Polish (2026-05-15)

### Added

- **`src/instrumentation.ts`** (Next.js auto-discover boot hook): wires `processPaperJob`
  to InProcessQueue via `setJobProcessor()`. Without this, ai-5b pipeline throws
  "processor not registered" on enqueue.
- **`<ReferenceDetailActions>` + `<ReferenceLineageSection>`** client wrappers for R164 patterns
- **Real Lineage Explorer page** at `/dashboard/lineage`:
  - 2 dropdowns (entity type + entity instance)
  - Renders `<LineageGraph>` on selected entity (depth 3)
  - Replaces R160 "Coming soon" placeholder
- **Sidebar updates**: "Spectra" → "Đo phổ" (Measurements), new "Tham chiếu" (References) entry

### Changed

- **Oxlint 28 → 0 warnings**: unused vars `_` prefix, console.* eslint-disable for audit logs,
  FTIRPeak type fix in spectrum-chart, `_publishImpl` → `publishImpl` rename
- **Worker FTIR/Raman/UV-Vis prompts**: upgraded to strict-grounding parity with XRD
  (5 RULES: ranking authoritative, top candidate threshold 0.4, secondary from candidates[1+],
  no ID invention, internal library trust)
- **Reference detail page**: dual-read service (`references` new → `reference_cards` legacy fallback,
  skip `_migrated: true`)
- **`getReferenceCard` service**: returns from new `references` collection first

### Fixed

- **FTIR FWHM negative bug**: PerkinElmer ASC files have descending x-array (4000→400 cm⁻¹)
  causing `dx < 0` and FWHM negative. Fix: sort ascending at entry of `_detect_peaks` +
  defensive `abs(dx)`.
- **Samples list crash** (`MISSING_MESSAGE: Cannot read properties of undefined`):
  Sample.workflowStatus fallback to legacy `status` + migration script
- **`fix(samples): workflowStatus fallback`**: defensive `getStatus(s) ?? 'prepared'` helper

---

## R164 — PROV-O ELN Architecture (2026-05-15)

### Added

- **PROV-O ELN data model** ([ADR-016](docs/adr/ADR-016-prov-o-eln-architecture.md)):
  7 entity/activity types (Material, Sample, Experiment, Measurement, Analysis,
  Reference, Paper) with `ProvBase` fields (createdBy, derivedFrom, lifecycleStatus).
- **30 REST API endpoints** for 7 entities with Zod validation + rate limits.
- **Soft delete lifecycle** (active/deprecated/retracted) with retraction reason audit.
- **Versioning sub-collection** for Papers + References — transactional snapshot
  on PATCH preserves history.
- **D3 lineage graph** `<LineageGraph>` — interactive force-directed PROV-O graph
  with 7 entity types color-coded, draggable nodes, click navigation.
- **Version history viewer** `<VersionHistoryViewer>` — expandable diff view
  for papers/references.
- **Reusable lifecycle UI components** — `<LifecycleStatusBadge>`,
  `<LifecycleFilter>`, `<LifecycleActions>`.
- **AI citation → Paper link** — when an AI-identified Reference has `paperId`
  set, the citation chip links to the internal Paper detail page.
- **Lineage queries** in services: `findSamplesByParentMaterial`,
  `findExperimentsByContainsSample`, `findReferencesByPaper`,
  `findAnalysesByCitedReference`, etc.

### Changed

- **`spectra` collection → `measurements`** (data + URL routes).
  Old `/api/spectra/*` URLs return 308 redirects.
- **`reference_cards` collection → `references`** (data + URL routes).
  Old `/api/reference-cards/*` URLs return 308 redirects.
- **`Sample.status` → `Sample.workflowStatus`** (disambiguated from new

## R164 — PROV-O ELN Architecture (2026-05-15)

### Added
- **PROV-O ELN data model** ([ADR-016](docs/adr/ADR-016-prov-o-eln-architecture.md)):
  7 entity/activity types (Material, Sample, Experiment, Measurement, Analysis,
  Reference, Paper) with `ProvBase` fields (createdBy, derivedFrom, lifecycleStatus).
- **30 REST API endpoints** for 7 entities with Zod validation + rate limits.
- **Soft delete lifecycle** (active/deprecated/retracted) with retraction reason audit.
- **Versioning sub-collection** for Papers + References — transactional snapshot
  on PATCH preserves history.
- **D3 lineage graph** `<LineageGraph>` — interactive force-directed PROV-O graph
  with 7 entity types color-coded, draggable nodes, click navigation.
- **Version history viewer** `<VersionHistoryViewer>` — expandable diff view
  for papers/references.
- **Reusable lifecycle UI components** — `<LifecycleStatusBadge>`,
  `<LifecycleFilter>`, `<LifecycleActions>`.
- **AI citation → Paper link** — when an AI-identified Reference has `paperId`
  set, the citation chip links to the internal Paper detail page.
- **Lineage queries** in services: `findSamplesByParentMaterial`,
  `findExperimentsByContainsSample`, `findReferencesByPaper`,
  `findAnalysesByCitedReference`, etc.

### Changed
- **`spectra` collection → `measurements`** (data + URL routes).
  Old `/api/spectra/*` URLs return 308 redirects.
- **`reference_cards` collection → `references`** (data + URL routes).
  Old `/api/reference-cards/*` URLs return 308 redirects.
- **`Sample.status` → `Sample.workflowStatus`** (disambiguated from new
  `lifecycleStatus`). `Experiment.status` same.
- **Pub/Sub message format** accepts both `spectrumId` (legacy) and
  `measurementId` (new); worker handles both.
- **Document ID format** for entities: slug + sequence (`mat_wo3_001`)
  instead of UUID. Activities (measurements/analyses) keep UUIDs.

### Deprecated
- `spectrumRawPath/ProcessedPath/ThumbnailPath` — use `measurement*Path`.
- `publishSpectrumAnalysis` — use `publishMeasurementAnalysis`.
- `SampleStatus/ExperimentStatus` types — use `SampleWorkflowStatus/ExperimentWorkflowStatus`.
- `SpectrumAnalysisMessage` interface — use `MeasurementAnalysisMessage`.
- Old paths `/api/spectra/*` and `/api/reference-cards/*` (308 redirects).
  Will be removed in R166.

### Migrated (one-time)
- 28 spectra documents → measurements collection (tenant-dev-001).
- 1 reference_card → references collection (tenant-dev-001).
- Source documents marked `_migrated: true` (kept for audit, not deleted).

### Fixed
- Multiple migration script credential conventions support
  (FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY etc.).
- D3 TypeScript strict mode types in `LineageGraph` (explicit `D3Node`/`D3Edge`
  fields, generic `selectAll<...>`).

### Infrastructure
- Worker `labyra-spectra-worker` v0.2.x: accepts both `spectrumId` +
  `measurementId` in Pub/Sub payload. Deploy-first compatibility.

---

## [R162] - 2026-05-14

### Added
- **Demo dataset** for spectra: real W18O49 rod XRD data at `/public/demos/spectra/`, dropdown UI on experiment page reduces time-to-first-analysis to <2 min for new users
- **Internal reference card citation** (spectra-4b + ai-5c): tenant-uploaded ICDD/JCPDS reference cards now appear as citation candidates alongside COD/MP, ranked by `matchScore` (R161 algorithm). Threshold 0.3 (Trust > Coverage).
- **Reference cards library page** `/dashboard/reference-cards`: browse all tenant cards + detail view `/dashboard/reference-cards/[id]` with peak table
- **Stage 1 security** (per `labyra-strategy.md`):
  - Firestore-based rate limit (`src/lib/security/rate-limit.ts`) — 5/min reanalyze, 30/min uploads/cards. Atomic via Firestore tx, TTL on `expiresAt` field, interface stable for Stage 2 Upstash migration
  - Origin header check (`src/lib/security/origin.ts`) — CSRF defense via allowlist (prod + Vercel preview regex + localhost). Merged into existing `src/proxy.ts` (Next 16 middleware).
- **Type-safe tenantId helper** `getTenantIdFromToken(decoded)` in `src/lib/auth/token.ts` — replaces `as string | undefined` cast across 22 API routes
- **Server-side tenantId helper** `getCurrentTenantId()` in `src/lib/auth/server.ts` — cookie-based for Server Components
- **Scientific docs**: `docs/scientific-methods/xrd-analysis.md` §16 (demo dataset rationale) + §17 (internal library matching algorithm + Stage 2 trigger)
- **Security docs**: `docs/security/rate-limiting.md` + `docs/security/csrf.md` + ADR-015

### Changed
- **Rebrand** Labrya → Labyra across 13 files (53 brand strings + 21 identifiers `labrya.experiments.*` → `labyra.experiments.*`). User-facing impact zero (i18n already clean).
- **XRD prompt grounding** (worker): replaced loose "best match based on (a/b/c)" criteria with 5 strict rules. `candidates[0]` is authoritative — AI cannot re-rank. Includes Vietnamese version + tagged `rank`/`is_top` in user prompt for explicit visibility.
- **CitationChip + XRDPhaseSummary**: branch rendering for internal source (peak preview chips instead of lattice grid, Library badge with phaseName not UUID, internal `<Link>` route vs external `<a target=_blank>`)
- **i18n cleanup**: materials/samples edit pages + reference-card detail page now respect locale (previously hardcoded Vietnamese on edit pages, hardcoded English on reference-card detail)
- **Subscript formulas** on reference-card detail page via `formatSciText()` server-side pre-processing
- Worker `analysis_version` unchanged (spectra-4b-1.4.0) — grounding fix is prompt-only, no schema change

### Fixed
- **R161 hidden bug**: `XRDPhaseSummary` component existed but was never mounted in `spectrum-analysis-section.tsx` → user never saw COD/MP candidate cards. Fixed by mounting + merging with internal candidates.
- **React Rules of Hooks violation**: `useMemo` for `mergedCandidates` was placed AFTER conditional early returns in `spectrum-analysis-section.tsx` → runtime crash "Rendered more hooks than during the previous render" on prod spectrum detail page. Hoisted above all returns with null-safe deps.
- **Next.js 16 conflict**: created `src/middleware.ts` when repo already has `src/proxy.ts` (Next 16 renamed middleware → proxy) → build error "Both middleware file and proxy file detected". Merged Origin check logic into proxy.ts.
- **Client/server boundary**: `internal-candidates.ts` imported `matchScore` from a `firebase-admin`-importing service module → would bundle Admin SDK into client. Extracted `matchScore` to pure module `src/lib/spectra/match-score.ts`.
- **Lint**: 84 → 69 warnings, 0 errors. Removed unused `Timestamp` imports (3 routes), unused `useEffect` import, unused `confidenceVariant` function, `t` variable. Replaced `Array.sort()` with `.toSorted()` (4 sites). Wrapped debug `console.log` with `NODE_ENV` guard. Fixed `\/` regex escape in rate-limit.ts.

### Security
- **Origin CSRF check** verified on prod: cross-origin POST returns 403 `forbidden_origin`
- **Rate limit** verified on prod: 6th `/api/spectra/[id]/reanalyze` within 60s returns 429 with `Retry-After: <seconds>` header
- Manual one-time setup required: Firestore TTL policy on `_rate_limits.expiresAt` (Firebase Console → Indexes → TTL)

### Tech debt deferred to R163+
- 19 of 22 API routes still lack rate limit (only 3 expensive endpoints covered)
- No per-IP rate limit on auth endpoints (Stage 3 enterprise)
- 7+ Server Components still cast `decoded.tenantId` (refactor to use `getCurrentTenantId()`)
- `parseHkl` doesn't handle Unicode overline notation `1̄ 0 0`
- Reference card detail page is read-only (no edit/delete UI; CRUD only via dialog manager)
- CLAUDE.md says "Lucide only" but codebase uses `@tabler/icons-react` — doc update needed

## [R161] - 2026-05-14

### Added
- **XRD Tier 1+2 metrics** (per-peak): d-spacing (Bragg), Scherrer crystallite size D (nm), integral breadth β, dislocation density δ (1/D²), microstrain ε (β·cosθ/4), hkl from citation match
- **XRD quality metrics card**: scan range, step size, λ effective, SNR, smallest FWHM, crystallinity %
- **Per-phase summary card**: lattice params (a/b/c/α/β/γ), space group, crystal system, citation chip with View source link
- **Profile function fitting**: Gaussian, Lorentzian, Pseudo-Voigt (default) via scipy.optimize.curve_fit with R² goodness gate
- **Zero shift correction**: manual 2θ offset input (instrument calibration)
- **Citation cache**: Protocol pattern abstraction (FirestoreCitationCache + NoOpCitationCache), migration-safe for future Redis/Postgres
- **Re-analyze button** on spectrum detail page (Pub/Sub republish for backfilling new fields)
- **NavBack** universal component (window.history aware, fallback to URL)
- **DataTable** generic sortable + collapsible + Excel export
- **Reference card overlay** (4a-pdf): manual paste XRD reference cards from HighScore Plus / ICDD format, vertical sticks on chart, legal-safe (user-provided data only)
- **Subscript rendering** for chemical formulas with variables: W₁₈O₄₉, WₙO₃ₙ₋ₓ, Fe₁₋ₓCoₓO₃
- **AI determinism**: temperature=0 for reproducible phase identification
- **MP formula capitalize**: periodic table tokenizer (WO3 not wo3)
- **Scientific methods documentation**: `docs/scientific-methods/xrd-analysis.md` (15 sections)

### Changed
- Migrated 4 tables (Materials, Samples, Experiments, Spectra) to DataTable component
- Cloud Run worker scaled: concurrency 5→10, RAM 2→4Gi
- Gemini config: gemini-3-flash-preview model (single-turn safe; multi-turn deferred for thought_signature handling)
- Worker analysis_version: spectra-4a-1.0.0 → spectra-4b-1.4.0

### Fixed
- Lint cleanup: 12 errors → 0 (no-useless-escape, prefer-string-starts-ends-with, jsx-a11y, no-new-array, no-useless-fallback-in-spread, next/no-html-link-for-pages)
- Pre-push hook: 60s → 6s (tsc --noEmit only)
- MP API 400 Bad Request (formula case sensitivity)

### Performance
- Citation lookup cache hit rate: cold start ~25-30s → warm ~5-10s (3-5x speedup)
- Cloud Run throughput: 2x with concurrency=10

### Security
- All new endpoints (reference-cards CRUD, reanalyze) require Firebase auth + tenantId claim
- Zod validation with strict length/range limits (max 50KB pasted text, 3-200 peaks, etc.)
- Tenant isolation via Firestore path scoping

