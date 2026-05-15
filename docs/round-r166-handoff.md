# R166 Handoff — Newchat Session Bootstrap

<!-- R166-docs-update-2026-05-15 -->

**Generated**: 2026-05-15
**For**: Next Claude session continuing Labyra work
**State after R166**: Phase 6a (citation network data layer) complete.
Blocked on Vercel OCR timeout — needs R167 async worker.

---

## 1. Where we are right now

### Just shipped (R166 Phase 6a — ai-6 GraphRAG)

```
✅ ai-6a-1: Citation types + Zod schemas + ADR-017
✅ ai-6a-2: Service (CRUD + lineage + stats + lifecycle) — with fix patch
✅ ai-6a-3a: Crossref + OpenAlex clients + references parser
✅ ai-6a-3b: Citation step + orchestrator wire (+ 2 fix patches for PaperStatus enum)
```

Full Phase 6a citation extraction pipeline:
- OCR text → `extractDoisFromText()` finds DOIs in References section
- Each DOI → `lookupDoi()` (Crossref primary, OpenAlex fallback)
- → `createCitation()` (idempotent, confidence-ranked)
- → `findInternalPaperByDoi()` cross-reference
- → `recomputeCitationStats()` denormalize counts

### Active blocker

**Vercel function timeout**: 60s default (Pro plan), 300s max.
Mistral OCR for 16-page paper takes ~3-5 minutes → TIMEOUT before pipeline completes.

Smoke test result:
- Paper "Tungsten Disulfide" (3 pages) — completed but had no references section
- Paper review "Surfactants" (16 pages, 5.23 MB) — stuck at OCR with error
  `Request timed out: TimeoutError: The operation was aborted due to timeout`
- Total citations in Firestore: 0

---

## 2. Decided next step (R167 — Async Cloud Run Worker)

### Decision tree (Memory entry "uy tín, bền vững" governing principle)

| Question | Choice | Rationale |
|---|---|---|
| Worker target? | **Extend `labyra-spectra-worker`** | Single deployment, shared deps, cohesive boundary |
| Job queue? | **Cloud Pub/Sub** | Event-driven, scales, free tier, no polling overhead |
| Worker language? | **Python** | Consistency with existing worker, Mistral SDK canonical, scientific libs reuse |

See [ADR-018](adr/ADR-018-async-worker-architecture.md) for full rationale.

### Target architecture

```
Browser → /api/papers/upload (Vercel, <5s)
            ↓ Pub/Sub publish
        labyra-spectra-worker (Cloud Run, 60-min timeout)
            ↓ subscribe topic 'paper-processing-jobs'
        Full pipeline: OCR → chunk → embed → index → citation
            ↓ each step
        Firestore status update (realtime to UI)
```

### R167 phases

- **R167-A** (~1h): Pub/Sub topic + subscription + worker skeleton + health check endpoint
- **R167-B** (~2h): Port TS pipeline to Python (OCR + chunking + embed + index)
- **R167-C** (~30p): Migrate citation step + remove TS orchestrator from labyra-app

### Pre-flight checklist before R167-A starts

```bash
cd ~/LAB-MANAGER/labyra-spectra-worker

# Verify
ls                          # check structure
cat deploy.sh | head -30    # know Cloud Run service name + region
cat src/main.py | head -40  # know FastAPI structure

# Pub/Sub readiness
gcloud config list
gcloud pubsub topics list
```

---

## 3. State of the data (Firestore prod = `labyra-app-dev`, database `(default)`)

```
tenant-dev-001 (Lab Vật liệu BKU):
├─ materials: 1
├─ samples: 19 (all migrated to workflowStatus ✓)
├─ experiments: 28
├─ measurements: 28 (migrated from spectra)
├─ references: 1 (migrated from reference_cards)
├─ papers: 5 (all status='indexed' but processed BEFORE R166, no citations)
└─ citations: 0
```

**Action needed**: After R167 ships, reprocess all 5 papers via
`/api/papers/[id]/reprocess` to populate citations.

### Auth state

User `nvhn.7202@gmail.com` (UID set via `scripts/_set-tenant-claim.mjs`):
- `tenantId: tenant-dev-001` ✓
- `role: admin` ✓

### Custom user claims pattern

Multi-tenant SaaS: each user has SINGLE `tenantId`. No cross-tenant superadmin
in runtime — those operations use service account via admin SDK scripts.

---

## 4. Code state snapshot

### Repo: `labyra-app` (Next.js 16)

- Branch: `main`
- Latest commits:
  - `feat(ai-6): citation extraction step + orchestrator wire [R166-ai6a-3b]`
  - `feat(ai-6): Crossref + OpenAlex clients + references parser [R166-ai6a-3a]`
  - `feat(ai-6): Citation service + lineage queries [R166-ai6a-2]`
  - `feat(ai-6): Citation types + Zod schemas + ADR-017 [R166-ai6a-1]`
  - `feat(ui): real Lineage explorer page [R165-phase-7]`
  - `fix(samples): workflowStatus fallback for legacy data [R165-phase-6]`
  - etc.
