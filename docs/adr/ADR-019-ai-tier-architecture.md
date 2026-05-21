# ADR-019: AI Tier Architecture (6-tier Capability Abstraction)

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: R169

---

## Context

Labyra AI started with 3 tiers (T1 Haiku tools / T2 Sonnet RAG / T3 Opus reflection) wired directly to model strings in `TIER_CONFIG`. This created problems:

1. **Vendor lock-in**: Swapping Opus 4.6 → 4.7 required hunting down all `'claude-opus-4-6'` strings across codebase.
2. **No abstraction over capability**: "Reasoning-balanced" and "RAG-balanced" are semantic roles, but tiers tied them to specific models.
3. **3 tiers insufficient**: Paper drafting (T4 Writer) and peer-review audit (T5 Auditor) need different cost profiles than reasoning T3.
4. **Cost tracking siloed**: No per-capability aggregation for optimization analysis.

## Decision

Introduce **capability abstraction layer** between AiTier and model strings.

### Architecture

```
AiTier (0-5)
  ↓ TIER_CAPABILITY[tier]
Capability (semantic role)
  ↓ CAPABILITY_MAP[capability]
CapabilityProfile { provider, model, pricing, context window, ... }
```

### Capability types

```ts
export type Capability =
  | 'security-router'      // Tier 0 — fast intent classification + safety
  | 'tool-calling-cheap'   // Tier 1 — Firestore data lookups
  | 'rag-balanced'         // Tier 2 — RAG with paper context
  | 'reasoning-balanced'   // Tier 3 + Tier 4 — analysis + drafting
  | 'reasoning-frontier'   // Tier 5 — audit/peer review
  | 'embedding'            // RAG indexing (Voyage)
  | 'rerank'               // Post-retrieval (Voyage rerank-2.5)
  | 'ocr';                 // Paper upload (Mistral)
```

### Tier expansion

`AiTier` expanded from `0|1|2|3` to `0|1|2|3|4|5`:

- T0 — Shield + Router (intent classifier)
- T1 — Lab Manager (tools)
- T2 — Librarian (RAG default)
- T3 — Engineer (reflection loop)
- **T4 — Writer (paper section drafting)** ← NEW
- **T5 — Auditor (peer review)** ← NEW

### CapabilityProfile shape

```ts
interface CapabilityProfile {
  provider: 'anthropic' | 'google' | 'voyage' | 'mistral';
  model: string;
  inputCost: number;          // USD per 1M tokens
  outputCost: number;
  cacheReadCost: number;
  maxTokens: number;
  contextWindow: number;
  tokenizerInflation?: number; // e.g., Opus 4.7 = 1.35
  notes?: string;
}
```

### Mapping

```ts
export const TIER_CAPABILITY: Record<AiTier, Capability> = {
  0: 'security-router',
  1: 'tool-calling-cheap',
  2: 'rag-balanced',
  3: 'reasoning-balanced',
  4: 'reasoning-balanced',
  5: 'reasoning-frontier'
};
```

### Auto-derive TIER_CONFIG

`src/lib/ai/providers/index.ts`:

```ts
function buildTierConfig(): Record<AiTier, LLMProviderConfig> {
  const config: Partial<Record<AiTier, LLMProviderConfig>> = {};
  for (const t of [0, 1, 2, 3, 4, 5] as const) {
    const profile = CAPABILITY_MAP[TIER_CAPABILITY[t]];
    config[t] = {
      id: profile.provider === 'anthropic' ? 'anthropic' : 'gemini',
      tier: t,
      model: profile.model,
      label: `${labels[t]} (${profile.model})`
    };
  }
  return config as Record<AiTier, LLMProviderConfig>;
}

export const TIER_CONFIG: Record<AiTier, LLMProviderConfig> = buildTierConfig();
```

To swap a model (e.g., Opus 4.7 → 4.8 when released), edit ONE field in `CAPABILITY_MAP`. All tier handlers auto-pick up new model.

---

## Consequences

### Positive

- **Vendor-agnostic**: Swap providers per capability without touching tier handlers
- **Capability reuse**: T3 + T4 share `reasoning-balanced` (Sonnet 4.6) — single config
- **Cost aggregation**: Telemetry tracks `byCapability` for optimization analysis
- **Future-proof**: Add new tiers by adding new capability (no code refactor)
- **Documentation**: `CapabilityProfile.notes` documents why a model was chosen

