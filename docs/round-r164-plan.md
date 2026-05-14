# R164 Implementation Plan — PROV-O ELN Data Assets

- **Status:** Approved (per ADR-016)
- **Date:** 2026-05-14
- **Effort:** ~28h, 12 phases (18 sub-phases when LOC > 1k)
- **Target LOC per patch:** ≤1.5k (hard cap), ~1k typical
- **Branch strategy:** `main` only (per existing project rules)

---

## Phase summary

| Phase | Title | LOC est. | Effort |
|---|---|---:|---:|
| 1 | Types refactor + new entities | ~800 | 2h |
| 2 | Zod schemas + lifecycle | ~700 | 1.5h |
| 3a | Service: Material + Sample CRUD | ~900 | 1.5h |
| 3b | Service: Experiment + Measurement | ~800 | 1.5h |
| 3c | Service: Paper + Reference + Analysis | ~1200 | 2h |
| 4a | API routes: Material, Sample, Experiment | ~800 | 1.5h |
| 4b | API routes: Reference, Paper, Measurement | ~900 | 1.5h |
| 5 | Rename `spectra` → `measurements` + migration | ~500 | 1.5h |
| 6 | Port `reference_cards` → `references` | ~600 | 1.5h |
| 7a | UI: Materials list + detail | ~900 | 1.5h |
| 7b | UI: Materials forms | ~700 | 1h |
| 7c | UI: Samples list + detail + forms | ~1100 | 2h |
| 7d | UI: Experiments list + detail + forms | ~1100 | 2h |
| 8a | UI: References list + detail (multi-tab) | ~900 | 1.5h |
| 8b | UI: Papers list + detail | ~800 | 1.5h |
| 9 | D3 lineage graph component | ~1000 | 2.5h |
| 10 | AI citation: Reference → Paper DOI link | ~500 | 1h |
| 11 | Versioning sub-collection (refs + papers) | ~700 | 1.5h |
| 12 | Migration scripts + smoke tests + docs | ~500 | 1.5h |
| | **TOTAL** | **~13.7k LOC** | **~28h** |

---

## Phase 1 — Types refactor + new entities

**Files:**
- `src/types/prov-base.ts` (new) — ProvBase interface, status enum
- `src/types/materials.ts` — extend Material with ProvBase, slug ID
- `src/types/samples.ts` — extend Sample with ProvBase
- `src/types/experiments.ts` — extend Experiment with ProvBase
- `src/types/papers.ts` — extend Paper with ProvBase + versioning
- `src/types/measurements.ts` (new) — Measurement (replaces spectra concept)
- `src/types/analyses.ts` (new) — Analysis (extracts from spectra.analysisResult)
- `src/types/references.ts` (new) — References (port from reference_cards)

**Key decisions encoded:**
- All entities extend `ProvBase` with `derivedFrom`, `generatedBy`, `status` fields
- Reference type = discriminated union (XRD | FTIR | Raman | UV-Vis), already in `src/types/spectra.ts` — move + rename
- Add `paperId?: string` to Reference for DOI linking
- Measurement has `experimentId`, `sampleId`, `fileAssetPath` (storage location)
- Analysis has `measurementId`, `parsed`, `aiResult`, `citations: ReferenceId[]`

**Marker:** `R164-phase-1-types`

---

## Phase 2 — Zod schemas + lifecycle helpers

**Files:**
- `src/lib/schemas/prov-base-schema.ts` (new) — ProvBase Zod
- `src/lib/schemas/material-schema.ts` (new)
- `src/lib/schemas/sample-schema.ts` (new)
- `src/lib/schemas/experiment-schema.ts` (new)
- `src/lib/schemas/measurement-schema.ts` (new)
- `src/lib/schemas/analysis-schema.ts` (new)
- `src/lib/schemas/reference-schema.ts` (new — moves CreateAnyRefCardSchema from `spectra/reference-card-schema.ts`)
- `src/lib/schemas/paper-schema.ts` (new)

**Helpers (`src/lib/prov/`):**
- `id-generator.ts` — slug ID generation (`mat_<slug>_<seq>`)
- `lifecycle.ts` — soft delete, deprecation, retraction helpers

**Marker:** `R164-phase-2-schemas`

---

## Phase 3a/3b/3c — Service functions (CRUD)