- Stats: ~36k LOC TypeScript, 461 files, 8.4k LOC docs (23% doc ratio)

### Repo: `labyra-spectra-worker` (Python Cloud Run)

<!-- R166-handoff-worker-info -->

**Location**: `~/LAB-MANAGER/labyra-spectra-worker/` (same machine, separate folder from labyra-app)

**GitHub**: https://github.com/emnam009009/labyra-spectra-worker (private)
- Note: under `emnam009009` user, NOT `labyra-platform` org (inconsistent with labyra-app
  but intentional — repo predates org consolidation; do NOT transfer ownership during R167
  to avoid breaking deploy.sh refs + Cloud Build webhooks)

**Service** (verified 2026-05-15 audit, [R166-handoff-correct]):
- **Cloud Run service name**: `spectra-worker` (NOT `labyra-spectra-worker` — repo name ≠ service name)
- **Region**: `asia-southeast1`
- **GCP project**: `labyra-app-dev`
- **Service account**: `spectra-worker@labyra-app-dev.iam.gserviceaccount.com`
- **FastAPI app version**: `0.2.0`

**Existing Pub/Sub infrastructure** (R164-5a measurement pattern — blueprint for R167):
- **Topic**: `spectra-analysis`
- **Dead-letter topic**: `spectra-analysis-dlq`
- **Subscription**: `spectra-worker-push` (**push pattern** — Pub/Sub HTTPS POST to Cloud Run, not pull)

**Stack**:
- Python 3.11+ FastAPI 0.2.0
- Mistral OCR Python SDK
- numpy / scipy / lmfit (XRD Tier 2 analysis)
- Firebase Admin SDK (Firestore writes)
- google-cloud-pubsub
- Deploy: `bash deploy.sh` (Cloud Build + gcloud run deploy)

**Latest commits** (top of `main`):
```
feat(prompts): FTIR/Raman/UV-Vis strict grounding [R165-phase-2]
feat: accept measurementId in pubsub message [R164-phase-5a]
feat(ftir): parse PerkinElmer ASC + JCAMP-DX header formats [R163-worker-ftir-pe]
chore(worker): bump analysis_version to spectra-4b-1.5.0 [R162-version]
fix(ai): strict score-based grounding for XRD prompt [R162-grounding]
```

**Existing endpoints** (FastAPI routes):
- `POST /spectra/analyze` — XRD/FTIR/Raman/UV-Vis/TGA/DSC/OCP analysis (sync, ~30-60s)
- Pub/Sub push handler — **CURRENTLY IN `main.py` DIRECTLY** (no separate `src/pubsub/` folder)
- Various `/spectra/*` endpoints per measurement type

**ACTUAL src structure** (verified, NOT guessed):
```
labyra-spectra-worker/
├── src/
│   ├── ai/           # prompts + analysis logic
│   ├── parsers/      # spectra parsers (XRD, FTIR, Raman, UV-Vis, TGA, DSC, OCP)
│   ├── citations/    # CIF/COD/MP lookups for XRD (R161+)
│   ├── firestore/    # Firestore admin helpers
│   └── main.py       # FastAPI app + Pub/Sub handler (no separate pubsub/ folder)
├── deploy.sh
├── requirements.txt
└── Dockerfile
```

**R167 implementation plan**:

