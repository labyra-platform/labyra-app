# Labyra AI Architecture v3.2

> 6-tier production AI system for materials science lab management.
> See ADR-019 (Tier Architecture), ADR-020 (Cost Controls), ADR-021 (Inter-tier).

<!-- R182-docs-update-2026-05-19 -->

**Version**: 3.2 (R182)
**Last updated**: 2026-05-19
**State**: Production (all 6 tiers live)


## Changelog (recent rounds)

### R182 (2026-05-19) — FTIR reference library
- 29 functional group cards seeded into `tenants/{tid}/references` (NIST + Coates IR Table)
- MultiCitationsPanel now surfaces library matches for FTIR analyses
- Doc: `docs/scientific-methods/ftir-reference-library.md`

### R181 (2026-05-19) — OCR cache + classify v1.1 + path fix
- OCR results cached in GCS by SHA256 content hash (~$0.001/page saved)
- Classify prompt v1.1: anti-passing-reference rules, input 3000→5000 chars
- Citation sort by confidence priority (doi-exact → manual → title-fuzzy → unverified)
- Critical fix: Firestore path measurements→spectra (URL rename was partial)

### R180 (2026-05-18) — Cancel + Cmd+K
- Cancel endpoint sets status=cancelled directly (skip transient cancelling)
- kbar Cmd+K paper search with top 30 recent papers

### R179 (2026-05-18) — Orphan audit + journal extract + react-pdf
- Layer 2 data integrity: weekly orphan audit cron (ADR-026)
- Worker Step 1e: journal resolve via Crossref + OpenAlex (ADR-027)
- react-pdf v10 viewer + fuzzy title search (fuse.js)
- Gemini 3 Flash thinking_level adapter (replaces deprecated thinking_budget)

---


---

## 1. Overview

Labyra's AI stack uses **6 tiers** organized by capability + cost tradeoff. Each user query routes through Tier 0 (intent classifier + security shield) which dispatches to one of T1-T5 based on intent.

Key principles:
- **Trust > Coverage**: Citations are ground truth (DOI from Crossref/OpenAlex), not LLM hallucinations
- **Cost discipline**: Cheapest model that suffices. Cost Guard 4-gate pre-check before every call
- **Telemetry-first**: Every call logged for offline analysis (cost, latency, grounding)
- **Multi-tenant isolation**: All Firestore queries filtered by `tenantId`

---

## 2. Tier roster

### T0 — Shield + Router (intent classifier)

**Model**: `gemini-2.5-flash` (`security-router` capability)
**Role**: Classify user message into tier 1-4 + feature kind + safety screen
**Latency**: ~500ms
**Cost**: ~$0.0001/call

Outputs:
```json
{
  "tier": 1 | 2 | 3 | 4,
  "feature": "lab_ops" | "theory" | "spectrum_analysis" | "paper_writing",
  "reason": "<10 words>",
  "confidence": 0.0-1.0
}
```

**Fallback** (parse fail OR confidence < 0.7): `tier=2, feature='theory'` (Sonnet RAG default).

**R174-6 keyword override**: regex pre-check bypasses classifier when message matches strong drafting keywords + section types → forces `tier=4`. Reason: Gemini 3 Flash few-shot prompt unreliable for tier=4 emission.

### T1 — Lab Manager (tools)

**Model**: `gemini-2.5-flash` (`tool-calling-cheap` capability)
**Role**: Lab data lookups via tool calls
**Latency**: ~2-5s (with tool round)
**Cost**: ~$0.0005/query

Tools:
- `listChemicals`, `recentMaterials`, `recentSamples`, `recentExperiments`
- `searchPapers` (RAG)
- Action tools: `recordExperimentResultDraft`, etc.

Max tool rounds: 3 (R160).

**R174-5 fix**: `functionResponse` parts must be on role='function', not role='user'.

### T2 — Librarian (RAG default)

**Model**: `gemini-2.5-flash` (`rag-balanced` capability)
**Role**: Single-topic technical Q&A with paper RAG context
**Latency**: ~3-5s
**Cost**: ~$0.001/query

