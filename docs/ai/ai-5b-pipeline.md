# AI-5b: Paper Processing Pipeline

> **Stage 1 implementation** (PMF-stage, in-process async).
> Migration paths to Stage 2 (Cloud Run + PubSub) and Stage 3 (multi-region) documented below.
> Related: `docs/labyra-strategy.md` for overall positioning.

---

## 1. Scope

### Goals (Stage 1)

- User uploads PDF paper → searchable via RAG
- Multi-tenant isolation (data + cost)
- Idempotent (re-upload same file = no duplicate work)
- Cancellable (user can abort mid-processing)
- Observable (status, cost, provenance per paper)
- Quota-enforced (tenant quotas prevent abuse)

### Non-goals (deferred)

- Real-time collaboration on papers
- ML-based figure caption extraction beyond OCR
- Multi-paper synthesis (ai-6 GraphRAG)
- Zotero / Mendeley import (ai-7)
- DOI auto-fetch from CrossRef on upload (ai-5c)
- Cloud Run worker (Stage 2 migration)
- PubSub queue (Stage 2 migration)
- Distributed tracing (Stage 3)

---

## 2. Stage 1 Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  CLIENT (Browser)                          │
│  /papers/upload (drag-drop PDF)                            │
│  /papers (list, realtime status via Firestore listener)    │
│  /papers/{paperId} (detail, processing timeline, sources)  │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│              VERCEL (Next.js — single deployment)          │
│                                                            │
│  /api/papers/upload    [synchronous]                       │
│    - Auth + tenant verify                                  │
│    - Quota check (papers/month, storage)                   │
│    - Compute SHA-256 of PDF bytes                          │
│    - Idempotency: skip if paperId exists                   │
│    - Upload to Firebase Storage                            │
│    - Create Firestore doc (status=queued)                  │
│    - Enqueue via InProcessQueue.enqueue(jobId)             │
│    - Return paperId (< 5s)                                 │
│                                                            │
│  /api/papers/{id}/cancel  [synchronous]                    │
│    - Set status=cancelling                                 │
│    - AbortController.abort() if job running                │
│                                                            │
│  /api/papers/{id}/reprocess  [synchronous]                 │
│    - Increment version                                     │
│    - Re-enqueue                                            │
│                                                            │
│  Background async (InProcessQueue):                        │
│    processPaperAsync(paperId):                             │
│      1. status=ocr      → Mistral OCR                      │
│      2. status=chunking → 1024 token sliding, 100 overlap  │
│      3. status=enriching → Haiku 4.5 + prompt cache        │
│      4. status=embedding → Voyage voyage-3-large (batch)   │
│      5. status=indexing → Pinecone upsert namespace=tid    │
│      6. status=indexed                                     │
│    On error: retry 3x exponential. Final: status=failed    │
│    On cancel signal: cleanup + status=cancelled            │
└────────────────────────────────────────────────────────────┘
                     │
                     ├─→ Firebase Storage (papers/{tid}/{pid}.v{n}.pdf)
                     ├─→ Firestore (papers/{pid}, jobs/{jid}, aiProvenance)
                     ├─→ Mistral OCR REST API
                     ├─→ Anthropic API (Haiku enrichment)
                     ├─→ Voyage REST API (embed)
                     └─→ Pinecone (namespace per tenant)
```

**No Cloud Run, no PubSub, no observability stack.** Stage 1 keeps it simple.

---

## 3. Data model

### Firestore: `tenants/{tid}/papers/{paperId}`

```typescript
interface Paper {
  schemaVersion: 1;

  // Identity
  id: string;                  // SHA-256 of PDF bytes
  tenantId: string;
  version: number;             // Increments on reprocess

  // Source
  source: 'upload' | 'doi-import' | 'crossref';
  storagePath: string;         // gs://.../papers/{tid}/{id}.v{version}.pdf
  contentHash: string;         // SHA-256 (= id for upload)
  fileSize: number;
  uploadedBy: string;
  uploadedAt: number;

