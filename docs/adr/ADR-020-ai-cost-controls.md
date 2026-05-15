# ADR-020: AI Cost Controls — Estimator, Quota Guard, Drift Detection

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: R168-3.13a
**Owner**: nAM

## Context

Without cost controls, a single runaway query or compromised user can drain monthly AI budget in hours. Original `cost-calculator.ts` exists but has:

1. **Wrong pricing**: `gemini-2.5-flash` listed at $0.075/$0.30 (official $0.30/$2.50).
2. **No tokenizer inflation** for Opus 4.7 (+35% same text vs 4.6).
3. **No telemetry**: costs calculated per request but not aggregated to Firestore for audit.
4. **No daily/monthly enforcement** — `governance/tiers.ts` defines limits but no enforce path.
5. **No drift detection**: estimate may differ from actual billing by 20%+.

## Decision

Implement 5-component cost control system:

### Component 1: Capability-aware estimator

```typescript
// src/lib/ai/cost/estimator.ts (R169)

export function estimateCost(usage: TokenUsage, capability: Capability): number {
  const profile = CAPABILITY_MAP[capability];

  const uncachedInput = usage.inputTokens - (usage.cachedInputTokens ?? 0);
  const inputCost = (uncachedInput / 1_000_000) * profile.inputCost;
  const cachedCost = ((usage.cachedInputTokens ?? 0) / 1_000_000) * profile.cacheReadCost;
  const cacheWriteCost = ((usage.cacheCreationTokens ?? 0) / 1_000_000) * profile.inputCost * 1.25;
  const totalOutput = usage.outputTokens + (usage.thinkingTokens ?? 0);
  const outputCost = (totalOutput / 1_000_000) * profile.outputCost;

  return inputCost + cachedCost + cacheWriteCost + outputCost;
}
```

Already implemented in `src/lib/ai/providers/cost-calculator.ts` — extend with capability mapping in R169.

### Component 2: Cost telemetry to Firestore

```
tenants/{tid}/_costs/{yyyy-mm-dd}
  totalCost: number
  byTier: { 0: { queries, cost }, 1: ..., 5: ... }
  byCapability: { 'reasoning-balanced': { cost }, ... }
  byFeature: { spectrum_analysis: { cost }, paper_writing: { cost }, chat: { cost } }
  updatedAt: Timestamp
```

Cost records aggregated daily for fast dashboard reads + monthly rollup.

### Component 3: Tier 5 trigger refinement

Original design "always background for >500 words" = 80-100% trigger. With realistic Opus pricing $0.40/audit, this inflates Writer cost from $0.18 to $0.58 (3.2× claim).

**New 3-level trigger:**

```typescript
type AuditPriority = 'critical' | 'standard' | 'skip';

function decideTier5(tier4: WriterResult, ctx: TierContext, plan: Plan): AuditPriority {
  if (plan === 'free') return 'skip';

  // CRITICAL — always audit
  if (ctx.labContext?.spectrumId && tier4.hasNumericalClaims) return 'critical';
  if (tier4.context === 'paper_submission') return 'critical';

  // SKIP — no value
  if (tier4.wordCount < 200) return 'skip';
  if (ctx.intent !== 'writing') return 'skip';
  if (!tier4.hasNumericalClaims && !tier4.hasCitations) return 'skip';

  return 'standard';  // → adaptive sampling based on quota
}
```

**Adaptive sampling for 'standard' priority:**
- Quota < 50% used → audit 100%
- Quota 50-80% → sample 50%
- Quota > 80% → reserve for 'critical' only

Expected trigger rate: 80% → ~25%. Cost reduction: -65%.

### Component 4: Quota Guard v2

Extends `src/lib/ai/governance/quota.ts` with 4 gates:

```typescript
interface PlanLimits {
  daily: { total: number; opus: number };
  monthly: { total: number; opus: number };
  perFeature: { spectrum_analysis: number; paper_writing: number; chat: number };
}

async function checkCostGuard(tenantId, feature, tier, estimatedCost) {
  // Gate 1: daily total
  if (today.total + estimatedCost > limits.daily.total) return reject;
  // Gate 2: monthly total
  if (thisMonth.total + estimatedCost > limits.monthly.total) return reject;
  // Gate 3: daily Opus (Tier 5 specifically)
  if (tier === 5 && today.opus + estimatedCost > limits.daily.opus) return reject;
  // Gate 4: per-feature daily
  if (today.byFeature[feature] + estimatedCost > limits.perFeature[feature]) return reject;
  return allow;
}
```

### Component 5: Drift detection cron

Daily reconcile estimate vs actual billing API:

```typescript
async function reconcileDailyCost(date: string) {
  const estimated = await getEstimatedCost(date);
  const actualAnthropic = await fetchAnthropicUsage(date);
  const actualGoogle = await fetchGoogleBilling(date);
  const drift = (actual - estimated) / estimated;

  if (Math.abs(drift) > 0.20) {
    await alertOps({ severity: 'high', drift, date });
  }

  await writeReport(tenantId, date, { estimated, actual, drift });
}
```

Cloud Function scheduler — daily 02:00 UTC (after billing delay).

## Alternatives Considered

### Alt 1: Use Anthropic Usage API in real-time (rejected)

- Anthropic Usage API delayed 24h.
- Real-time enforcement requires estimates anyway.
- Drift detection is the right pattern (estimate + reconcile).

### Alt 2: Per-token in-line tracking (rejected for Stage 1)

- Increment Firestore counter every API call.
- High write cost on Firestore (1 write per request = $0.18/1M writes).
- Better: aggregate daily, accept ±5% intra-day error.

### Alt 3: External cost monitoring (Helicone, Langsmith) (rejected)

- 3rd party = data leak risk.
- Cost = $50-200/mo overhead.
- Self-hosted via Firestore aggregate is simpler + private.

## Consequences

### Positive

- **Hard budget cap**: 4-gate check prevents runaway cost.
- **Drift alerting**: catch silent pricing changes within 24h.
- **Audit trail**: every query has cost in PROV-O lineage.
- **Tier 5 cost reduction 65%** through trigger refinement.

### Negative

- **Estimate-vs-actual gap ±20% initially**: needs 30-day baseline.
- **Firestore aggregate write cost**: minimal (~$0.50/mo per tenant).
- **Cron complexity**: requires Anthropic billing API access + service account permissions.

### Risks

| Risk | Mitigation |
|---|---|
| Estimate undercounts → unexpected bill | Drift detection alerts +20% within 24h |
| Cron job fails silently → no reconciliation | Cloud Functions error alerting via Slack |
| Anthropic billing API rate limits | Backoff + retry; fallback to manual monthly reconcile |

## Implementation Tracking

- R168-3.13b: fix existing `cost-calculator.ts` pricing (1h).
- R169: extend with capability mapping + Firestore telemetry.
- R170: Tier 5 trigger refinement + quota guard v2.
- R171: drift detection cron.

## References

- `src/lib/ai/providers/cost-calculator.ts` — current implementation
- `src/lib/ai/governance/tiers.ts` — quota definitions
- `docs/adr/ADR-019-ai-tier-architecture.md` — tier design
- Anthropic Usage API: https://docs.anthropic.com/en/api/admin-api/usage_cost/get-cost-report
- Google Cloud Billing API: https://cloud.google.com/billing/docs/reference/rest
