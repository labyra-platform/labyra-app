# Handoff — R160 Session (May 13, 2026)

> **Purpose:** Continuity for new chat session.  
> **Scope:** What was shipped in this session + state of the codebase + how to pick up.

## TL;DR

We are working on **labyra-app** (multi-tenant SaaS lab management). This session shipped:

1. **Anti-hallucination L6+L7** (ai-5e-2) — OOD classifier + empty result guard
2. **Lab CRUD** (data-1, data-1b, data-1c) — Materials/Samples/Experiments full CRUD with shadcn Form/Table + complete i18n
3. **Equipment + Bookings** (data-2) — final lab entities + composite Firestore indexes
4. **AI tools polish** (ai-tools-1) — `countExperiments`/`findSample`/`recentMaterials` aligned with new schemas
5. **UI polish** (ui-1) — Papers PageContainer + WCAG 2.3.3 reduced-motion CSS + Stage 2 plan docs
6. **Stage 2 Phase 1: Spectra** (spectra-1, spectra-2) — 24 spectrum types with signed URL upload, SHA-256, tenant-scoped Firebase Storage, experiment Tabs + standalone `/dashboard/spectra` route

## Session ground rules

- **Language:** Vietnamese conversation, English code. Be concise. No preamble, no trade-off analysis unless asked.
- **Workflow:** WSL `~/LAB-MANAGER/labyra-app`, patches to `/mnt/d/labbook-patches/`. Run from project root.
- **Patches:** Idempotent Python scripts. Always preflight + skip-if-applied. Filename includes round number (`r160-<phase>.py`).
- **UI rule:** Use shadcn components, not custom HTML. Forms use Form/FormField pattern. Tables use shadcn Table.
- **Icons:** `@tabler/icons-react`, centralized in `src/components/icons.tsx`. Never Lucide.
- **Branch:** `main` only. Husky pre-push runs `pnpm build` — broken build blocks push.
- **Commits:** Conventional Commits, max 400 LOC diff.

## Codebase state

### Routes
```
/[locale]/dashboard/
  overview              — Dashboard greeting + placeholder widgets
  materials             — Material CRUD (list + new + [id])
  samples               — Sample CRUD
  experiments           — Experiment CRUD with Tabs (Edit | Spectra)
  equipment             — Equipment CRUD
  bookings              — Booking CRUD
  papers                — Paper RAG library
  spectra               — All spectra (cross-experiment) + detail page
  ai-assistant          — AI chat with grounding
  chemicals             — Coming soon placeholder
  data-assets           — Coming soon placeholder
  lineage               — Coming soon placeholder
```

### Data layer
- All entities tenant-scoped via `useTenantId()` and Firestore rules
- Realtime listeners via `onSnapshot`
- Composite indexes deployed (firestore.indexes.json)
- Backward-compat for legacy data (no `id` field, no `experimentCode`)

### AI layer
- 3 tools: countExperiments, findSample, recentMaterials + paperTools
- Tier dispatcher: Haiku 20% / Sonnet 60% / Opus 20%
- Anti-hallucination L2+L3+L4 (grounding) + L6 (OOD) + L7 (empty result guard)
- Multi-turn support across Anthropic + Gemini providers

### Storage layer
- Papers: `papers/{tenantId}/{paperId}.v{version}.pdf` (via Admin SDK upload)
- Spectra: `tenants/{tenantId}/spectra/{spectrumId}/raw/<file>` (via signed URL client direct upload)
- 24 spectrum types in 6 groups (structural/optical/electrochemistry/photoelectrochemistry/surface/microscopy)

## Standards we follow

Per `docs/uiux-international-standards.md`:
- WCAG 2.2 Level AA (accessibility)
- ISO 9241-11 (usability)
- Nielsen 10 heuristics
- 8-point grid (Tailwind defaults)
- Color contrast ≥ 4.5:1 for normal text
- Touch targets ≥ 24×24px (shadcn Button is 36×36)
- Reduced motion respected (globals.css media query)
- Form labels above input, not placeholder-as-label
- FormMessage for inline Zod errors

Per `docs/labrya-experiment-database-report.md`:
- Raw files → GCS, never Firestore
- Time-series → BigQuery (Phase 3, deferred)
- Vector embeddings → Pinecone (already done for papers)
- Structured results → Firestore (per AnalysisResult schemas)
- Every storage tier MUST enforce tenantId isolation

## Open issues / known limitations

1. **Spectra Phase 2 not started.** Spectrum uploads sit at `status: 'uploaded'` forever. No worker yet to parse/analyze. See `docs/database-stage-2-plan.md` Phase 2 for plan.
2. **Equipment legacy data** has schema `{name, type, status, location, createdAt}` — backward-compat in EquipmentTable but new uploads use new schema (`equipmentCode`, `equipmentType`, etc.). Migration script not written.
3. **Sample form** has `parentMaterialIds: []` field but no dropdown UI yet — user must edit JSON manually for lineage.
4. **Bookings calendar view** — currently just a table. No visual calendar / conflict detection UI even though indexes are ready.
5. **Firestore rules warnings:** `isAuthenticated` function name flagged in deploy logs (3 warnings, non-blocking). Possibly old syntax.
6. **Vitest test coverage:** 0%. Deferred until codebase >30K LOC (currently ~22K).

## Next session recommended priorities

User chose Phase 2 worker (A) as next target. Other quick wins available:
- **F** Dashboard widgets (KPI cards) — ~600 LOC, ~1-2h, visible commercial value
- **D** Sample form parent material dropdown — ~200 LOC, fixes UX gap
- **E** Bookings calendar view — ~800 LOC, needs date library

## Commit history this session

```
* feat: spectra integration — experiment tabs + standalone page [R160-spectra-2]
* feat: Stage 2 Phase 1 — Spectrum upload (24 types) + UI polish [R160-spectra-1 + R160-ui-1]
* feat: Equipment+Bookings CRUD + composite indexes [R160-data-2]
* fix(ui): shadcn Form + Table refactor + full i18n + .has() guard [R160-data-1c]
* fix(ui): i18n + full-width layout + backward-compat tables [R160-data-1b]
* feat: Materials/Samples/Experiments full CRUD [R160-data-1]
* feat(ai): L6 OOD + L7 empty guard + Gemini multi-turn fix [R160-ai-5e-2]
* feat(ai): anti-hallucination L2+L3+L4 [R160-ai-5e-1]
```

## How to resume

```bash
cd ~/LAB-MANAGER/labyra-app
git pull
git status
pnpm dev
# Open http://localhost:3000/vi/dashboard
```

To verify state: `node --env-file=.env.local _check-something.mjs` (see prior session for Admin SDK access pattern).