  // Metadata (filled during processing)
  title: string;
  authors: string[];
  year: number;                // 0 if unknown
  doi: string;                 // '' if unknown
  abstract: string;            // '' if unknown
  pageCount: number;

  // State machine
  status:
    | 'queued'
    | 'ocr'
    | 'chunking'
    | 'enriching'
    | 'embedding'
    | 'indexing'
    | 'indexed'
    | 'failed'
    | 'cancelled';
  statusUpdatedAt: number;
  error: string;
  cancelRequestedAt: number;
  retryCount: number;
  maxRetries: number;          // default 3

  // Progressive counts
  chunkCount: number;
  enrichedChunkCount: number;
  embeddedChunkCount: number;
  indexedChunkCount: number;

  // Cost tracking
  costUsd: {
    ocr: number;
    enrichment: number;
    embedding: number;
    total: number;
  };

  // Timing
  processingStartedAt: number;
  processingCompletedAt: number;
  totalLatencyMs: number;
}
```

### Firestore: `tenants/{tid}/papers/{pid}/chunks/{chunkId}`

Stored in Firestore for: BM25 fallback search, citation rendering, audit.

```typescript
interface PaperChunk {
  schemaVersion: 1;
  id: string;                  // {paperId}-{chunkIdx}
  paperId: string;
  chunkIdx: number;
  text: string;                // Raw chunk text
  contextualText: string;      // Enriched (chunk + surrounding context)
  pages: number[];
  section: string;             // Heading or ''
  tokens: number;
}
```

### Pinecone: namespace = `tenantId`, vector metadata

See `src/lib/ai/rag/vector-store/pinecone.ts` (`PaperChunkMetadata`).

### Firestore: `tenants/{tid}/usage/{YYYY-MM}`

Monthly usage accumulator for quota enforcement.

```typescript
interface MonthlyUsage {
  papersCount: number;
  embedTokens: number;
  reasoningTokens: number;
  storageBytes: number;
  costUsd: number;
  updatedAt: number;
}
```

---

## 4. State machine

```
[upload]
  │
  ▼
queued
  │ worker picks up
  ▼
ocr ────────┐
  │         │ error
  ▼         ▼
chunking  retry (exp backoff, max 3)
  │         │
  ▼         ▼
enriching   failed (final)
  │
  ▼
embedding
  │
  ▼
indexing
  │
  ▼
indexed (terminal)

[cancel from any state]
  ▼
cancelling (transient)
  │
  ▼
cancelled (terminal)
```

**Terminal states**: `indexed`, `failed`, `cancelled`.
**Transient states**: all others.

State transitions write `statusUpdatedAt` for observability.

---

## 5. Interfaces (future-proof scaffolding)

### `JobQueue` (swap for Stage 2 PubSub)

```typescript
// src/lib/ai/rag/jobs/types.ts

export interface PaperProcessingJob {
  jobId: string;
  paperId: string;
  tenantId: string;
  version: number;
  enqueuedAt: number;
}

export interface JobQueue {
  readonly id: string;
  enqueue(job: PaperProcessingJob): Promise<void>;
  cancel(jobId: string): Promise<void>;
}
```

**Stage 1 impl** (`InProcessQueue`):
- Stores AbortControllers in Map keyed by jobId
- `enqueue` triggers `processPaperAsync` without await
- `cancel` calls `abort()` on the controller

**Stage 2 impl** (`PubSubQueue`, future):
- `enqueue` publishes to PubSub topic
- `cancel` writes flag to Firestore (`cancelRequestedAt`), worker polls

Same interface. Swap impl.

### `OcrProvider`, `EmbeddingProvider`, `VectorStore` — already exist (ai-5a)

These remain unchanged. Stage 2 doesn't affect them.

### `QuotaEnforcer` (new in ai-5b-1)

```typescript
// src/lib/ai/governance/quota.ts

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
}

export async function checkQuota(
  tenantId: string,
  action: 'paper' | 'embedTokens' | 'reasoningTokens' | 'storage',
  amount: number
): Promise<QuotaCheck>;

