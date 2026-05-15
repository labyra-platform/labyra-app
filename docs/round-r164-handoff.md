# R164 Handoff — PROV-O ELN Architecture

**Round:** R164
**Shipped:** May 14-15, 2026
**Phases:** 10 (1-10 + migration), Phase 11 merged into Phase 8-9a, Phase 12 = this doc
**Status:** ✅ COMPLETE
**ADR:** [ADR-016 — PROV-O ELN Architecture](./adr/ADR-016-prov-o-eln-architecture.md)

## Summary

R164 migrated Labyra from ad-hoc data shapes to a W3C PROV-O compliant Electronic
Lab Notebook (ELN) architecture. 7 entity types with full provenance lineage,
lifecycle states, versioning, and an interactive D3 lineage graph.

## What shipped

### 7 entities/activities

| Type | Collection | ID Format | Versioning |
|------|-----------|-----------|------------|
| Material | `tenants/{tid}/materials` | `mat_<slug>_<seq>` | — |
| Sample | `tenants/{tid}/samples` | `sam_<slug>_<seq>` | — |
| Experiment | `tenants/{tid}/experiments` | `exp_<slug>_<seq>` | — |
| Measurement | `tenants/{tid}/measurements` | UUID | — |
| Analysis | `tenants/{tid}/analyses` | UUID | — |
| Reference | `tenants/{tid}/references` | `ref_<slug>_<seq>` | yes (sub-collection) |
| Paper | `tenants/{tid}/papers` | `pap_<slug>_<seq>` | yes (sub-collection) |

All entities have `ProvBase` fields: id, tenantId, schemaVersion, createdBy/At,
updatedBy/At, derivedFrom[], generatedBy, lifecycleStatus, retracted*.

### 30 REST API endpoints

Pattern per entity:
- `GET /api/{entity}` — list with `includeDeprecated/Retracted` filters
- `POST /api/{entity}` — create (Zod validated)
- `GET/PATCH/DELETE /api/{entity}/[id]` — read/update/deprecate
- `POST /api/{entity}/[id]/retract` — irreversible retraction with reason
- `POST /api/{entity}/[id]/reactivate` — restore deprecated (409 if retracted)
- `GET /api/{entity}/[id]/versions` — version history (papers + references only)

All routes use:
- Bearer token auth via `authenticate()` helper
- Rate limiting (100/min read, 30/min write, 10/min retract/reactivate)
- Tenant isolation via `getTenantIdFromToken`

### UI components

- `<LifecycleStatusBadge>` — active/deprecated/retracted color-coded badge
- `<LifecycleFilter>` — list page dropdown to include hidden statuses
- `<LifecycleActions>` — detail page deprecate/retract/reactivate buttons
- `<VersionHistoryViewer>` — expandable version list for papers/references
- `<LineageGraph>` — D3 force-directed PROV-O graph (7 node types, draggable, clickable)
- `useVersionHistory(entity, id)` — hook
- `useLineageData(rootType, rootId, maxDepth)` — BFS traversal hook

Integrated into:
- Materials/Samples/Experiments detail pages (LifecycleActions + LineageGraph collapsible)
- Paper detail (VersionHistoryViewer at bottom)

### Migrations completed

| Source | Target | Tool | Docs migrated |
|--------|--------|------|---------------|
| `tenants/{tid}/spectra/*` | `tenants/{tid}/measurements/*` | `scripts/migrate-spectra-to-measurements.mjs` | 28 (tenant-dev-001) |
| `tenants/{tid}/reference_cards/*` | `tenants/{tid}/references/*` | `scripts/migrate-refcards-to-references.mjs` | 1 (tenant-dev-001) |

Migration scripts support multiple credential env conventions:
- `FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` (current — Vercel/Next.js)
- `GOOGLE_APPLICATION_CREDENTIALS_BASE64/JSON/path`
- `FIREBASE_SERVICE_ACCOUNT_KEY`

Also `FIRESTORE_DATABASE_ID` env to override database name (default `labbook`,
prod uses `(default)`).

### URL redirects (308 Permanent)

| Old path | New path |
|----------|----------|
| `/api/spectra/signed-upload` | `/api/measurements/signed-upload` |
| `/api/spectra/notify-complete` | `/api/measurements/notify-complete` |
| `/api/spectra/[id]/analysis` | `/api/measurements/[id]/analysis` |
| `/api/spectra/[id]/reanalyze` | `/api/measurements/[id]/reanalyze` |
| `/api/spectra/[id]/signed-download` | `/api/measurements/[id]/signed-download` |
| `/api/reference-cards` | `/api/references` |
| `/api/reference-cards/[id]` | `/api/references/[id]` |

Plan: redirects removed in R166.

### Worker (labyra-spectra-worker)

Pub/Sub message backward compat (Phase 5a):
- Old: `{ tenantId, spectrumId }` → still works
- New: `{ tenantId, measurementId, collection: 'measurements' }`
- Worker accepts both field names. `spectrum_id` variable name kept internally
  (no parser/firestore_client changes needed).

## Open items / Tech debt

### Deferred (intentional)

1. **Old data cleanup**: `tenants/{tid}/spectra/*` and `reference_cards/*`
   marked `_migrated: true` but NOT deleted. Manual delete via Firebase Console
   after verifying new collections work in prod for 7 days.