Uses hybrid RAG (vector + BM25 + RRF + Voyage rerank-2.5). Most common tier (~50% of queries).

### T3 — Engineer (reflection)

**Model**: `claude-sonnet-4-6` (`reasoning-balanced` capability)
**Role**: Complex single-topic analysis with self-critique loop
**Latency**: ~10-20s (multiple rounds)
**Cost**: ~$0.005-0.015/query

Reflection orchestrator: max 3 rounds of self-critique. Critic decides "sufficient" or "needs revision". Final round streams to UI.

Use cases:
- Spectrum interpretation (XRD, FTIR, Raman analysis)
- Mechanism explanations
- Formula derivations

### T4 — Writer (paper drafting) ← R173-4

**Model**: `claude-sonnet-4-6` (`reasoning-balanced` capability)
**Role**: Manuscript section drafting
**Latency**: ~10-20s
**Cost**: ~$0.01-0.02/query

Section types: methods / results / discussion / introduction (auto-detected from message).

Flow:
1. RAG search top-8 papers via `searchPapers`
2. Load paper metadata via `citation-loader.ts` (R175-1)
3. Build context block with `[authorYear]` citation keys
4. Stream draft with section-specific system prompt
5. Extract inline citations

Trigger: `feature: 'paper_writing'` (via keyword override in R174-6).

Strict prompt rules (R174-8):
- DO NOT ask for clarification
- Use placeholder values (X g, Y mL) when info missing
- DO NOT end with follow-up questions
- Output draft only

### T5 — Auditor (peer review) ← R173-5

**Model**: `claude-opus-4-7` (`reasoning-frontier` capability, +35% tokenizer inflation)
**Role**: Verify claims in T3/T4 responses against RAG sources
**Latency**: ~10-15s
**Cost**: ~$0.05-0.15/audit (max 15 claims/run)

Endpoint: `POST /api/messages/[id]/audit` (explicit trigger).

Flow:
1. Load source message + aiProvenance (RAG chunks used)
2. Extract claims (numerical, citation, mechanism, definition)
3. Single Opus 4.7 batch call evaluating all claims
4. Verdict per claim: supported / partially_supported / unsupported / contradicted
5. Confidence score + evidence chunkIds
6. Save `tenants/{tid}/aiAudits/{auditId}`

Weighted overall confidence: supported=1.0, partial=0.6, unsupported=0.3, contradicted=0.0.

Auto-trigger after T3 deferred — need Lab BKU baseline data first to calibrate cost-effectiveness.

---

## 3. Capability abstraction (R169)

Single source of truth: `src/lib/ai/config/capabilities.ts`.

```ts
export type Capability =
  | 'security-router'      // Tier 0
  | 'tool-calling-cheap'   // Tier 1
  | 'rag-balanced'         // Tier 2
  | 'reasoning-balanced'   // Tier 3, Tier 4
  | 'reasoning-frontier'   // Tier 5
  | 'embedding' | 'rerank' | 'ocr';

export const CAPABILITY_MAP: Record<Capability, CapabilityProfile> = {
  'security-router': {
    provider: 'google',
    model: 'gemini-2.5-flash',
    inputCost: 0.25, outputCost: 1.5,
    cacheReadCost: 0.025,
    maxTokens: 512,
    contextWindow: 1_000_000
  },
  'reasoning-frontier': {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    inputCost: 15, outputCost: 75,
    cacheReadCost: 1.5,
    maxTokens: 4096,
    contextWindow: 200_000,
    tokenizerInflation: 1.35 // +35% vs Opus 4.6
  },
  // ... etc.
};

export const TIER_CAPABILITY: Record<AiTier, Capability> = {
  0: 'security-router',
  1: 'tool-calling-cheap',
  2: 'rag-balanced',
  3: 'reasoning-balanced',
  4: 'reasoning-balanced',
  5: 'reasoning-frontier'
};
```

`TIER_CONFIG` (in `src/lib/ai/providers/index.ts`) auto-derives from `CAPABILITY_MAP`. Edit one place to swap model.