export async function trackUsage(
  tenantId: string,
  action: 'paper' | 'embedTokens' | 'reasoningTokens' | 'storage',
  amount: number,
  costUsd: number
): Promise<void>;
```

---

## 6. Idempotency

`paperId = SHA-256(pdf bytes)`.

Same file uploaded by same tenant → same paperId → upload route detects existing doc and short-circuits (returns existing paperId, no reprocessing).

**Cross-tenant**: SAME pdfHash by DIFFERENT tenant = DIFFERENT paperId because tenantId is path prefix. No cross-tenant data leakage.

---

## 7. Cancellation

User clicks "Cancel" on Paper detail page:
1. POST `/api/papers/{id}/cancel`
2. Server sets `cancelRequestedAt` on Firestore doc
3. Server calls `inProcessQueue.cancel(jobId)` → triggers `AbortController.abort()`
4. Worker checks `signal.aborted` at each step boundary
5. If aborted: cleanup partial state, status=`cancelled`

Cleanup includes:
- Delete partial chunks from Firestore (if chunking started)
- Delete partial vectors from Pinecone (if indexing started)
- Refund quota if quota was reserved

---

## 8. Retry strategy

On non-fatal error (network, transient API failure):
- `retryCount++`
- Wait `2^retryCount * 1000ms + jitter(0-500ms)` (exponential backoff)
- Retry from current step (not from start)

On fatal error (auth failure, quota exhausted, malformed PDF):
- No retry
- status=`failed`, error message preserved

After `maxRetries` (default 3):
- status=`failed`, error="exceeded max retries"

User can manually reprocess via `/api/papers/{id}/reprocess`.

---

## 9. Cost accounting per paper

Tracked in `Paper.costUsd`:

```typescript
{
  ocr: 0.012,         // 12 pages × $0.001/page Mistral
  enrichment: 0.001,  // 30 chunks × Haiku contextual (cached prompt)
  embedding: 0.0027,  // 30 chunks × 500 tokens × $0.18/M
  total: 0.0157,
}
```

Per-tenant monthly total in `tenants/{tid}/usage/{YYYY-MM}.costUsd`.

Quota check before each operation prevents runaway costs.

---

## 10. Governance / quota tiers

| Tier | Price | Papers/m | Embed tokens/m | Reasoning tokens/m | Storage |
|---|---|---|---|---|---|
| Free | $0 | 10 | 1M | 100K | 1 GB |
| Starter | $29/m | 100 | 10M | 1M | 10 GB |
| Pro | $99/m | 1000 | 100M | 10M | 100 GB |
| Enterprise | custom | custom | custom | custom | custom |

Limits enforced at API entry point. HTTP 429 with `Retry-After` header on exceed.

Soft cap (90%): warning toast on dashboard.
Hard cap (100%): all operations blocked, dashboard shows upgrade prompt.

---

## 11. Implementation sub-phases

### ai-5b-1: Foundation + Upload + Governance (~1300 LOC)

| File | Purpose |
|---|---|
| `src/types/papers.ts` | Paper, PaperChunk, ProcessingJob types |
| `src/lib/ai/rag/jobs/types.ts` | JobQueue interface |
| `src/lib/ai/rag/jobs/in-process.ts` | InProcessQueue impl |
| `src/lib/ai/rag/jobs/index.ts` | Job queue abstraction |
| `src/lib/ai/governance/quota.ts` | checkQuota, trackUsage |
| `src/lib/ai/governance/tiers.ts` | Tier definitions |
| `src/lib/firebase/storage.ts` | Storage helpers (signed uploads) |
| `firestore.rules` patch | papers/* tenant-scoped rules |
| `storage.rules` | papers/{tid}/* rules |
| `src/features/papers/components/upload-dropzone.tsx` | UI react-dropzone |
| `src/app/[locale]/dashboard/papers/upload/page.tsx` | Upload page |
| `src/app/api/papers/upload/route.ts` | Upload endpoint (idempotent, quota-checked) |

### ai-5b-2: Processing pipeline + UI (~1200 LOC)

| File | Purpose |
|---|---|
| `src/lib/ai/rag/pipeline/ocr-step.ts` | OCR step using OcrProvider |
| `src/lib/ai/rag/pipeline/chunking.ts` | Sliding window chunker |
| `src/lib/ai/rag/pipeline/enrich.ts` | Haiku contextual enrichment with prompt cache |
| `src/lib/ai/rag/pipeline/embed-step.ts` | Batch embedding via Voyage |
| `src/lib/ai/rag/pipeline/index-step.ts` | Pinecone upsert |
| `src/lib/ai/rag/pipeline/orchestrator.ts` | State machine + retry + cancel |
| `src/app/api/papers/[id]/cancel/route.ts` | Cancel endpoint |
| `src/app/api/papers/[id]/reprocess/route.ts` | Reprocess endpoint |
| `src/features/papers/components/paper-list.tsx` | List page (Firestore realtime) |
| `src/features/papers/components/paper-detail.tsx` | Detail page (timeline) |
| `src/app/[locale]/dashboard/papers/page.tsx` | List route |
| `src/app/[locale]/dashboard/papers/[id]/page.tsx` | Detail route |

---

## 12. Migration paths

### Stage 1 → Stage 2 (when bottleneck appears)

**Trigger**: Vercel 300s timeout hit on legitimate jobs (papers > 100 pages), OR > 50 papers/day total.

**Effort**: ~1 session (~600 LOC).

**Changes**:
1. Add `src/lib/ai/rag/jobs/pubsub.ts` — `PubSubQueue` impl
2. Deploy worker to Cloud Run (separate Next.js app or pure Node script)
3. Cloud Tasks/PubSub OIDC auth to worker endpoint
4. Swap `getJobQueue()` to return `PubSubQueue` impl
5. Worker reuses `pipeline/*` modules (zero refactor)

**Business logic unchanged.** Only deployment topology.

### Stage 2 → Stage 3 (enterprise)

**Trigger**: 1st enterprise customer + compliance ask.

**Effort**: 2-3 sessions.

**Changes**:
- OpenTelemetry traces (instrument worker)
- Multi-region failover for Cloud Run
- DLQ + manual retry UI
- Audit log immutability (BigQuery export)
- SAML SSO

---

## 13. Decision rationale (key trade-offs)

### Why in-process queue, not PubSub for Stage 1?

- < 10 papers/day = trivial load
- Vercel 300s timeout enough for 95% papers (≤50 pages × ~6s/page Mistral)
- Zero additional infrastructure cost
- Single deployment = simpler debugging
- Interface scaffolding makes migration painless when justified

### Why content-hash idempotency (not UUID)?

- Natural dedup: same PDF uploaded twice = no wasted processing
- Cross-version comparison: same hash means same content (helpful for audit)
- No need for separate "dedup table"

### Why Firestore realtime listener for UI (not WebSocket)?

- Already paying Firestore cost
- Built-in auth + tenant filtering
- Free per-document listeners (within Firestore quota)
- No separate WebSocket server to manage

### Why store chunks in Firestore (not just Pinecone)?

- BM25 fallback if Pinecone down
- Citation rendering needs chunk text (avoid Pinecone metadata fetch latency)
- Audit trail (Pinecone metadata can be stripped, Firestore is source of truth)
- Future: hybrid retrieval (BM25 + vector) requires both

### Why per-tenant namespace in Pinecone (not metadata filter)?

- Pinecone: 1 RU per 1 GB tenant data vs 100 RU for metadata filter on 100 tenants
- Physical isolation (tenant offboarding = delete namespace, instant)
- Performance scales WITH tenant count (not against)

---

## 14. Open questions (for future sub-phases)

- BM25 implementation: Firestore inverted index vs separate Tantivy/Vespa? Defer to ai-5c.
- Multi-step retrieval (query rewriting before RAG): defer to ai-5c.
- Citation chip UI: defer to ai-5d.
- DOI auto-fetch from Crossref: defer to ai-5b-3 or ai-5c.
- Equation indexing (LaTeX-aware embedding): defer to ai-6.
