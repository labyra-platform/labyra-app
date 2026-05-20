# ARCHITECTURE.md — Labyra Platform System Overview

> System architecture for Labyra Platform. For AI-specific design, see `AI_ARCHITECTURE.md`.
> For dev workflow, see `WORKFLOW.md`. For coding rules, see `CLAUDE.md`.

**Status**: Active (R186 shipped; C1 security fix DEPLOYED; RBAC enforcement in progress)
**Last updated**: 2026-05-20
<!-- @r182-arch-refresh -->

---

## 1. Vision

Labyra Platform = AI-native lab management SaaS for materials science research.
Multi-tenant from day one (each lab = a tenant, commercial scale targeted in Phase E).

Inherits the AI core architecture from `labbook-bku` (138 rounds production), now rebuilding
the frontend layer on Next.js 16 + shadcn + recharts + Firebase.

---

## 2. Three-layer architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│                                                                  │
│  Next.js 16 App Router (TypeScript strict)                      │
│  ├─ Server Components (default) — data fetch, SEO               │
│  ├─ Client Components — interactivity, TanStack Query           │
│  ├─ i18n via next-intl (path-based /en, /vi)                    │
│  ├─ Auth via Firebase Auth (Google + Email/Password)            │
│  └─ Real-time data via Firestore listeners                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼─────────────┐
              │            │             │
   ┌──────────▼───┐  ┌────▼─────┐ ┌─────▼──────────┐
   │ Next.js API  │  │ Firebase │ │  Cloud Run     │
   │ Route        │  │  Cloud   │ │  (Python)      │
   │ Handlers     │  │ Functions│ │                │
   │              │  │          │ │                │
   │ • /api/chat  │  │ • Async  │ │ • pymatgen     │
   │   streaming  │  │   indexer│ │ • lmfit Voigt  │
   │ • Tier-routed│  │ • Pub/Sub│ │ • ASE DFT      │
   │   LLM proxy  │  │   chains │ │ • impedance.py │
   │ • RAG search │  │ • OCR    │ │ • Materials   │
   │   tool       │  │   triggers│ │   informatics │
   └──────────────┘  └──────────┘ └────────────────┘
              │            │             │
              ▼            ▼             │
   ┌─────────────────────────────────────▼──┐
   │  Firebase (asia-southeast1)            │
   │                                        │
   │  • Firestore (multi-tenant)            │
   │  • Realtime Database (chat, presence)  │
   │  • Storage (papers, spectra files)     │
   │  • Auth (Google, email/password)       │
   └────────────────────────────────────────┘