**Pattern per entity:**
- `getById(tenantId, id)` — read with backward-compat default fields
- `list(tenantId, filters?)` — list active by default
- `listIncludingDeprecated(tenantId)` — admin
- `create(input)` — validate + generate ID + write + audit
- `update(id, patch)` — write `updatedAt`, `updatedBy`
- `deprecate(id, reason)` — soft delete: status → 'deprecated'
- `retract(id, reason)` — scientific invalidity: status → 'retracted'
- `findByDerivedFrom(entityId)` — lineage forward
- `findByGeneratedBy(activityId)` — lineage backward

**3a:** `src/lib/firebase/{materials,samples}/service.ts`
**3b:** `src/lib/firebase/{experiments,measurements}/service.ts`
**3c:** `src/lib/firebase/{papers,references,analyses}/service.ts`

**Markers:** `R164-phase-3a`, `R164-phase-3b`, `R164-phase-3c`

---

## Phase 4a/4b — API routes

**Pattern per entity (`src/app/api/{entity}/route.ts` + `[id]/route.ts`):**
- GET `/api/{entity}` — list (rate limit 100/min)
- POST `/api/{entity}` — create (rate limit 30/min)
- GET `/api/{entity}/[id]` — read
- PATCH `/api/{entity}/[id]` — update (rate limit 30/min)
- DELETE `/api/{entity}/[id]` — deprecate (soft)
- POST `/api/{entity}/[id]/retract` — retract (admin)

**Reuses existing R162 security pattern:**
- `authenticate(req)` from existing pattern
- `getTenantIdFromToken(decoded)`
- `checkRateLimit(rateLimitKey('<entity>-<op>', tenantId), limit, 60)`
- CSRF check (Origin header, via proxy.ts)

**4a:** materials, samples, experiments routes
**4b:** references, papers, measurements (refactor from spectra), analyses

**Markers:** `R164-phase-4a`, `R164-phase-4b`

---

## Phase 5 — Rename spectra → measurements

**Changes:**
- Firestore service paths: `tenants/{tid}/spectra/{id}` → `tenants/{tid}/measurements/{id}`
- API route files: `src/app/api/spectra/*` → `src/app/api/measurements/*`
- Add redirect for 30 days: old `spectra` routes return 308 with new location header
- Worker pubsub message format: spectrum ID rename to measurementId
- Migration script: copy all `spectra` docs → `measurements` collection
- Worker `gcs_client.py` paths if hardcoded: `/spectra/` → `/measurements/`

**Decision:** GCS storage paths can stay `/spectra/` — purely cosmetic. Avoid GCS rename
which requires copy-delete (expensive, no benefit).

**Marker:** `R164-phase-5-rename`

---

## Phase 6 — Port reference_cards → references

**Changes:**
- New: `tenants/{tid}/references/{ref_xxx}` collection
- Migration: 1 doc (W18O49) → references with new fields (paperId: undefined, status: 'active', derivedFrom: [])
- Refactor `internal-candidates.ts` to query `references` instead of `reference_cards`
- Refactor `multi-citations-panel.tsx` to display new schema
- Refactor `add-reference-card-dialog.tsx` to write to `references`
- Delete `reference_cards` collection + API routes (`/api/reference-cards` → `/api/references`)
- Update i18n keys

**Marker:** `R164-phase-6-port-refs`

---

## Phase 7a-d — UI Materials/Samples/Experiments

Each entity has:
- **List page** (`/dashboard/{entity}`) — Data table with sort, filter, search
- **Detail page** (`/dashboard/{entity}/[id]`) — Show fields + lineage + edit button + deprecate dialog
- **Create dialog** — Form with Zod validation (React Hook Form + zodResolver)
- **Edit dialog** — Pre-populated form
- **Deprecate dialog** — Confirmation + reason input
- **Lineage section** — Inline preview of parent/child entities

**Components shared:**
- `EntityListPage<T>` — generic list with toolbar
- `EntityDetailPage<T>` — generic detail with lineage panel
- `EntityCreateDialog<T>` — generic form dialog
- `LineagePreview` — small component showing parent/child links

**Markers:** `R164-phase-7a`, `7b`, `7c`, `7d`

---

## Phase 8a/8b — UI References + Papers

