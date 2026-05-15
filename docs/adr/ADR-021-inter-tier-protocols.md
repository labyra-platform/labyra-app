# ADR-021: Inter-Tier Communication Protocols — 9 Techniques

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: R168-3.13a
**Owner**: nAM

## Context

6-tier architecture (ADR-019) needs explicit communication contracts between tiers. Without them:
- Redundant model calls (Tier 5 re-fetches Tier 2 sources)
- Lost cost optimization (no caching, no parallelization)
- Brittle output handoff (Gemini Flash vs Sonnet format JSON differently)
- UX latency (sequential blocking when parallel possible)

Original `LABRYA_AI_TIER_ARCHITECTURE.md` proposed 5 techniques. This ADR extends with 4 additional patterns + 2 industry practices, classified by Stage 1 readiness.

## Decision

Adopt **9 techniques** across 3 categories.

### Category A: Stage 1 ship now (7 techniques)

#### Tech 1 — Parallel Orchestration (T2 ∥ T3)

When intent=`writing`, T2 (theory RAG) and T3 (spectrum analysis) are independent. Run via `Promise.all`:

```typescript
const [t2Result, t3Result] = await Promise.all([
  runTier2(ctx),  // ~2s Gemini Flash
  runTier3(ctx),  // ~3s Sonnet + Python
]);
// Total: 3s instead of 5s sequential
```

**Cost impact**: $0 (same tokens). **Latency**: -40%.

#### Tech 2 — TierContext Shared State

Single mutable struct passes through pipeline. Each tier reads predecessors, writes own result:

```typescript
interface TierContext {
  requestId: string;
  tenantId: string;
  sanitizedQuery: string;
  intent: TierIntent;
  tier0Result?: ShieldRouterResult;
  tier2Result?: LibrarianResult;
  tier3Result?: EngineerResult;
  tier4Result?: WriterResult;
  totalCost: number;  // accumulated
}
```

**Anti-pattern**: re-fetching the same data in two tiers.
**Pattern**: Tier 4 reads `ctx.tier2Result.fetchedSources` instead of calling T2 again.

#### Tech 3 — Streaming SSE

T1-T4 stream tokens to client via Server-Sent Events. T5 background (no stream).

```typescript
const stream = new ReadableStream({
  async start(controller) {
    for await (const chunk of streamTier4(ctx)) {
      controller.enqueue(encoder.encode(JSON.stringify({type: 'chunk', text: chunk}) + '\n'));
    }
  }
});
```

**UX impact**: first token < 500ms. **Cost**: 0 (same total tokens).

#### Tech 4 — Zod JSON Schema Strict

Every tier output validated against Zod schema before passing downstream:

```typescript
const Tier0Schema = z.object({
  safe: z.boolean(),
  intent: z.enum(['lab_ops', 'theory', ...]),
  targetTier: z.union([z.literal(1), z.literal(2), ...]),
  confidence: z.number().min(0).max(1),
});

const validated = await validateOrRetry(rawOutput, Tier0Schema, () => retryWithStricterPrompt());
```

**Impact**: retry rate 5% → 0.5%. Cost saving ~$0.41/1K queries.

#### Tech 5 — Prompt Caching

Anthropic auto-cache prefix > 1024 tokens. Gemini explicit `CachedContent` API.

```typescript
// Anthropic — automatic
messages: [{
  role: 'user',
  content: [
    { type: 'text', text: SYSTEM_PROMPT },  // ~2K tokens — cached
    { type: 'text', text: userQuery },       // dynamic
  ]
}]

// Gemini — explicit
const cache = await genai.beta.caches.create({
  model: 'gemini-3-flash-preview',
  contents: [{ role: 'user', parts: [{ text: SYSTEM + LAB_CORPUS }] }],
  ttl: '3600s',
});
```

**Impact**: -90% cached input cost (Anthropic), -90% cached (Gemini). Largest single cost lever.

#### Tech 7 — Result Memoization (Tier 2 theory)

Public knowledge queries are repetitive ("Tafel slope", "Scherrer equation"). Cache result Firestore 24h TTL.

```typescript
async function memoizedRunTier2(ctx: TierContext): Promise<LibrarianResult> {
  if (ctx.intent !== 'theory') return runTier2(ctx);  // only memoize theory

  const cacheKey = sha256(`${ctx.sanitizedQuery}:${ctx.lang}`);
  const cached = await db.doc(`_ai_cache/${cacheKey}`).get();
  if (cached.exists && cached.data().expiresAt > Date.now()) return cached.data().result;

  const result = await runTier2(ctx);
  await db.doc(`_ai_cache/${cacheKey}`).set({ result, expiresAt: Date.now() + 24*3600*1000 });
  return result;
}
```

**Critical**: only memoize Tier 2 theory (public knowledge). NEVER memoize:
- Tier 1 (tenant-specific lab data changes)
- Tier 3 (spectrum unique per measurement)
- Tier 4 (writing creative)
- Tier 5 (context-specific audit)