```

### Layer A — Frontend (Next.js 16)

**Runtime**: Vercel Edge + Node.js. Auto-deploy on `main` push.

**Why Next.js Route Handlers over standalone Functions** for real-time AI traffic:
- Co-deployed with frontend (single Vercel deploy)
- Native streaming via `ReadableStream`
- ~200ms cold start (vs 2-5s Firebase Functions)
- Share TypeScript types with client (no separate `functions/` package)

**When to use Firebase Functions instead**: long-running async pipelines (paper indexing,
OCR, Pub/Sub chains) where retry + dead-letter semantics matter more than latency.

### Layer B — Backend

Two backend surfaces, each for a different concern:

| Surface | Use | Examples |
|---|---|---|
| **Next.js Route Handlers** (`app/api/*/route.ts`) | Synchronous, low-latency, user-facing | `/api/chat`, `/api/search`, `/api/embed-query` |
| **Firebase Cloud Functions** (`functions/`) | Async, durable, event-driven | `chunkPaper`, `embedChunks`, `chandraProxy`, `paperPipelineRouter` |

### Layer C — Python service (Cloud Run)

Future. Required for materials informatics that TypeScript can't replace:

- `pymatgen` — crystal structure, JCPDS matching, CIF parsing
- `ASE` — DFT input generation (QE/CASTEP/VASP)
- `lmfit` — Voigt multi-Gaussian fitting (Raman, XPS)
- `impedance.py` — equivalent circuit fitting (EIS Nyquist)
- `MatSciBERT` — domain-specific embeddings (alongside Voyage)

Auto-scale 0 → 100 instances, $0 idle. See `AI_ARCHITECTURE.md` Section 3.

---

## 3. Multi-tenant data model

### 3.1 Sub-collection structure

All tenant data lives under `/tenants/{tenantId}/...`. Decision rationale: see CLAUDE.md
security rules section. TL;DR — security rules simpler 10x, indexes don't bloat with
`tenantId` field, GDPR delete is one recursive call.

```
/tenants/{tenantId}                          ← tenant metadata
  /materials/{materialId}                    ← chemicals, oxides, formulas
  /samples/{sampleId}                        ← physical specimens
  /experiments/{experimentId}                ← runs, sessions
  /dataAssets/{assetId}                      ← spectra files, raw data
  /chemicals/{chemicalId}                    ← inventory (different from materials)
  /equipment/{equipmentId}                   ← XRD, SEM, etc.
  /bookings/{bookingId}                      ← equipment reservations
  /members/{memberId}                        ← lab members + roles
  /paperChunks/{chunkId}                     ← RAG corpus (Phase 5+)
  /bm25Tokens/{tokenId}                      ← BM25 inverted index
  /aiConversations/{conversationId}          ← chat history
  /aiProvenance/{messageId}                  ← AI response audit trail
  /labMemory/{factId}                        ← episodic memory (Phase B.6+)
  /auditLogs/{logId}                         ← admin actions (immutable)

/platform/...                                ← super-admin only, cross-tenant
```

### 3.2 Auth claims

Firebase Auth custom claims set via `setCustomUserClaims()` from server (seed script or
admin tools):

```typescript
{
  tenantId: string,                          // required
  role: 'admin' | 'superadmin' | 'member' | 'viewer'
}
```

Client reads claims via `useAuth().claims` or convenience hooks:
- `useTenantId()` → string | null
- `useRole()` → AuthRole | null
- `useIsAdmin()` → boolean
- `useIsSuperAdmin()` → boolean

### 3.3 Security rules (R183-1 / C1 — fixed + deployed)

See `firestore.rules` + ADR-030. **Firestore rules are ADDITIVE (OR-logic)** — a
broad allow cannot be "overridden" by a later deny. The earlier catch-all
`match /tenants/{tenantId}/{document=**} { allow write: isWriter }` was a CRITICAL
hole (C1): it granted write to every subcollection, defeating `write:false` on
aiProvenance/usage/papers/citations/auditLogs (member could zero-out quota →
free AI; tamper audit trail; poison RAG). Fixed by listing every collection
EXPLICITLY (no catch-all inside /tenants), with a single root default-deny last:

```
match /tenants/{tenantId} {
  // writable (isWriter): materials, samples, experiments, spectra,
  //   equipment, bookings, aiConversations(+messages)
  // admin-SDK-only (write:false): analyses, citations, references,
  //   papers(+chunks/_stats), aiProvenance, usage
  // admin-read server-write: _costs, _evals
  // server-only (no client): _rate_limits, _idempotency
  // auditLogs: create by writer, immutable (update,delete:false)
  // members: admin-write
}
match /{document=**} { allow read, write: if false; }  // default-deny LAST
```

Verified by `tests/firestore-rules.test.ts` (33 cases). Deployed to production.

**IMPORTANT**: Firestore rules only protect DIRECT client-SDK access. The app
writes via Admin SDK (which bypasses rules), so the real authorization boundary
for app traffic is the API layer — see 3.4.

Roles:
- **viewer**: read-only within tenant
- **member**: read + write data (no admin actions)
- **admin**: full tenant access (manage members, settings, billing)
- **superadmin**: cross-tenant, platform analytics

---

### 3.4 RBAC enforcement layers + onboarding (ADR-030)

Authorization is enforced at THREE layers; the API layer is the source of truth:

| Layer | Role | Status |
|---|---|---|
| Firestore rules (data) | Block direct client-SDK writes | Fixed (C1), deployed |
| **API routes (action)** | **Source of truth** — Admin SDK bypasses rules, so per-route role checks are the real gate | **In progress (R183+)** |
| UI (cosmetic) | Hide controls by role | Mirror backend only |

RBAC model (phase 1 = pure RBAC): member = full CRUD within tenant, viewer =
read-only. Per-route helpers `requireWriter` / `requireAdmin` / `requireSuperadmin`
on top of `authenticate()`. ABAC ownership (member edits only own records) +
request-to-join deferred to phase 2.

Onboarding (B2B, invite-only phase 1):
- Buyer signs up → a new tenant is created → they become the tenant **admin**
  (owner). Billing is per-tenant.
- Members join by invite only: admin invites email + role (member/viewer) → a
  Cloud Function assigns `{tenantId, role}` claims on accept. Two distinct signup
  flows: create-new-tenant vs join-existing-via-invite.
- Anti privilege-escalation: a user may only assign roles BELOW their own (admin
  cannot grant admin/superadmin; only superadmin creates admins).

### 3.4 RBAC enforcement layers + onboarding (ADR-030)

Authorization is enforced at THREE layers; the API layer is the source of truth:

| Layer | Role | Status |
|---|---|---|
| Firestore rules (data) | Block direct client-SDK writes | Fixed (C1), deployed |
| **API routes (action)** | **Source of truth** — Admin SDK bypasses rules, so per-route role checks are the real gate | **In progress (R183+)** |
| UI (cosmetic) | Hide controls by role | Mirror backend only |

RBAC model (phase 1 = pure RBAC): member = full CRUD within tenant, viewer =
read-only. Per-route helpers `requireWriter` / `requireAdmin` / `requireSuperadmin`
on top of `authenticate()`. ABAC ownership (member edits only own records) +
request-to-join deferred to phase 2.

Onboarding (B2B, invite-only phase 1):
- Buyer signs up → a new tenant is created → they become the tenant **admin**
  (owner). Billing is per-tenant.
- Members join by invite only: admin invites email + role (member/viewer) → a
  Cloud Function assigns `{tenantId, role}` claims on accept. Two distinct signup
  flows: create-new-tenant vs join-existing-via-invite.
- Anti privilege-escalation: a user may only assign roles BELOW their own (admin
  cannot grant admin/superadmin; only superadmin creates admins).

## 4. Frontend structure

### 4.1 App Router layout

```
src/app/[locale]/
├── layout.tsx                  # Root: AuthProvider, theme, i18n
├── (auth)/                     # Public auth pages
│   ├── sign-in/
│   └── sign-up/
└── dashboard/
    ├── layout.tsx              # Sidebar + header shell
    ├── overview/
    │   ├── layout.tsx          # KPI cards + parallel route grid
    │   ├── @bar_stats/         # Parallel route slot
    │   ├── @area_stats/
    │   ├── @pie_stats/
    │   └── @sales/
    ├── materials/              # Stub → Phase 4
    ├── samples/                # Stub → Phase 4
    ├── experiments/            # Stub → Phase 4
    ├── ai-assistant/           # Stub → Phase 5
    └── ...
```

### 4.2 Component organization

```
src/
├── components/
│   ├── ui/                     # shadcn primitives (auto-generated)
│   ├── layout/                 # AppSidebar, Header, providers, etc.
│   └── [domain]/               # Domain-specific (future)
├── features/                   # Composite UI for a feature
│   └── overview/components/    # KPI cards, charts, recent experiments
├── hooks/                      # Generic hooks
├── lib/
│   ├── auth/                   # AuthProvider, claims hooks, server helpers
│   ├── firebase/               # Client SDK + Admin SDK init
│   ├── firestore/              # use-tenant-collection, queries/*
│   └── utils.ts                # cn() only — shadcn convention
├── stores/                     # Zustand stores (UI state)
└── types/                      # Global TS types
```

### 4.3 Server vs Client Components

**Server Components by default** — no `"use client"`. Use for:
- Data fetching via Firebase Admin SDK
- SEO-relevant content
- Heavy markdown/static content

**Client Components opt-in** — `"use client"` at file top. Required for:
- Interactivity (`useState`, event handlers)
- Firebase Auth state (browser-only)
- Firestore real-time listeners
- TanStack Query hooks

### 4.4 Data flow patterns

**Tenant-scoped read** (most common):

```typescript
'use client';
import { useTenantCollection } from '@/lib/firestore/use-tenant-collection';

function MaterialsList() {
  const { data, isLoading } = useTenantCollection<MaterialDoc>({
    collection: 'materials',
    constraints: [orderBy('createdAt', 'desc'), limit(50)]
  });
  // ...
}
```

**Server-side write** (mutations via Server Actions or Route Handlers):

```typescript
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { requireRole } from '@/lib/auth/server';

export async function createMaterial(data: NewMaterial) {
  const user = await requireRole(['admin', 'member']);
  const db = getAdminFirestoreService();
  await db.collection(`tenants/${user.tenantId}/materials`).add({
    ...data,
    createdAt: Timestamp.now(),
    createdBy: user.email
  });
}
```

---

## 5. AI layer (summary — see AI_ARCHITECTURE.md for detail)

### 5.1 Six-tier routing (locked per ADR-019, R182)

| Tier | Model | Use case | Cost/query | Status |
|---|---|---|---|---|
| T0 | Gemini Flash-Lite | Intent classifier + security shield (input scan) | ~$0.0001 | Live |
| T1 | Gemini Flash-Lite | Lab ops queries via tools (chemicals, bookings) | ~$0.003 | Live |
| T2 | Gemini 3 Flash | Spectrum analysis, paper classify (R178/R181-9), journal resolve | ~$0.001-0.06 | Live |
| T3 | Claude Sonnet 4.6 | Theory chat, RAG synthesis, paper writing | ~$0.06 | Live |
| T4 | Claude Sonnet 4.6 | Multi-step lab ops with tool chains | ~$0.10 | Live |
| T5 | Claude Opus 4 | Complex reasoning, full-paper review | ~$0.30 | Live |

Intent classification at T0 (Gemini Flash-Lite). Expected mix: 70% T1-T2, 25% T3-T4, 5% T5.
Average ~$0.02/query. See ADR-019 (tier architecture), ADR-020 (cost controls), ADR-021 (inter-tier protocols).

### 5.2 RAG pipeline (port from labbook-bku R130-R142)

```
Paper upload → Chandra OCR → section-aware chunk → contextual enrich (Anthropic)
  → Voyage embed → Firestore vector + BM25 inverted index
                                         ↓
Query → BM25 + dense parallel → RRF fusion → Voyage rerank-2.5 → top-K
                                         ↓
                                Tool returns to LLM with citations [1][2]
```

**Improvements over labbook-bku** (planned in this rebuild):
- **Prompt caching** from day one (Anthropic feature) — saves 70-90% AI cost
- **Contextual chunking** during ingestion — Anthropic shows 49-67% retrieval improvement
- **HyDE query rewriting** for complex queries (deferred)

See `labbook-ai-architecture-report.md` for detailed analysis.

### 5.3 Provenance chain

Every AI response writes to `/tenants/{tenantId}/aiProvenance/{messageId}`:

```typescript
interface AIProvenance {
  conversationId: string;
  tier: 0 | 1 | 2 | 3 | 4 | 5;  // 6-tier per ADR-019
  model: string;
  tools_called: ToolCall[];
  rag_chunks_used: { paperId, chunkId, rerankScore }[];
  python_endpoints_called: string[];
  cost: { input, output, cache_read, cache_write };
  latency_ms: number;
  timestamp: Timestamp;
}
```

Required for: thesis defensibility, cost analytics per tenant, audit logs.

---

## 7. R161 — XRD Analysis Pipeline (May 2026)

### 7.1 Per-Peak Tier 1+2 Metrics

Worker `_enrich_peaks()` computes per-peak derived properties from detected peaks:

| Metric | Formula | Reference |
|---|---|---|
| d-spacing | `d = λ / (2·sin(θ))` | Bragg's law |
| Crystallite size D | `D = K·λ / (β·cosθ)`, K=0.9 | Scherrer 1918 |
| Integral breadth β | `β = FWHM · (η·1.5708 + (1−η)·1.0645)` | Pseudo-Voigt weighted |
| Dislocation density δ | `δ = 1/D²` (lines/m²) | Williamson-Smallman 1956 |
| Microstrain ε | `ε = β·cosθ / 4` | per-peak |

Source: `src/parsers/xrd.py` in spectra-worker. Documented in `docs/scientific-methods/xrd-analysis.md`.

### 7.2 Profile Function Fitting

`_fit_peak_profile()` fits user-selected profile to each detected peak via `scipy.optimize.curve_fit`:

```
Gaussian:     G(x) = A·exp(-(x-x₀)²/(2σ²))
Lorentzian:   L(x) = A·γ²/((x-x₀)² + γ²)
Pseudo-Voigt: PV(x) = η·L(x) + (1-η)·G(x)  [default]
```

Quality gate: R² ≥ 0.5 → use fit; else fall back to scipy.find_peaks width estimate.

### 7.3 Citation Pipeline + Cache

Flow:
```
formula → COD search + MP search (parallel)
       → For each candidate: 
           cache.get() → HIT: skip fetch + simulate
                       → MISS: fetch CIF + Dans_Diffraction simulate → cache.set()
       → Match peaks vs simulated (±0.3° tolerance, score = 0.7·match + 0.3·intensity_corr)
       → Sort by score, return top 5
       → Assign hkl from top candidate to enriched peaks
```

**Citation cache** (`src/citation/cache.py`): Protocol pattern abstraction.
- Production: `FirestoreCitationCache` at `tenants/_global/citation_cache/{source}-{id}`
- Test: `NoOpCitationCache`
- Future: `RedisCitationCache`, `PostgresCitationCache` — migration-safe

TTL: 30 days. Hit rate >80% expected (same materials repeated).

### 7.4 AI Grounding (R161-determinism)

- `temperature=0` for Anthropic API calls — deterministic output
- AI receives citation candidates as context; must ground assertions in `{type, id, doi?}`
- "Unverified" badge when no high-confidence match (better empty than hallucinated)

### 7.5 Worker Scale (Cloud Run)

| Parameter | R160 | R161 |
|---|---|---|
| Concurrency | 5 | 10 |
| Memory | 2Gi | 4Gi |
| CPU | 2 | 2 |

With citation cache hit (warm), spectrum analysis: 25-30s → 5-10s.

### 7.6 Reference Card System (4a-pdf, legal-safe)

User-pasted XRD reference cards (HighScore Plus / ICDD text format) parsed client-side:
```
Path: tenants/{tenantId}/reference_cards/{id}
Schema: {cardNumber, phaseName, formula, peaks[{twoTheta, dSpacing, intensity, hkl}], anode, source: 'manual'}
```

Legal: ICDD PDF database copyrighted → never redistribute. Only user-input data accepted.
Future: ICDD partnership for licensed distribution.

### 7.7 New API Endpoints

```
POST   /api/spectra/[id]/reanalyze        — Pub/Sub republish (backfill new fields)
POST   /api/reference-cards               — Create from parsed peaks (Zod validated)
GET    /api/reference-cards               — List tenant's cards
GET    /api/reference-cards/[id]          — Get single (tenant-scoped)
DELETE /api/reference-cards/[id]          — Delete (tenant-scoped)
POST   /reference/parse                   — Worker: text → structured (stateless)
```

All app endpoints: Firebase auth + tenantId claim mandatory.

---\n\n---\n\n## 6. Migration from labbook-bku

### 6.1 What's being migrated

| Layer | Strategy | Status |
|---|---|---|
| **Frontend** | Full rebuild (Vite → Next.js) | R160 in progress |
| **AI backend** (Cloud Functions) | Lazy migration (per-phase) | Pending Phase 5 |
| **AI architecture** (3-tier, RAG, provenance) | Inherit + improve | Designed |
| **Domain models** | Refactor (top-level tenantId → sub-collection) | R160-dashboard-1 done |
| **Firestore data** | Re-seed, not import | Dev: `tenant-dev-001` seeded |

### 6.2 Schema mapping (labbook-bku → Labyra)

| labbook-bku (named DB `labbook`) | Labyra (Firestore default DB) |
|---|---|
| `paperChunks/{chunkId}` | `/tenants/{tenantId}/paperChunks/{chunkId}` |
| `bm25Tokens/{tokenId}` | `/tenants/{tenantId}/bm25Tokens/{tokenId}` |
| `aiPapers/_shared` (RTDB) | `/tenants/{tenantId}/papers` (Firestore) |
| `aiConversations/{uid}/{convId}` (RTDB) | `/tenants/{tenantId}/aiConversations/{uid}/{convId}` (RTDB, keep RTDB for streaming) |
| `lab_memory` (planned) | `/tenants/{tenantId}/labMemory` |

### 6.3 Cloud Functions migration path

For each function in labbook-bku, decide:
- **Keep in Firebase Functions**: async pipelines (chunkPaper, embedChunks, OCR)
- **Move to Route Handler**: synchronous proxies (claudeProxy → `/api/chat`, voyageProxy → `/api/embed`)
- **Defer**: not in current phase (geminiProxy if not yet wired)

---

## 7. Deployment topology

```
Production:
  Frontend  → Vercel (auto-deploy from main)
  Backend   → Firebase (firebase deploy --only firestore:rules,functions)
  Python    → Cloud Run (when implemented)

Development:
  Frontend  → pnpm dev (localhost:3000)
  Backend   → Firebase emulators (optional) or direct labyra-app-dev
  Python    → uvicorn local (when implemented)

Environments:
  - labyra-app-dev  (current dev tenant + data)
  - labyra-app-prod (planned for Phase E commercial)
  - lab-manager-268a6 (legacy labbook-bku, frozen)
```

### 7.1 Env vars

See `.env.local` template. 13 vars total:

```
NEXT_PUBLIC_FIREBASE_*  (7 vars) — exposed to browser bundle
FIREBASE_ADMIN_*        (3 vars) — server-only, service account
BUILD_STANDALONE        — Vercel deploy flag

# Phase 5 AI:
ANTHROPIC_API_KEY       — server-only, via Vercel env
VOYAGE_API_KEY          — server-only
GEMINI_API_KEY          — server-only
```

### 7.2 Firebase deployment

```bash
firebase use dev                                # select labyra-app-dev
firebase deploy --only firestore:rules          # rules only (safe)
firebase deploy --only firestore:indexes        # index changes
firebase deploy --only functions                # when functions exist
```

---

## 8. Decision log (Labyra-specific, R160 era)

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-11 | Sub-collection tenant model | Simpler rules, cleaner GDPR delete, no field-level indexes |
| 2026-05-11 | Tremor → recharts | Tremor pivoted to copy-paste (Tremor Raw), not actively maintained as a library |
| 2026-05-11 | Next.js Route Handlers for chat | Co-deployed with frontend, faster cold start, native streaming |
| 2026-05-11 | Prompt caching from day one | Anthropic benchmark: 70-90% cost savings on multi-turn |
| 2026-05-11 | Project split: dev / prod (planned) / legacy | Clean isolation, follows SaaS best practices |
| 2026-05-11 | `_debug-auth` → `debug-auth` (no underscore) | Next.js ignores `_`-prefixed routes |
| 2026-05-12 | Manual `pnpm snapshot` for agent context | Avoid committing 200+ snapshot files to repo |
| 2026-05-12 | Storage region asia-southeast1 (Blaze) | Match Firestore + Cloud Functions region |
| 2026-05-14 | XRD Tier 1+2 metrics + profile fitting | International-standard scientific output (R161) |
| 2026-05-15 | Async Pub/Sub for paper processing | Vercel 60s timeout blocker (R167, ADR-018) |
| 2026-05-17 | 6-tier AI architecture locked | ADR-019 — capability abstraction stable |
| 2026-05-18 | Layer 2 orphan audit cron | ADR-026 — informational only, no auto-delete |
| 2026-05-18 | Crossref + OpenAlex journal resolver | ADR-027 — normalize journal names from DOI/ISSN |
| 2026-05-19 | OCR cache via GCS + SHA256 | ~$0.001/page saved on reprocess (R181) |
| 2026-05-19 | Classify prompt v1.1 anti-passing-reference | 5 new rules prevent false positive material assignments (R181-9) |
| 2026-05-19 | URL /api/measurements stays, Firestore stays /spectra | R181-11 — partial rename revealed during R182 debugging; full migration R190+ |
| 2026-05-19 | FTIR reference library 29 cards seeded | R182 — NIST + Coates IR Table, schema via POST /api/references |
| 2026-05-19 | ADR-028/029 proposed (security + testing) | R183+ batch: Mozilla 100/100, idempotency, 5-level security testing |

---

## 9. References

- `CLAUDE.md` — coding rules
- `AI_ARCHITECTURE.md` — AI deep design (inherited from labbook-bku)
- `labbook-ai-architecture-report.md` — RAG improvement recommendations
- `ROADMAP.md` — phase plan
- `WORKFLOW.md` — dev process
- `docs/handoff.md` — session continuity

*Living document. Update with each architectural decision.*

---

## 10. R160 Phase Additions (May 13, 2026)

This section captures structural additions since the last update of this doc.
For chronological ADRs see `architecture-decisions.md`.
For session continuity see `docs/handoff-r160-spectra.md`.

### 10.1 Lab data entities (R160-data-1 + R160-data-2)

Five new domain collections under `tenants/{tenantId}/`:

| Collection | Schema | Composite indexes |
|---|---|---|
| `materials` | name, formula, category, cas, quantity+unit, location, hazardLevel | `(category, updatedAt desc)` |
| `samples` | sampleCode, name, parentMaterialIds[], derivedFromSampleId, mass/volume/concentration, status, location | `(status, preparedAt desc)` |
| `experiments` | experimentCode, title, experimentType, status, sampleIds[], equipmentUsed[], conditions (T, P, duration) | `(status, updatedAt desc)` |
| `equipment` | equipmentCode, name, category, manufacturer/model/serial, location, status, maintenance dates | `(status, updatedAt desc)`, `(category, updatedAt desc)` |
| `bookings` | equipmentId (FK), userId, startAt, endAt, purpose, status | `(equipmentId, startAt asc)`, `(userId, startAt desc)`, `(status, startAt asc)` |

All schemas include `schemaVersion: 1`, audit fields (`createdAt`/`updatedAt`/`createdBy`), and `tenantId`.

**Backward-compat:** Pre-R160 data (legacy) lacks `id` field and may use old field names
(`type` instead of `experimentType`, no `experimentCode`). Tables and queries inject
`{...doc.data(), id: doc.id}` and fall back via `data.X ?? data.legacyField` patterns.

### 10.2 Spectrum data pipeline (R160-spectra-1 + R160-spectra-2) — Stage 2 Phase 1

24 spectrum types across 6 analyzer groups per `docs/labyra-experiment-database-report.md`:

```
Browser                            Backend                       Storage
─────────────────────────────────────────────────────────────────────────
[Dropzone]                                                       
   │                                                             
   ├── client compute SHA-256                                    
   │                                                             
   ├──► POST /api/spectra/signed-upload ──► Admin SDK ──► Firebase Storage
   │                                        getSignedUrl()       (signed URL)
   │   ◄── { spectrumId, signedUrl, storagePath }                
   │                                                             
   ├──► PUT file directly to GCS  ──────────────────────────────►[raw/file]
   │   (bypasses Next.js backend bandwidth)                      
   │                                                             
   └──► POST /api/spectra/notify-complete ──► Admin SDK          
                                              ├── verify file exists
                                              ├── verify size matches  
                                              └── create SpectrumMetadata doc ──► Firestore
                                                  status: 'uploaded'           
                                                                                
                                                  ┌──── Phase 2 (deferred) ───┐
                                                  │ Cloud Pub/Sub             │
                                                  │   ↓                       │
                                                  │ Cloud Run Python worker   │
                                                  │   ├── download from GCS   │
                                                  │   ├── parse (pymatgen)    │
                                                  │   ├── AI analysis (Sonnet)│
                                                  │   └── status: 'analyzed'  │
                                                  └───────────────────────────┘
```

**Storage path convention** (immutable raw, versioned processed):
```
tenants/{tenantId}/spectra/{spectrumId}/
  raw/<original-filename>           ← write-once, no overwrite
  processed/<derived-files>         ← Phase 2 writes here
  thumbnail.jpg                      ← image types only
```

**Tenant isolation enforcement points:**
- Firebase Storage rules: `tenants/{tenantId}/spectra/{spectrumId}/{path=**}` allows reads only when `request.auth.token.tenantId == tenantId`; writes denied (Admin SDK signed URL only)
- API routes verify `decoded.tenantId === path.tenantId` before issuing signed URL or creating doc
- Firestore composite indexes scoped to tenant collection

**Composite indexes deployed for `spectra`:**
- `(experimentId, measuredAt desc)` — list spectra of experiment
- `(sampleId, spectrumType asc)` — compare samples by spectrum type
- `(spectrumType, createdAt desc)` — type-wide listing
- `(status, createdAt asc)` — analysis queue (used by Phase 2 worker)

### 10.3 UI architecture (R160-data-1c + R160-ui-1 + R160-spectra-2)

All forms migrated to **shadcn Form pattern**:
```
<Form {...form}>
  <FormField name="x" render={({field}) => (
    <FormItem>
      <FormLabel>{t('x')}</FormLabel>
      <FormControl><Input {...field} /></FormControl>
      <FormMessage />  ← auto-render Zod errors
    </FormItem>
  )}/>
</Form>
```

All tables use **shadcn Table** (`<Table><TableHeader><TableBody><TableRow>...`). No raw HTML
`<table>` allowed.

All list pages use `<PageContainer pageTitle pageDescription pageHeaderAction>` for design
system consistency.

WCAG 2.3.3 reduced-motion respected globally via `globals.css` media query.

Standards reference: `docs/uiux-international-standards.md` (also available as
`.claude/skills/ui-ux-standards/` for Claude Code auto-discovery).

### 10.4 i18n architecture

next-intl path-based routing (`/en`, `/vi`). Messages tree mirrors namespace structure:
- `materials.{title, subtitle, form.*, category.*, hazard.*}`
- Same pattern for `samples`, `experiments`, `equipment`, `bookings`, `spectra`
- All enum values translated (e.g. `materials.category.chemical` → "Hóa chất" / "Chemical")

**Critical pattern:** Use `t.has(key) ? t(key) : key` for any key that may not exist
(dynamic route segments in breadcrumbs, legacy enum values in tables). `try/catch` does NOT
suppress next-intl's MISSING_MESSAGE error events.

---

## 11. Updated Decision Log (R160)

Continued from Section 8 above.

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-13 | shadcn Form/Table mandatory for all UI | UI/UX standards compliance, accessibility automatic via Radix |
| 2026-05-13 | Doc ID injection `{...d.data(), id: d.id}` everywhere | Legacy docs missing `id` field break React keys; defensive pattern |
| 2026-05-13 | Stage 2 Phase 1 uses Firebase Storage (not native GCS bucket) | Existing infra (Admin SDK, signed URLs, rules) — same GCS under hood, faster to ship |
| 2026-05-13 | 24 spectrum types in 6 groups (XRD/UV-Vis/Raman/FTIR/CV/EIS/GCD/LSV/CA/PEC-JV/IPCE/XPS/EDS/BET/SEM/TEM/AFM/...) | Authoritative per database report; covers full materials science range |
| 2026-05-13 | Composite indexes pre-deployed in patch | Avoid runtime "missing index" failures in production; declarative IaC |
| 2026-05-13 | Backward-compat tables with `data.X ?? data.legacyField` | Tolerate pre-R160 data without forcing migration |
| 2026-05-13 | Multi-turn AI history loaded from Firestore subcollection | Stateless API routes; explicit 20-message limit; Anthropic/Gemini block reconstruction |
| 2026-05-13 | Anti-hallucination expanded to 7 layers (L2-L4 + L6-L7) | L2 citation, L3 numerical, L4 rerank threshold, L6 OOD classifier (Haiku), L7 empty result guard |

---

## 12. R160 Phase Status (May 13, 2026)

### Shipped phases
- ai-3, ai-4, ai-5a (RAG foundation), ai-5b (paper pipeline)
- ai-5e-1/1b/1c (anti-hallucination L2+L3+L4 + multi-turn + Việt-$)
- ai-5e-2 (L6 OOD + L7 empty guard + Gemini block conversion)
- data-1 / data-1b / data-1c (Materials/Samples/Experiments CRUD + shadcn refactor)
- data-2 (Equipment + Bookings + 8 composite indexes)
- ai-tools-1 (lab tools schema align)
- ui-1 (Papers PageContainer + reduced-motion + Stage 2 plan docs)
- spectra-1 (24 spectrum types + signed URL upload + SHA-256)
- spectra-2 (experiment Tabs + standalone /spectra route + detail view)

### Pending phases
- **Phase 2 (spectra worker):** Cloud Run + Pub/Sub + Python parsers + Sonnet AI analysis
- **Phase 3 (time-series):** BigQuery for GCD/CA traces with row-level security
- **Dashboard widgets:** KPI cards + recent activity (deferred per session decision)
- **Lineage graph:** Material → Sample → Experiment D3 viz
- **Members + RBAC:** invite flow
- **Settings page:** tenant config

See `ROADMAP.md` for the full ordered plan and `docs/handoff-r160-spectra.md` for session continuity.

---

## 12. R161-R182 Phase Additions (May 14 - May 19, 2026)

This section captures structural additions since R160. ADRs for each are in `docs/adr/`.

### 12.1 XRD analysis pipeline (R161, May 14)

Tier 1+2 metrics: d-spacing, Scherrer crystallite size D, β width, micro-strain ε, dislocation density δ, crystallinity %, quality_metrics. Profile fitting: Gaussian / Lorentzian / Pseudo-Voigt with R² gating. Per-phase lattice + space group summary. Citation cache Protocol on Firestore (30-day TTL).

Doc: `docs/scientific-methods/xrd-analysis.md`.

### 12.2 Async paper processing pipeline (R167, May 15)

Vercel `/api/papers/upload` and `/reprocess` publish to Pub/Sub topic `paper-processing`. Cloud Run worker `spectra-worker` subscribes via `spectra-worker-papers-push`. Processing 16-page paper in 16s, 3-page in 8s. Env `PAPER_QUEUE_BACKEND=pubsub` (rollback flip to `in-process`). REST API for Pub/Sub (gRPC fails on Vercel serverless). ADR-018.

### 12.3 Auto-classify paper domain (R178-3, May 18)

Taxonomy v1: 36 categories across 4 axes (13 APP + 9 MAT + 6 SYN + 5 CHAR + 3 META). Primary candidates = 25 slugs, subtopics = 20. Worker Step 1d via Gemini 3 Flash, ~$0.001/paper. Audit log `_audit_classify/{paperId}_{ts}`. UI: PaperDomainBadge + filter. ADR-025.

R181-9 prompt v1.1: added rules 7-11 preventing passing-reference false positives. Input window 3000 → 5000 chars.

Doc: `docs/scientific-methods/paper-domain-classification.md`.

### 12.4 Layer 2 data integrity (R179, May 18)

Cloud Function `auditOrphansWeekly` Sun 04:00 UTC. Scans all tenants, computes orphan set per collection. Writes to `_orphan_audit/{date}`. Informational only, no auto-delete. ADR-026.

### 12.5 Journal extraction (R179-2, May 18)

Worker Step 1e. Crossref lookup by DOI → OpenAlex fallback by ISSN → canonical journal name. Cache 90-day in `_journal_resolve_cache/{key}`. UI: PaperFilterPanel exposes journal filter. ADR-027.

Doc: `docs/scientific-methods/journal-extraction.md`.

### 12.6 PDF viewer R179-7 (May 18)

react-pdf v10 + custom toolbar + fuse.js fuzzy title search + InfoSidebarConditional (hides right sidebar on /view pages). Rejected commercial viewers (react-pdf-viewer.dev, @react-pdf-kit/viewer).

R181-2 to R181-8 hotfix series: decoupled ResizeObserver, fixed infinite re-render loop, fullscreen race fix, container width lock to parentElement.

### 12.7 OCR cache (R181, May 19)

GCS-backed OCR cache by SHA256 content hash. Path: `gs://{bucket}/ocr-cache/{sha256}.json`. Lifecycle: 365-day delete. Savings ~$0.001/page on reprocess (~$0.80 per 16-page paper reprocess).

### 12.8 FTIR reference library (R182, May 19)

29 functional group reference cards seeded into `tenants/{tid}/references` via `POST /api/references`. Sources: NIST WebBook + Coates IR Table. Categories: hydroxyl/water, carbonate, sulfate/nitrate/phosphate, silicate/aluminate, metal oxides, organic functional groups, specific materials (PFSA, GO, cellulose, MOF). Matching: ±15 cm⁻¹ tolerance, score ≥ 0.3 threshold. Surfaces via MultiCitationsPanel.

Doc: `docs/scientific-methods/ftir-reference-library.md`.

### 12.9 Proposed for R183+ (ADR-028/029)

- **ADR-028**: Mozilla Observatory 100/100 security headers (8 HTTP headers + CSP nonce). Idempotency Key SHA-256. Feature Flag system. Backup/DR Cloud Function. MCP server MVP (3 tools: listChemicals, searchPapers, recentExperiments) — strategic pitch differentiator.
- **ADR-029**: 5-level security testing. L1 static audit per PR. L2 weekly OWASP ZAP + Trivy. L3 manual auth testing. L4 AI red team (50+ prompt injection payloads). L5 deferred to pre-Series A.

### 12.10 Removed / superseded from earlier sections

- Section 5.1 three-tier table (R160 era) → six-tier R182 (above)
- Section 5.3 provenance `tier: 1|2|3` → `0|1|2|3|4|5`
- "Bonus tier Haiku 4.5" deprecated; Haiku 4.5 retained for migration cases only, default routing uses Gemini Flash family for T0-T2

---