**R174-1 rollback**: T0+T1+T2 models from `gemini-3.1-flash-lite-preview` / `gemini-3-flash-preview` → `gemini-2.5-flash`. Reason: Gemini 3 series requires `thought_signature` field in multi-turn function calls, SDK 2026-05 doesn't expose pass-through.

---

## 4. Cost controls (R170)

### 4-gate pre-check

`src/lib/ai/governance/cost-guard.ts`:

```ts
const costCheck = await checkCostGuard(tenantId, tier, feature, estimated);
// Gates:
// 1. Per-call estimate <= per-call cap (tenant.tier dependent)
// 2. Today's accumulated <= daily cap
// 3. This month's accumulated <= monthly cap
// 4. Feature-specific quota (e.g., paper_writing 10/day for 'pro' tier)
```

If any gate fails, return HTTP 429 with reason.

### Tenant tiers

`tenants/{tid}.tier`: `'free' | 'pro' | 'enterprise'`

| Tier | Per-call cap | Daily cap | Monthly cap |
|---|---|---|---|
| free | $0.01 | $0.10 | $1 |
| pro | $0.10 | $5 | $50 |
| enterprise | $1 | unlimited | unlimited |

Lab BKU (`tenant-dev-001`) tier = `enterprise` (no quota block dev).

### Cost estimator

`src/lib/ai/cost/estimator.ts`:

```ts
const estimated = estimateCost(tier, feature, {
  inputTokenEstimate, // from message + system + tools + context
  outputTokenEstimate // from maxTokens cap
});
```

Used by Cost Guard pre-check + dry-run mode.

### Dry-run

Query param `?dry_run=1` returns intent decision + cost estimate without calling LLM. Useful for testing routing.

### Telemetry

`recordCost()` writes to `tenants/{tid}/_costs/{date}` with:
- `totalCostUsd`
- `byTier: { 1: ..., 2: ..., 3: ..., 4: ..., 5: ... }`
- `byFeature: { lab_ops: ..., theory: ..., ... }`
- `byCapability: { ... }`
- `latencyP50, latencyP95`
- `groundingWarnings: { unverifiedNumbers, unsourcedClaims }`

Aggregated by `backupCostsDaily` Cloud Function to GCS for offline analysis.

---

## 5. Cron infrastructure (R171)

3 Cloud Functions live `asia-southeast1`:

### backupCostsDaily

**Schedule**: `0 2 * * *` (02:00 UTC daily)
**File**: `functions/src/scheduled/backup-costs.ts`

Exports yesterday's `tenants/{tid}/_costs/{D-1}` to GCS:
```
gs://labyra-app-dev.firebasestorage.app/_admin/cost-backups/{date}/{tenantId}.json
```

GCS lifecycle: 90-day auto-delete for `_admin/cost-backups/` prefix (R173-2).

### reconcileCostDrift

**Schedule**: `30 2 * * *` (02:30 UTC daily)
**File**: `functions/src/scheduled/cost-drift.ts`

Compares estimated vs actual costs:
- Anthropic Usage API (cross-org via `ANTHROPIC_ADMIN_KEY`)
- Google Billing (placeholder; BigQuery integration in R176-2)

Per-tenant attribution via share ratio. Alert if |drift| > 20%.

### ragasEvalWeekly

**Schedule**: `0 3 * * 0` (03:00 UTC Sunday)
**File**: `functions/src/scheduled/ragas-eval.ts`

Samples 10 random conversations from past 7 days (tier ≥ 2). 11 metrics via Opus 4.7 evaluator:

**Core RAG (3)**:
- Faithfulness
- Context Relevance
- Answer Relevance

**Quality (5)**:
- Conciseness
- Vietnamese Fluency
- Technical Accuracy
- Citation Quality
- Subscript Formatting

**Safety (2)**:
- Toxicity
- PII Leakage

**Domain (1)**:
- Materials Science Plausibility

Weighted overall score. Auto-flag if core RAG < 0.5 OR safety > 0.3.

Cost cap $5/run.

Output: `tenants/{tid}/_evals/{yyyy-Www}/conversations/{id}`.

### IAM

Service account: `cron-runner@labyra-app-dev.iam.gserviceaccount.com`

