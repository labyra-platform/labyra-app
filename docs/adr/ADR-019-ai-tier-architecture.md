# ADR-019: AI 6-Tier Architecture with Capability Abstraction

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: R168-3.13a
**Owner**: nAM

## Context

Labyra v2.0 used a 3-tier AI architecture (Lab Manager / Analyst / Research Agent) inherited from labbook-bku. Two problems:

1. **Cost inefficiency**: Sonnet/Opus called for tasks where Gemini Flash-Lite would suffice.
2. **No capability abstraction**: model strings hardcoded everywhere — vendor swap = grep across codebase.

Upstream design report `LABRYA_AI_TIER_ARCHITECTURE.md` proposed 6-tier, but had inaccurate cost numbers (3-5× underestimate) and wrong model strings (`gemini-3.1-flash-lite` listed as if GA — actually preview).

## Decision

Adopt **6-tier architecture** with **capability abstraction**:

### Tier assignments

| Tier | Capability | Provider/Model |
|---|---|---|
| 0 (Shield+Router) | `security-router` | Google `gemini-3.1-flash-lite-preview` |
| 1 (Lab Manager) | `tool-calling-cheap` | Google `gemini-3.1-flash-lite-preview` (share T0) |
| 2 (Librarian) | `rag-balanced` | Google `gemini-3-flash-preview` |
| 3 (Engineer) | `reasoning-balanced` | Anthropic `claude-sonnet-4-6` |
| 4 (Writer) | `reasoning-balanced` | Anthropic `claude-sonnet-4-6` |
| 5 (Auditor) | `reasoning-frontier` | Anthropic `claude-opus-4-7` |

### Embedding stack (unchanged)

- `voyage-3-large` (1024-dim) for embedding
- `voyage-rerank-2.5` for reranking
- `mistral-ocr` for paper upload OCR

### Capability abstraction pattern

```typescript
// Tier → Capability → Model mapping
TIER_CAPABILITY[5] → 'reasoning-frontier' → CAPABILITY_MAP['reasoning-frontier'] → { provider: 'anthropic', model: 'claude-opus-4-7', ... }
```

Single source of truth: `src/lib/ai/config/capabilities.ts` (to be created in R169).

## Alternatives Considered

### Alt 1: Add Haiku 4.5 as Tier 0 (rejected)

- Haiku $1/$5 vs Gemini 3.1 Flash-Lite $0.25/$1.50.
- For Tier 0 (intent classify + PII detect), Gemini sufficient. 4× cost not justified.
- May reconsider as **failover** when Gemini rate-limited (defer R170+).

### Alt 2: Migrate embedding to Gemini Embedding 1 (rejected for Stage 1)

- Saving $0.03/MTok × ~100M tokens/year = $3-5/year.
- Migration cost: re-create Pinecone index 3072-dim or truncate to 1024 (Matryoshka), re-embed all papers.
- Voyage rerank-2.5 is designed pair with voyage-3-large; switching means using cross-vendor rerank.
- **Net not worth Stage 1.** Reconsider R175+ if volume scales.

### Alt 3: Keep 3-tier (rejected)

- Sonnet for lab ops queries = wasted budget.
- 6-tier separates cost by value: $0.0003 (Tier 0) to $0.40 (Tier 5) — 1300× range.

### Alt 4: Vendor monolith (Anthropic only) (rejected)

- Single vendor = single point of failure.
- Gemini Flash-Lite cheaper than Haiku for routing.
- Multi-vendor enables failover (future).

## Consequences

### Positive

- **Cost separation**: $0.0003 (T0) → $0.40 (T5) reflects task complexity.
- **Vendor diversification**: Google for cheap tiers, Anthropic for reasoning.
- **Capability swap**: change model 1 file.
- **Audit transparency**: each tier output has cost record in TierContext.

### Negative

- **Preview model risk**: Gemini 3.1 Flash-Lite + 3 Flash are preview (pricing not locked). Risk: price hike at GA.
  - Mitigation: drift detection cron alerts on actual cost changes.
- **Tokenizer drift**: Opus 4.7 has +35% same text vs Opus 4.6.
  - Mitigation: factor 1.35 hardcoded in cost estimator.
- **Multi-vendor complexity**: 2 SDKs (Anthropic + Google) + Voyage + Mistral = 4 vendors.
  - Mitigation: capability abstraction hides vendor details from tier code.

### Risks tracked

| Risk | Severity | Mitigation |
|---|---|---|
| Gemini 3.1 Flash-Lite preview deprecates | HIGH | Fallback to 2.5 Flash-Lite (GA) prepared in CAPABILITY_MAP |
| Gemini 3 Flash GA pricing higher than preview | MEDIUM | Drift detection alerts, switch to 2.5 Flash ($0.30/$2.50) if needed |
| Opus 4.7 tokenizer +35% drift outside model estimate | LOW | Reconcile with actual billing weekly |

## Implementation Tracking

- R168-3.13b (next): fix `cost-calculator.ts` pricing.
- R169 (planned): create `src/lib/ai/config/capabilities.ts` with full CAPABILITY_MAP.
- R169: refactor existing dispatcher to use TIER_CAPABILITY mapping.
- R170+: add failover mechanism (Haiku for Tier 0 if Gemini down).

## References

- `LABRYA_AI_TIER_ARCHITECTURE.md` — original 6-tier design report (cost numbers superseded)
- `docs/ai/AI_ARCHITECTURE.md` — current single source of truth
- `docs/adr/ADR-020-ai-cost-controls.md` — cost guard + drift detection
- `docs/adr/ADR-021-inter-tier-protocols.md` — communication techniques
- Anthropic pricing 2026-05: https://www.anthropic.com/pricing
- Google Gemini pricing 2026-05: https://ai.google.dev/gemini-api/docs/pricing