R167-A — Reuse existing Pub/Sub infrastructure (don't recreate):
- Create NEW topic `paper-processing` + dlq `paper-processing-dlq` (parallel to spectra-analysis)
- Create NEW push subscription `spectra-worker-papers-push` → same Cloud Run service
- Add NEW endpoint `POST /papers/process` in `main.py` (mirror existing spectra pubsub handler)
- Service account already has Pub/Sub subscriber role (reuse)

R167-B — Add paper pipeline modules:
- `src/papers/__init__.py` — package init
- `src/papers/ocr.py` — Mistral OCR (port from labyra-app TS)
- `src/papers/chunking.py` — text → chunks
- `src/papers/embedding.py` — Voyage REST embed (port from TS)
- `src/papers/indexing.py` — Pinecone upsert (port from TS)
- `src/papers/orchestrator.py` — full pipeline runner

R167-C — Citation step migration:
- `src/papers/citations.py` — port Phase 6a Python (extractDois, lookupDoi Crossref/OpenAlex)
- Reuse `src/citations/` (XRD existing — same Crossref API client base)
- labyra-app `/api/papers/upload` → publish to `paper-processing` topic instead of in-process queue
- Remove TS orchestrator code in labyra-app (or keep for short transition)

**Verification commands** (run in worker repo):
```bash
cd ~/LAB-MANAGER/labyra-spectra-worker

# Check service deployed
gcloud run services list --region=asia-southeast1 --filter=name~spectra

# Check existing topics
gcloud pubsub topics list --filter=name~spectra

# Check subscription endpoint
gcloud pubsub subscriptions describe spectra-worker-push --format='value(pushConfig.pushEndpoint)'

# Verify main.py has pubsub handler
grep -n "pubsub\|@app.post.*pubsub" src/main.py
```

---

## 5. Environment variables

### Vercel (`labyra-app` production)

```
FIREBASE_ADMIN_PROJECT_ID=labyra-app-dev
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
CROSSREF_POLITE_MAILTO=...  (R166 added)
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
VOYAGE_API_KEY=...
PINECONE_API_KEY=...
MISTRAL_API_KEY=...
```

### Local `.env.local` (matches Vercel + extras for migrations)

```
FIRESTORE_DATABASE_ID="(default)"   # for migration scripts
```

---

## 6. Key architectural decisions (cumulative)

Read in order (chronological):

1. **[ADR-015 Stage 1 Security](adr/ADR-015-stage-1-security.md)** — Firestore rate limit (R162)
2. **[ADR-016 PROV-O ELN](adr/ADR-016-prov-o-eln-architecture.md)** — Entity model (R164)
3. **[ADR-017 Citation Network](adr/ADR-017-citation-network.md)** — ai-6 design (R166)
4. **[ADR-018 Async Worker](adr/ADR-018-async-worker-architecture.md)** — Pub/Sub + Cloud Run (R167)

### Live governing principles (from memory)

1. **Trust > Coverage**: Citation/DOI is GROUND TRUTH. No LLM concept extraction (hallucination risk).
2. **PROV-O compliance**: Every scientific entity has audit trail (createdBy, derivedFrom, lifecycleStatus).
3. **Multi-tenant isolation**: `tenants/{tid}/...` nested paths, every query has `tenantId` filter.
4. **Next.js 16 proxy convention**: `src/proxy.ts` only, NOT `middleware.ts` (would conflict).
5. **CLAUDE.md rules**: TS strict no `any`, kebab-case files, `@tabler/icons-react`,
   shadcn/ui forms mandatory, max 200 LOC component, no emoji.

---

## 7. Pending roadmap

| Item | Effort | Priority | Blocker |
|---|---|---|---|
| **R167-A** Pub/Sub + worker skeleton | ~1h | HIGH | none |
| **R167-B** Port pipeline to Python | ~2h | HIGH | A done |
| **R167-C** Citation step in worker | ~30p | HIGH | B done |
| R166 Phase 6b — Citation UI (Cited-by + D3 viz) | ~2h | Medium | R167 (need indexed papers with citations) |
| R166 Phase 6c — AI tool `searchCitations` | ~2h | Medium | 6b |
| Spectra 3d (PL/EDS/BET) | ~3h/method | Medium | none |
| Spectra 3e (CV/LSV/EIS) | ~3h/method | Medium | none |
| Material form PROV-O upgrade | ~1h | Low | none |
| Form validation strengthen | ~1h | Low | none |
| Delete legacy `spectra` + `reference_cards` (after 7d obs) | manual | Low | observation period |
| Remove 308 redirect stubs (after 30d) | ~30p | Low | none |
| labyra-landing L8-L13 marketing | varies | Low | parallel track |

---

## 8. How newchat should bootstrap

1. **Read this handoff file first**: `docs/round-r166-handoff.md`
2. **Read ADR-018**: `docs/adr/ADR-018-async-worker-architecture.md`
3. **Read updated ROADMAP.md** and CHANGELOG.md
4. **If continuing R167**: start with Phase A — request pre-flight checklist outputs
5. **Working directory**: `~/LAB-MANAGER/labyra-app/` for app changes,
   `~/LAB-MANAGER/labyra-spectra-worker/` for worker changes
6. **Patches dir**: `/mnt/d/labbook-patches/` (user's Windows mount in WSL)
7. **User preferences**: Vietnamese language, concise no-preamble responses, incremental patches, verified before patching

---

## 9. Smoke test commands (after R167 deploy)

```bash
cd ~/LAB-MANAGER/labyra-app

# Reset blocked paper (Tungsten/Surfactants stuck in OCR)
node --env-file=.env.local scripts/_force-reset-paper.mjs <paperId>

# Lấy fresh Firebase token (browser console snippet)
# Then reprocess via API:
TOKEN="<fresh-token>"
curl -X POST "https://labyra-app.vercel.app/api/papers/<paperId>/reprocess" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: https://labyra-app.vercel.app" \
  -d '{}'

# Watch status
FIRESTORE_DATABASE_ID="(default)" node --env-file=.env.local scripts/_check-papers-status.mjs

# Verify citations populated
FIRESTORE_DATABASE_ID="(default)" node --env-file=.env.local scripts/_check-citations.mjs
```

---

## 10. End of handoff

The next session should be able to read this file + ADR-018 and continue R167 work
without re-asking architectural questions. All decisions documented.

If anything in this handoff conflicts with memory or recent code, **code wins** —
this is a snapshot from 2026-05-15 and code evolves.