Roles:
- `roles/datastore.user`
- `roles/storage.objectAdmin`
- `roles/logging.logWriter`
- `roles/monitoring.metricWriter`
- `roles/bigquery.dataViewer` (R173-3)
- `roles/bigquery.jobUser` (R173-3)
- `roles/billing.viewer` (at billing account level)

Compute SA `802854518465-compute@developer.gserviceaccount.com` impersonates cron-runner for Gen 2 runtime.

### Secrets

Secret Manager:
- `ANTHROPIC_API_KEY` (for Ragas Opus calls)
- `ANTHROPIC_ADMIN_KEY` (for Usage API)
- `GCP_BILLING_ACCOUNT_ID` = `01545E-FF945F-4AF504`

---

## 6. Founder dashboard (R172)

`/dashboard/superadmin/{costs,evals,drift}` — superadmin-only:

### Costs page

- 4 KPI cards: Total cost (period), Total queries, Avg cost/query, Projected monthly
- Daily cost trend chart (recharts AreaChart stacked by tier)
- Recent days raw data table

### Evals page

- Weekly Ragas eval summaries (last 12 weeks)
- Flagged conversations list (low confidence)
- Per-metric trend charts

### Drift page

- Drift reports (estimated vs actual cost)
- Alert when |drift| > 20%
- Per-tenant breakdown

### API routes

- `GET /api/superadmin/costs?range=30`
- `GET /api/superadmin/evals`
- `GET /api/superadmin/drift?range=14`

All guarded by `requireSuperadmin()` in `src/lib/auth/superadmin-guard.ts`.

### Promote superadmin

```bash
node --env-file=.env.local scripts/set-superadmin.mjs --email <user@example.com>
```

Sets custom claim `role: 'superadmin'` on user. Effective on next token refresh.

---

## 7. UI/UX patterns (R174)

### Tier badge realtime

`ChatStreamEventV2.message_start` carries `tier` field. `useChatStream` sets tier on pending assistant message immediately (no F5 reload):

```tsx
<MessageBubble message={m}>
  {m.tier && <TierBadge tier={m.tier} />}
</MessageBubble>
```

Colors:
- T1 emerald
- T2 sky
- T3 violet
- T4 orange
- T5 red

### Thinking indicator

NEW `src/features/ai/components/thinking-indicator.tsx`:

```tsx
<div className='flex items-center gap-2'>
  <span className='animate-pulse rounded-full bg-foreground/60' style={{ animationDelay: '0ms' }} />
  <span className='animate-pulse rounded-full bg-foreground/60' style={{ animationDelay: '200ms' }} />
  <span className='animate-pulse rounded-full bg-foreground/60' style={{ animationDelay: '400ms' }} />
  <span>{t('thinking')}</span>
</div>
```

Renders in place of empty assistant bubble while `isStreaming`.

### Chat container width

`max-w-5xl` (R174-4), `h-[calc(100vh-4rem)]`. Better wide-screen use.

---

## 8. Citation format (R175-1)

T4 Writer uses academic-style `[authorYear]` citation keys via `citation-loader.ts`.

### Build flow

1. After RAG search, collect unique `paperIds`
2. Batch load `tenants/{tid}/papers/{paperId}` docs
3. For each paper, extract first author surname + year
4. Build citation key (with collision suffix if needed):

```ts
// Examples
buildCitationKey({ authors: ['John Smith'], year: 2024 }) // → 'smith2024'
buildCitationKey({ authors: ['Smith, J.'], year: 2024 })  // → 'smith2024'
buildCitationKey({ authors: ['Nguyễn Văn A'], year: 2024 }) // → 'nguyen2024'
// Collision:
// Second 'smith2024' → 'smith2024a'
// Third → 'smith2024b'
```

### Vietnamese name heuristic

Names starting with common Vietnamese surnames (Nguyen, Tran, Le, Pham, Hoang, Huynh, Phan, Vu, Vo, Dang, Bui, Do, Ho, Ngo, Duong, Ly) → use first word as surname (Vietnamese order).

Other names → use last word (Western order).

### Diacritic stripping

