# Labyra App — Roadmap

> Long-term planning. Update sau mỗi phase complete.
> See CLAUDE.md cho coding rules, ARCHITECTURE.md cho system design.

<!-- R167-docs-update-2026-05-15 -->

**Last updated**: 2026-05-15
**Current state**: R167 async Pub/Sub worker pipeline **COMPLETE** (E2E verified). Vercel timeout blocker eliminated. Next: R168 tech debt cleanup + R166 Phase 6b citation UI.

---

## Vision

Labyra Platform = AI-native lab management SaaS cho materials science research.
Multi-tenant từ đầu (Lab Vật liệu BKU = tenant #1, commercial scale sau).

---

## Stack

Next.js 16 + TypeScript strict + shadcn/ui + Tremor + Firebase + next-intl + Vercel.
Charts: recharts (dashboard) + Plotly.js (scientific) + Three.js (3D Phase D) + D3 (lineage + citation network).
AI: Anthropic Claude (Sonnet/Haiku/Opus) + Google Gemini Flash + Voyage embed + Pinecone serverless + Mistral OCR.

---

## ✅ Completed Rounds

### R160 — Foundation + AI (April–May 2026)

- **Infrastructure**: Next.js 16 scaffold, Firebase setup, multi-tenant auth (Phase B.5)
- **i18n**: next-intl path-based, vi+en full translation
- **Dashboard**: 7 KPI cards, Tremor charts, Firestore wired
- **Core domains**: Materials, Samples, Experiments, Data Assets, Chemicals, Equipment, Bookings, Lineage placeholder
- **AI Phase ai-3/ai-4/ai-5** (shipped May 12+):
  - Provider abstraction (Anthropic + Gemini)
  - Haiku tier dispatcher 20/60/20 (cost-tiered model routing)
  - Tool calling (3 read-only tools)
  - T3 Opus reflection (max 3 rounds sufficiency check)
  - RAG: Voyage REST + Pinecone serverless namespace-per-tenant + Mistral OCR 3-provider abstraction
  - Pipeline ai-5a/5b/5c/5d: OCR → chunk → embed → index → search + rerank

### R161 — XRD scientific upgrade (May 14)

- XRD Tier 1+2 analysis (d/D/β/δ/ε, crystallinity, quality scoring)
- hkl wire from candidates
- Cloud Run concurrency=10 RAM=4Gi
- Per-phase summary with lattice + space group

### R162 — Stage 1 Security (May 14, [ADR-015](adr/ADR-015-stage-1-security.md))

- Firestore rate limiting across **23 routes** (read 100/min, mutation 30/min, expensive 5/min)
- Origin allowlist + CSRF check merged into `proxy.ts` for /api POST/PUT/PATCH/DELETE
- Stage 2 trigger = Upstash at 20+ labs (deferred until needed)
- Oxlint 84 → 16
- Rebrand Labrya → Labyra

### R163 — Spectra multi-type refcards (May 14)

- FTIR/Raman/UV-Vis reference cards (spectra-4c)
- Multi-citations panel
- Web search citation lookup

### R164 — PROV-O ELN Architecture (May 14–15, [ADR-016](adr/ADR-016-prov-o-eln-architecture.md))

12 phases. PROV-O compliant entity-relationship model:
- **7 entities**: Material, Sample, Experiment, Measurement, Analysis, Reference, Paper
- **ProvBase fields**: `createdBy`, `derivedFrom`, `generatedBy`, `lifecycleStatus`
- **Lifecycle**: active / deprecated / retracted (soft-delete + retraction audit)
- **Versioning**: sub-collection snapshots on Papers + References
- **D3 lineage graph** (`<LineageGraph>`, force-directed, 7 colors)
- **30 REST API endpoints** với Zod validation + rate limits
- **AI citation → Paper link** (auto-link via `Reference.paperId`)
- **Migrations**: spectra → measurements (28 docs), reference_cards → references (1 doc)

### R165 — Cleanup + Polish (May 15, 8 phases)

- Oxlint 28 → 0 warnings
- Worker FTIR/Raman/UV-Vis strict grounding (parity with XRD 5-rule grounding)
- FTIR FWHM bug fix (PerkinElmer ASC descending x-array)
- Reference UI full port (LifecycleActions + LineageGraph + dual-read service)
- **ai-5b processor wire** via `src/instrumentation.ts` (Next.js boot hook)
- Samples workflowStatus fallback + migration
- Lineage explorer page (real, replaced "Coming soon" placeholder)
- Sidebar nav (Spectra → Measurements + References entry)

### R166 — ai-6 GraphRAG Phase 6a (May 15, [ADR-017](adr/ADR-017-citation-network.md))

**Phase 6a complete** (data layer + extraction):

- `ai-6a-1`: Citation types + Zod schemas + ADR-017
- `ai-6a-2`: Service (CRUD + lineage + stats + lifecycle)
- `ai-6a-3a`: Crossref + OpenAlex clients + references parser (EN+VI section detection)
- `ai-6a-3b`: Citation step + orchestrator wire (Step 6 sau indexing)

Citation extraction approach (uy tín, bền vững):
- **Explicit DOI parsing** từ references section (NOT LLM concept extraction)
- Crossref primary + OpenAlex fallback (free APIs, polite mailto)
- Deterministic ID `{sourcePaperId}:d:{sha256(doi)}` for idempotent dedup
- Confidence ranking: `manual` > `doi-exact` > `title-fuzzy`
- Non-blocking step (paper indexing succeeds even if Crossref down)

---

## 🚧 Active: R167 — Async Cloud Run Worker (BLOCKER)

**Problem**: Vercel function timeout (60s Pro, 300s max) không đủ cho OCR papers > 5 pages.
Phase 6a smoke test fail: paper 16-page → OCR timeout → pipeline stuck.

**Decision** ([ADR-018](adr/ADR-018-async-worker-architecture.md)):

- **Worker**: Extend `labyra-spectra-worker` (existing Python Cloud Run, FastAPI)
- **Queue**: Cloud Pub/Sub (event-driven, scale tốt, free tier)
- **Language**: Python (consistency với existing worker, Mistral Python SDK canonical)

**Phases**:

- **R167-A** (~1h): Pub/Sub topic + subscription + worker skeleton + health check
- **R167-B** (~2h): Port OCR + chunking + embed + index TS → Python, wire vào worker
- **R167-C** (~30p): Migrate citation step vào worker, labyra-app chỉ publish

**Architecture**:

```
Browser → /api/papers/upload (Vercel, <5s)
            ↓ Pub/Sub publish
        Cloud Run worker (labyra-spectra-worker, 60-min timeout)
            ↓ subscribe
        Full pipeline: OCR → chunk → embed → index → citation
            ↓ each step
        Firestore status update (realtime to UI)
```

**Pending** after R167:

- R166 ai-6 Phase 6b — UI cho citation network (Cited-by section, D3 viz)
- R166 ai-6 Phase 6c — AI tool `searchCitations` + dispatcher integration

---

## 🗺️ Roadmap thereafter

### R168+ — Spectra method expansion

- **Spectra 3d**: PL / EDS / BET parsers (lab BKU thực sự dùng, ~3h/method)
- **Spectra 3e**: CV / LSV / EIS electrochemistry (Memory entry 11, ~3h/method)
- **Future**: ICDD PDF-2/4+ partnership (business deal, không phải code)

### R170+ — Forms + onboarding hardening

- Material form PROV-O upgrade (`derivedFrom`, `parentMaterialIds`)
- Form validation strengthen (chemical formula regex chặn `znno` typos)
- Multi-select sampleIds in Experiment form

### R175+ — Phase D advanced scientific viz

- 3D crystal structure viewer (Three.js)
- BZ Brillouin zone visualization
- DFT band structure plotting

### R180+ — Phase E commercial scale

- Stage 2 security (Upstash Redis rate limiting at 20+ labs)
- Self-serve tenant onboarding
- Billing + plan management
- Multi-region deployment

### R190+ — labyra-landing marketing (parallel track)

- L8 VN copy review
- L9 Preact swap (size reduction)
- L10 Accessibility 100
- L11 Analytics
- L12 Custom domain
- L13 Email signup backend

### Deferred / legacy

- Bug #11 notifications (deferred from R116-R126)
- labbook-bku R157a PDF export (legacy maintenance)
- labbook-bku merge `ai-assistant` → main (legacy housekeeping)

---

## Phase markers convention

`@phase R{NUM}{-suffix}` in code comments (e.g., `@phase R166-ai6a-3b`).
Each architectural change deserves an ADR (`docs/adr/ADR-{NUM}-{slug}.md`).

---

## Timeline reality check

- **R160–R166 elapsed**: ~30 days
- **Velocity**: ~5–8 phases / week
- **Code growth**: ~36k LOC TypeScript (461 files), 8.4k LOC docs (28 ADRs/methods)
- **Doc/Code ratio**: 23% (industry standard 10–15%) — high trust, sustainable

Next critical decision: **R167 worker** must ship before paper review (16+ pages) can index.
