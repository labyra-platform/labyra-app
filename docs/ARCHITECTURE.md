# ARCHITECTURE.md — Labyra Platform System Overview

> System architecture for Labyra Platform. For AI-specific design, see `AI_ARCHITECTURE.md`.
> For dev workflow, see `WORKFLOW.md`. For coding rules, see `CLAUDE.md`.

**Status**: Active (R160 in progress)
**Last updated**: 2026-05-12

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

### 3.3 Security rules

See `firestore.rules`. Pattern:

```
match /tenants/{tenantId}/{document=**} {
  allow read:  if belongsToTenant(tenantId) || isSuperAdmin();
  allow write: if isWriter(tenantId)        || isSuperAdmin();
}
```

Roles:
- **viewer**: read-only within tenant
- **member**: read + write data (no admin actions)
- **admin**: full tenant access (manage members, settings)
- **superadmin**: cross-tenant, platform analytics

---

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

### 5.1 Three-tier routing

| Tier | Model | Use case | Cost/query |
|---|---|---|---|
| 1 | Gemini 2.5 Flash | Lab queries via tools (chemicals, bookings, compliance) | ~$0.003 |
| 2 | Claude Sonnet 4.6 | Spectrum analysis with Python service | ~$0.06 |
| 3 | Claude Opus 4.7 | Multi-step research synthesis with RAG | ~$0.30 |
| Bonus | Claude Haiku 4.5 | Intent routing, classification, summarization | ~$0.001 |

Intent classification with Haiku 4.5 (dispatcher), expected mix: 60% T1, 30% T2, 10% T3.
Average ~$0.04/query.

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
  tier: 1 | 2 | 3;
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

## 6. Migration from labbook-bku

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

---

## 9. References

- `CLAUDE.md` — coding rules
- `AI_ARCHITECTURE.md` — AI deep design (inherited from labbook-bku)
- `labbook-ai-architecture-report.md` — RAG improvement recommendations
- `ROADMAP.md` — phase plan
- `WORKFLOW.md` — dev process
- `docs/handoff.md` — session continuity

*Living document. Update with each architectural decision.*