NFD normalize + đ→d (e.g., "Nguyễn" → "nguyen").

### Fallback

When metadata missing → `unknown<hash>` (paperId slice).

R176+ paper metadata backfill addresses fallback case.

---

## 9. RAG pipeline (R166-R167)

### Indexing (async via R167 Cloud Run worker)

Vercel `/api/papers/upload` → Pub/Sub topic `paper-processing` → `spectra-worker` Cloud Run:

1. **OCR** (Mistral `mistral-ocr-latest`, $1/1000 pages batch)
2. **Chunking** (sliding window 1024 tokens, 100 overlap, CHARS_PER_TOKEN=3.5)
3. **Embed** (Voyage `voyage-3-large` REST, batch 128, 1024-dim, $0.18/1M tokens)
4. **Index** (Firestore chunks subcollection + Pinecone serverless namespace=tenantId)
5. **Enrich** (Haiku 4.5 — paused, `ENABLE_ENRICHMENT=false`)
6. **Metadata** (Haiku 4.5 first-page title/authors/year/DOI — known year=0 bug in R167-handoff §3.4)
7. **Citations** (R166: Crossref + OpenAlex DOI resolution, save edges)

16-page paper: ~16s. 3-page: ~8s.

### Retrieval (hybrid)

`src/lib/ai/rag/search.ts` `searchPapers()`:

```ts
const result = await searchPapers({
  tenantId,
  query: userMessage,
  vectorTopK: 50,  // top-50 from Pinecone
  topN: 8          // top-8 after rerank
});
```

Steps:
1. **Vector retrieval** (Voyage embed query → Pinecone search)
2. **BM25 retrieval** (Firestore-indexed sparse from `bm25-manager.ts`)
3. **RRF fusion** (reciprocal rank fusion top-30)
4. **Rerank** (Voyage `rerank-2.5` top-8)

Output: `{ hits: HitCandidate[], cost, tokensUsed, latencyMs }`.

`HitCandidate`: `{ paperId, chunkIdx, text, pages, section }`.

References sections excluded from BM25 results.

### Citation network (ai-6 Phase 6a, R166)

`tenants/{tid}/citations/{id}` — one doc per citation edge.

Confidence tiers:
- `manual` (highest)
- `doi-exact` (Crossref/OpenAlex resolved)
- `title-fuzzy`
- `unverified` (R167 tech debt — should drop DOI 404s)

Cross-tenant safe: citations always within tenant namespace.

UI (Phase 6b, deferred R185+): D3 force-directed graph + "Cited by" section.

---

## 10. Reflection orchestrator (T3)

`src/lib/ai/reflection/orchestrator.ts`:

```ts
runReflection({
  userMessage,
  onRoundStart: (round) => send({ type: 'reflection_start', round }),
  onFinalDelta: (delta) => send({ type: 'text_delta', delta }),
  onRoundComplete: (round) => send({ type: 'reflection_round_complete', ... })
}): Promise<ReflectionResult>
```

Max 3 rounds. Each round:
1. Generate response with Sonnet 4.6
2. Critic decides "sufficient" or "needs revision"
3. If sufficient, return; else loop

Cost accumulation across rounds. Final round streams to UI (`onFinalDelta`). Earlier rounds silent.

Reflection history saved to `tenants/{tid}/aiConversations/{cid}/messages/{mid}.reflectionHistory[]`.

---

## 11. Anti-hallucination layers (Section 27 reference)

State of 9-layer anti-hallucination architecture (R167-D audit):

| Layer | Status | Notes |
|---|---|---|
| L1 — Strict system prompts | ✅ Shipped | Per-tier prompts |
| L2 — Tool calling | ✅ Shipped | Read-only + action tools |
| L3 — RAG with citations | ✅ Shipped | Hybrid vector+BM25+rerank |
| L4 — Grounding check | ✅ Shipped | `checkGrounding()` on T3 |
| L5 — Reflection critique | ⚠ Partial | T3 only, no T2/T4 critique |
| L6 — Off-topic refusal | ✅ Shipped | `classifyOnTopic()` |
| L7 — Cost Guard quota | ✅ Shipped | 4-gate pre-check (R170) |
| L8 — Eval dashboard | ✅ Shipped | Ragas weekly (R171-5) |
| L9 — Audit/peer review | ✅ Shipped | T5 Auditor (R173-5) |