**Impact**: expected -30% Tier 2 cost at scale (cache hit rate ~30%).

#### Tech 9 — Cross-Tier Source Deduplication

Tier 4 Writer fetches paper chunks. Tier 5 Auditor needs same chunks to verify citations. **Anti-pattern**: T5 calls T2 again.

```typescript
interface WriterResult {
  text: string;
  fetchedSources: PaperChunk[];  // ← snapshot at write time
  hasNumericalClaims: boolean;
}

async function runTier5(ctx: TierContext): Promise<AuditResult> {
  const sources = ctx.tier4Result.fetchedSources;  // ← reuse, no extra T2 call
  return verifyAgainstSources(ctx.tier4Result.text, sources);
}
```

**Cost saving**: ~$0.005/Tier 5 call × ~5% trigger rate = ~$0.13/1K queries.

### Category B: Industry practices (2 in Stage 1)

#### Practice B — Token Budget per Request

Cap tokens per request by plan to prevent context explosion:

```typescript
const MAX_TOKENS_PER_REQUEST = {
  free:  { input: 5000,  output: 1000 },
  pro:   { input: 20000, output: 4000 },
  team:  { input: 100000, output: 8000 },
};

if (estimatedInputTokens > limit.input) {
  truncatedContext = smartTruncate(context, limit.input);  // not reject
}
```

**Defense in depth**: limits prevent both runaway cost and oversized prompts.

#### Practice C — Async Batch API for Non-Realtime

Non-interactive workflows use batch API (-50% cost, 24h SLA):

```typescript
// Real-time: standard API (Tier 0-5 chat)
// Batch: paper OCR, embedding regen, Ragas eval, drift detection
const batch = await anthropic.batches.create({
  requests: papers.map(p => ({ ... })),
});
// 24h turnaround, $X * 0.5
```

**Use cases Stage 1**: paper OCR pipeline, monthly Ragas eval runs.

### Category C: Defer to R170+ or R175+ (3 techniques)

#### Tech 6 — Speculative Decoding Fanout (defer R175+)

Pre-warm Tier 3 when user uploads spectrum, before clicking "Analyze". If hit rate <70%, cost waste exceeds latency win.

**Defer rationale**: needs A/B test infrastructure (not Stage 1).

#### Tech 8 — Adaptive Tier Downgrade (defer R170+)

When user near quota, silently downgrade Tier 3 → Tier 2, Tier 4 → Tier 2 with user notification.

**Defer rationale**: requires Cost Guard v2 ship first (ADR-020 component 4).

#### Practice A — Circuit Breaker Fallback (defer R170+)

If Anthropic API fails > 5 times in 30s, route Tier 3-5 to Gemini Pro fallback.

**Defer rationale**: premature for single tenant. Need multi-tenant scale + actual failure data.

## Alternatives Considered

### Alt: GraphQL gateway between tiers (rejected)

- Adds latency + complexity.
- TierContext is sufficient for shared state.

### Alt: Message queue (RabbitMQ/Kafka) for inter-tier comms (rejected)

- Tier dependencies are synchronous (T2 result needed before T4).
- Pub/Sub already used for cross-process (worker), not within request.

### Alt: gRPC inter-service (rejected)

- All tiers in single Next.js process; gRPC over HTTP unnecessary.
- Direct function call faster.

## Consequences

### Positive

- **Cost optimization**: -90% cached input, -30% Tier 2 via memoization, -65% Tier 5 via trigger refinement.
- **Latency**: -40% with parallel T2∥T3.
- **Reliability**: Zod schema catches format drift.
- **Observability**: TierContext accumulates cost + timing for every request.

### Negative

- **Complexity**: 7 active techniques to maintain.
- **Memoization correctness**: must distinguish public (T2 theory) from private (T1 lab data).
- **Schema rigidity**: any tier output format change requires schema update.

## Implementation Tracking

- R169: Tech 2 (TierContext) + Tech 4 (Zod) foundation
- R169: Tech 5 (caching) — extends existing Anthropic auto-cache
- R170: Tech 1 (parallel) + Tech 3 (streaming) refactor
- R170: Tech 7 (memoization Tier 2) + Tech 9 (cross-tier dedup)
- R171+: Practice B (token budget) + Practice C (batch API)
- R175+: Tech 6 (speculative) + Practice A (circuit breaker)
- R170+: Tech 8 (adaptive downgrade)

## References

- `docs/ai/AI_ARCHITECTURE.md` — overview
- `docs/adr/ADR-019-ai-tier-architecture.md` — tier design
- `docs/adr/ADR-020-ai-cost-controls.md` — cost system
- `LABRYA_AI_TIER_ARCHITECTURE.md` — original 5-technique proposal (superseded by this 9-technique)
- Anthropic prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic batch API: https://docs.anthropic.com/en/api/messages-batches
- Google Gemini caching: https://ai.google.dev/gemini-api/docs/caching