2. **Reference detail UI port**: `/dashboard/reference-cards/[id]` page still uses
   old `getReferenceCard` server fn from R162 reference-cards service. Phase 6
   migrated data; Phase 7 added lifecycle actions to Materials/Samples/Experiments
   but NOT references (legacy page kept functional). Full Reference UI port =
   future round.

3. **Form validation strengthen**: `formula` field still accepts typos like
   `znno` (should be `ZnO`). Patch needed: validate against chemical element
   regex + warn on unusual element combinations.

4. **FTIR FWHM negative bug**: descending x-array in PerkinElmer ASC files
   produces negative FWHM. Defer to spectra-4c-fix or worker-side fix.

5. **R163 follow-ups**: 4c-5c2 worker AI prompts for FTIR/Raman/UV-Vis grounding;
   4c-6 docs+tests; refactor 351-LOC AddReferenceCardDialog; 16-21 remaining
   oxlint warnings.

### Known issues

- LineageGraph: when traversing UUIDs (measurement/analysis), parent type
  inference uses heuristic (`startsWith('mat_/sam_/exp_/pap_/ref_')` → entity
  type, UUID → measurement). Edge case: analysis derived from another analysis
  may be miscategorized. Improve in future with explicit `derivedFromType` field.

- Reference card with old data (no `paperId`) shows "Library" chip linking to
  `/dashboard/reference-cards/[id]` (legacy URL still works via Phase 6 redirect).
  New references with `paperId` link to `/dashboard/papers/[id]`.

### Next round priorities (suggested)

1. **R165**: Reference UI port + form validation + delete old collections
2. **R166**: Remove 308 redirect stubs (after 30 days)
3. **R167+**: GraphRAG citation network (links papers to papers via shared refs)

## Architecture decisions

### Why slug IDs for entities?

- Human readable in URLs/logs: `mat_wo3_001` vs UUID
- Easy to grep/audit
- Sequence ensures uniqueness via Firestore atomic counter
- Activities (Measurement/Analysis) use UUID because high-volume + machine-generated

### Why hybrid versioning (Paper + Reference only)?

- Papers + References are scientific records → mutations need audit trail
- Materials/Samples/Experiments → mutations are operational, not scientific claims
- Measurements/Analyses → activities, replaced (not edited) via reanalysis

### Why lifecycle separate from workflow status?

- `lifecycleStatus` = record state (active/deprecated/retracted)
- `workflowStatus` = domain state (e.g., Sample: prepared/in_use/consumed)
- Confusion before R164 (both called `status`) caused field clash bugs

### Why nested tenants/{tid}/?

- Stronger physical isolation than top-level + tenantId filter
- Existing R162 security model already nested
- Firestore Indexes scoped per collection — nested forces per-tenant indexing
- Trade-off: cross-tenant queries impossible (acceptable for SaaS multi-tenant)

## File map

```
src/
├── types/
│   ├── prov-base.ts                       # ProvBase + LifecycleStatus
│   ├── materials.ts (refactored)
│   ├── samples.ts (refactored — workflowStatus)
│   ├── experiments.ts (refactored — workflowStatus, hypothesis)
│   ├── measurements.ts (NEW)
│   ├── analyses.ts (NEW)
│   ├── references.ts (NEW)
│   └── papers.ts (refactored — currentVersion, PaperVersion)
├── lib/
│   ├── schemas/                           # Zod (8 files, R164 Phase 2)
│   ├── prov/
│   │   ├── id-generator.ts                # slug + seq via Firestore counter
│   │   └── lifecycle.ts                   # buildDeprecate/Retract/ReactivatePatch
│   ├── firebase/
│   │   ├── materials/service.ts
│   │   ├── samples/service.ts             # + lineage queries
│   │   ├── experiments/service.ts         # + lineage queries
│   │   ├── measurements/service.ts        # + processingStatus state machine
│   │   ├── analyses/service.ts            # + lineage queries
│   │   ├── references/service.ts          # + versioning transactional
│   │   └── papers/service.ts              # + versioning transactional
│   └── api/auth-helper.ts                 # Centralized authenticate()
├── app/api/                               # 30 R164 routes
│   ├── materials/{route, [id]/...}
│   ├── samples/...
│   ├── experiments/...
│   ├── measurements/...
│   ├── analyses/...
│   ├── references/...                     # + versions/, retract/, reactivate/
│   └── papers/...                         # + versions/, retract/, reactivate/
├── components/
│   ├── lifecycle/
│   │   ├── lifecycle-status-badge.tsx
│   │   ├── lifecycle-filter.tsx
│   │   └── lifecycle-actions.tsx
│   ├── versioning/
│   │   ├── use-version-history.ts
│   │   └── version-history-viewer.tsx
│   └── lineage/
│       ├── use-lineage-data.ts            # BFS traversal
│       └── lineage-graph.tsx              # D3 force-directed
├── features/spectra/components/citation-chip.tsx  # Phase 10: paperId link
└── lib/spectra/internal-candidates.ts     # Phase 10: paperId propagation

scripts/
├── migrate-spectra-to-measurements.mjs
└── migrate-refcards-to-references.mjs
```

## How to resume work on R164

1. Check `git log --oneline | head -30` for all R164 commits (markers: `[R164-phase-N]`)
2. Read this doc + ADR-016
3. Run smoke test checklist (`docs/r164-smoke-test-checklist.md`)
4. Pick next priority from "Open items" above

---

@phase R164-phase-12