R175 status: all 9 layers shipped. L5 still partial (only T3 reflection has critique; could extend to T2/T4).

---

## 12. Provider abstraction

`src/lib/ai/providers/`:
- `anthropic.ts` — Anthropic Claude
- `gemini.ts` — Google Gemini
- `types.ts` — `LLMProvider` interface

```ts
interface LLMProvider {
  streamChat(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent>;
  complete(request: CompleteRequest): Promise<CompleteResponse>;
}
```

All providers must support:
- Streaming text deltas
- Tool calling with function calls/responses
- Cost tracking (token counts + USD)
- Prompt caching (Anthropic ephemeral, Gemini context cache)

Future providers: implement `LLMProvider`, add capability profile to `CAPABILITY_MAP`, map AiTier in `TIER_CAPABILITY`.

---

## 13. Conversation persistence

Firestore structure:
```
tenants/{tid}/aiConversations/{cid}
  - userId, title, createdAt, updatedAt
  - messages/{mid}
    - role: 'user' | 'assistant' | 'system'
    - content: string
    - tier?: 1 | 2 | 3 | 4 | 5
    - toolCalls?: ToolCall[]
    - reflectionHistory?: ReflectionRound[]
    - grounding?: GroundingDetails
    - createdAt: Timestamp
```

Provenance:
```
tenants/{tid}/aiProvenance/{auto-id}
  - messageId
  - tenantId
  - ragChunksUsed?: ChunkRef[]
  - toolCallsExecuted?: ToolCallRecord[]
  - reflectionRounds?: ReflectionRound[]
  - costBreakdown
  - latencyMs
  - embeddingModel
  - rerankScores?
```

Audits:
```
tenants/{tid}/aiAudits/{auditId}
  - sourceMessageId, sourceConversationId
  - findings: AuditFinding[]
  - overallConfidence
  - supportedCount, unsupportedCount, contradictedCount
  - totalCost
  - evaluatorModel: 'claude-opus-4-7'
  - evaluatedAt
```

Costs:
```
tenants/{tid}/_costs/{yyyy-MM-dd}
  - totalCostUsd
  - byTier: Record<AiTier, { costUsd, queryCount, ... }>
  - byFeature: Record<FeatureKind, { costUsd, queryCount, ... }>
  - byCapability: Record<Capability, { ... }>
  - latencyP50, latencyP95
```

Evals:
```
tenants/{tid}/_evals/{yyyy-Www}/conversations/{cid}
  - metrics: { faithfulness, contextRelevance, ... } (11 metrics)
  - overallScore
  - flagged: boolean
  - flagReason?: string
```

---

## 14. Roadmap

### R176 (Active)

- **R176-1** — Paper metadata backfill (DOI + LLM extract) → resolves citation fallback
- **R176-2** — BigQuery cost-drift integration (data ready May 17+)
- **R176-3** — T2 empty response edge case
- **R176-4** — Long-conversation Writer prompt drift
- **R176-5** — Audit findings UI

### R177-R179 — Domain expansion

- Spectra 3d (PL/EDS/BET)
- Spectra 3e (CV/LSV/EIS)
- Domain content docs deep

### R185+ — Citation network UI

- D3 force-directed graph
- "Cited by" section
- `searchCitations` AI tool

### R195+ — Gemini 3 re-adoption

- Monitor SDK signature support
- Restore T0+T1+T2 to gemini-3.x-*

---

## 15. References

- ADR-019 — AI Tier Architecture (capability abstraction)
- ADR-020 — Cost Controls (Cost Guard 4-gate)
- ADR-021 — Inter-tier Protocols (R169-R170 partial)
- `src/lib/ai/config/capabilities.ts` — SSOT for models
- `src/lib/ai/governance/cost-guard.ts` — Cost Guard logic
- `docs/scientific-methods/` — domain method docs

---

@phase R175 (continuation R168-R175)