**8a — References:**
- List page filtered by spectrum type tab (XRD | FTIR | Raman | UV-Vis)
- Detail page shows peaks table + linked Paper (clickable DOI) + linked Analyses (cites)
- Add reference dialog: existing 4-tab dialog from R163 + paperId picker (link Paper)
- Versioning view: show edit history

**8b — Papers:**
- List page with paper cards (title + authors + year + status)
- Detail page with PDF preview (if accessible) + RAG chunks count + linked References
- Upload paper dialog (existing R160 paper pipeline)
- DOI lookup via Crossref (future R165)

**Markers:** `R164-phase-8a`, `8b`

---

## Phase 9 — D3 lineage graph

**Component:** `src/features/lineage/components/lineage-graph.tsx`

**Approach:**
- Force-directed D3 graph rendered to SVG
- Nodes color-coded per entity type: Material (blue), Sample (green), Measurement (purple), Analysis (orange), Reference (red), Paper (yellow)
- Edges labeled with PROV-O relation: "derives", "uses", "generates", "cites", "extracts from"
- Zoom + pan + click node → navigate to detail
- Query strategy: `lineage-queries.ts` traverses 2 hops in both directions, batches Firestore reads

**Integration:**
- Detail page of any entity → show lineage panel below main content
- Standalone `/dashboard/lineage/[entityType]/[id]` for full-screen exploration

**Marker:** `R164-phase-9-lineage`

---

## Phase 10 — AI citation: Reference → Paper DOI

**Changes:**
- Worker prompts updated: when citing internal Reference, include linked `Paper.doi` if present
- UI citation chip refactor: if `reference.paperId` → fetch Paper.doi → show "Smith 2020 · DOI: 10.xxx"
- Click DOI → open Paper detail page in new tab
- No DOI hallucination: if Reference has no paperId, chip shows "manual ref" without DOI

**Marker:** `R164-phase-10-doi-link`

---

## Phase 11 — Versioning sub-collection

**Pattern (References + Papers only):**
- Service `update()` reads current doc, writes snapshot to `versions/{vId}` before applying patch
- `vId = v${currentVersion}_<timestamp>`
- Top-level doc updates `currentVersion: number`
- New endpoint: `GET /api/{entity}/[id]/versions` lists history
- UI: "View history" button on detail page → modal with version timeline

**Marker:** `R164-phase-11-versioning`

---

## Phase 12 — Migration + tests + docs

**Migration scripts (`scripts/`):**
- `migrate-r164-data-init.ts` — initialize counters for slug ID generation
- `migrate-r164-spectra-to-measurements.ts` — copy collection
- `migrate-r164-reference-cards-to-references.ts` — copy + transform schema
- `migrate-r164-add-status-field.ts` — backfill status='active' on existing entities

**Smoke tests:**
- Manual test plan in `docs/r164-smoke-tests.md`
- Critical paths: Create Material → Create Sample → Create Experiment → Upload Measurement → Run Analysis → See lineage graph

**Docs:**
- Update `CLAUDE.md` with new collection structure
- Update `docs/scientific-methods/` with PROV-O references
- New: `docs/lineage-model.md` explaining graph

**Marker:** `R164-phase-12-migration`

---

## Risk register

| Risk | Mitigation |
|---|---|
| Spectra rename breaks Vercel routes during deploy | 30-day redirect + monitoring |
| Reference card data loss during port | Backup `reference_cards` collection before migration; idempotent migration script |
| Lineage queries slow on large tenant | Limit to 2 hops; cache results in React Query; add Firestore composite indexes |
| Sub-collection versioning hits Firestore limits | Document write rate limit 1/sec/doc — UI debouncing for edit forms |
| Slug ID collisions on rapid create | Counter is Firestore atomic increment — guaranteed unique per tenant |

---

## Definition of Done

- ✅ All 12 phases shipped + pushed to main
- ✅ tsc 0 errors, oxlint ≤30 warnings (current baseline ~16)
- ✅ Manual smoke test plan passes 100%
- ✅ ADR-016 + this plan committed to `docs/`
- ✅ Existing R163 features (spectrum analysis, refcards) still functional
- ✅ Migration scripts ran successfully on prod, no data loss
- ✅ Old `reference_cards` collection deleted, `spectra` collection migrated
- ✅ Lineage graph renders for Sample → Measurement → Analysis chain