### Negative

- **Indirection**: Two-step lookup (Tier → Capability → Model) vs one-step (Tier → Model)
- **Cognitive overhead**: New devs must understand capability concept

### Mitigations

- `buildTierConfig()` derived eagerly at boot — no runtime overhead
- Clear inline JSDoc comments at `Capability` type definition
- ADR documents intent + examples

---

## Implementation phases

- **R169-1** (this ADR): Create `capabilities.ts` SSOT + `TIER_CAPABILITY` map
- **R169-2**: Expand `AiTier` 0|1|2|3 → 0|1|2|3|4|5 in `src/types/ai.ts`
- **R169-3**: Cost telemetry uses `byCapability` aggregation
- **R169-4**: `getCapabilityForTier()` helper for runtime queries
- **R173-4**: T4 Writer orchestrator using `reasoning-balanced` capability
- **R173-5**: T5 Auditor orchestrator using `reasoning-frontier` capability
- **R174-1**: Model rollback within capability without touching tier handlers (Gemini 3 → 2.5)

---

## Model selection rationale (May 2026)

Current `CAPABILITY_MAP`:

| Capability | Provider | Model | Reasoning |
|---|---|---|---|
| security-router | google | gemini-3.1-flash-lite | Fast cheap classifier; lite variant for T0 routing |
| tool-calling-cheap | google | gemini-3-flash-preview | Tool calls + Firestore lookups |
| rag-balanced | google | gemini-3-flash-preview | RAG + grounding; saves Sonnet quota |
| reasoning-balanced | anthropic | claude-sonnet-4-6 | Best price/quality for complex reasoning |
| reasoning-frontier | anthropic | claude-opus-4-7 | Best quality for audit/peer review (+35% tokenizer inflation acceptable for low-frequency T5) |
| embedding | voyage | voyage-3-large | 1024-dim, best matryoshka representation |
| rerank | voyage | rerank-2.5 | Best dense reranker |
| ocr | mistral | mistral-ocr-latest | Best layout-aware OCR for scientific PDFs |

**R174-1 rollback**: T0+T1+T2 from `gemini-3.1-flash-lite-preview` / `gemini-3-flash-preview` → `gemini-2.5-flash`.

Reason: Gemini 3 series requires `thought_signature` field in multi-turn function calls. SDK `@google/generative-ai` 2026-05 release doesn't yet expose signature pass-through. Restore to Gemini 3 when SDK signature handling lands (planned R195+).

<!-- R188-1-sync-gemini3-models -->
**Re-adoption (pre-R187)**: T0+T1+T2 are back on Gemini 3 — current `CAPABILITY_MAP`:
T0 `gemini-3.1-flash-lite`, T1+T2 `gemini-3-flash-preview`. The R174-1 rollback above
is preserved as historical record (the decision was correct at R174). The exact reason
re-adoption became safe (SDK fix vs. `functionResponse` role-split per R174-5 vs. Flash
not needing `thought_signature`) is NOT yet confirmed in writing — recover it from the
commit that edited `CAPABILITY_MAP` before treating "resolved" as fact. Open risk: R176-3
(T2 empty `...` response ~10-15% of multi-turn) may share root cause with the original
signature issue; do not close that link without verification.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Hardcoded model strings per tier | Vendor lock-in (original problem) |
| Single tier with prompt routing | Loses cost discipline; all queries use frontier model |
| LangChain abstraction | Heavy framework, doesn't match Labyra's TypeScript-native style |
| Direct LLMProvider abstraction without capability | Provider-level (e.g., `AnthropicProvider`) ties tier to vendor; capability separates semantic role from vendor |

---

## References

- `src/lib/ai/config/capabilities.ts` — implementation
- `src/lib/ai/providers/index.ts` — auto-derive TIER_CONFIG
- ADR-020 — Cost Controls (uses capability for telemetry)
- ADR-021 — Inter-tier Protocols (deferred — Tech 1-9 cross-tier patterns)
- Anthropic pricing: https://www.anthropic.com/pricing
- Google AI pricing: https://ai.google.dev/pricing
- Voyage pricing: https://docs.voyageai.com/docs/pricing

---

@phase R169-architecture-decision
