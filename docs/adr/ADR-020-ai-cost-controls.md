# ADR-020: Cost Controls (Cost Guard v2 + Per-feature Telemetry + Dry-run)

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: R170

---

## Context

After R169 expanded to 6 tiers, cost variance per query increased:
- T1 Flash: $0.0005/query
- T2 RAG: $0.001/query
- T3 Reflection: $0.005-0.015/query (3 rounds Sonnet)
- T4 Writer: $0.01-0.02/query (long output Sonnet)
- T5 Auditor: $0.05-0.15/query (Opus + max claims)

Without cost discipline, a single tenant could:
1. Spam T5 audits → $50+/day
2. Run T4 Writer in tight loop → drain monthly budget
3. Tools mode tool spam → unbounded tool rounds

Existing infra was minimal Cost Guard v1 (R168-3): per-call cap only. Insufficient.

## Decision

Implement **Cost Guard v2** with 4-gate pre-check before every non-T0 LLM call, plus per-feature telemetry and dry-run mode.

### 4-gate Cost Guard

`src/lib/ai/governance/cost-guard.ts`:

```ts
export async function checkCostGuard(
  tenantId: string,
  tier: AiTier,
  feature: FeatureKind,
  estimatedCostUsd: number
): Promise<{
  allowed: boolean;
  reason?: string;
  dailyCurrent: number;
  dailyLimit: number | null;
  monthlyCurrent: number;
  monthlyLimit: number | null;
}> {
  const limits = await getTenantLimits(tenantId);
  
  // Gate 1: Per-call estimate cap
  if (estimatedCostUsd > limits.perCallCap) {
    return { allowed: false, reason: 'per_call_cap_exceeded', ... };
  }
  
  // Gate 2: Daily cap
  const todayCost = await getTodayCost(tenantId);
  if (todayCost + estimatedCostUsd > limits.dailyCap) {
    return { allowed: false, reason: 'daily_cap_exceeded', ... };
  }
  
  // Gate 3: Monthly cap
  const monthCost = await getMonthCost(tenantId);
  if (monthCost + estimatedCostUsd > limits.monthlyCap) {
    return { allowed: false, reason: 'monthly_cap_exceeded', ... };
  }
  
  // Gate 4: Feature-specific quota
  const featureQuota = await getFeatureQuota(tenantId, feature);
  if (featureQuota.used + 1 > featureQuota.limit) {
    return { allowed: false, reason: 'feature_quota_exceeded', ... };
  }
  
  return { allowed: true, dailyCurrent: todayCost, ... };
}
```

### Tenant tiers

`tenants/{tid}.tier`: `'free' | 'pro' | 'enterprise'`

Limits encoded in `src/lib/ai/governance/limits.ts`:

```ts
const TENANT_LIMITS: Record<TenantTier, TenantLimits> = {
  free: {
    perCallCap: 0.01,    // $0.01/call max
    dailyCap: 0.10,      // $0.10/day max
    monthlyCap: 1,       // $1/month max
    features: {
      paper_writing: { limit: 5, period: 'day' },
      audit: { limit: 2, period: 'day' }
    }
  },
  pro: {
    perCallCap: 0.10,
    dailyCap: 5,
    monthlyCap: 50,
    features: {
      paper_writing: { limit: 50, period: 'day' },
      audit: { limit: 20, period: 'day' }
    }
  },
  enterprise: {
    perCallCap: 1,
    dailyCap: Infinity,
    monthlyCap: Infinity,
    features: {} // no feature limits
  }
};
```

Lab BKU (`tenant-dev-001`) tier = `enterprise` (no quota block dev).

### Cost estimator

`src/lib/ai/cost/estimator.ts`:

```ts
export function estimateCost(
  tier: AiTier,
  feature: FeatureKind,
  options?: {
    inputTokenEstimate?: number;
    outputTokenEstimate?: number;
  }
): number {
  const capability = TIER_CAPABILITY[tier];
  const profile = CAPABILITY_MAP[capability];
  
  // Heuristics per feature
  const inputTokens = options?.inputTokenEstimate ?? defaultInputTokens(tier, feature);
  const outputTokens = options?.outputTokenEstimate ?? Math.min(profile.maxTokens, defaultOutputTokens(tier, feature));
  
  const inflation = profile.tokenizerInflation ?? 1.0;
  
  return (
    (inputTokens / 1_000_000) * profile.inputCost * inflation +
    (outputTokens / 1_000_000) * profile.outputCost * inflation
  );
}
```

Default heuristics tuned from production telemetry.

### Per-feature telemetry

`src/lib/ai/cost/telemetry.ts`:

```ts
export async function recordCost(params: {
  tenantId: string;
  tier: AiTier;
  capability: Capability;
  feature: FeatureKind;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  grounding?: { unverifiedNumbers: number; unsourcedClaims: number };
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // yyyy-MM-dd
  const ref = db.doc(`tenants/${params.tenantId}/_costs/${today}`);
  
  await ref.set({
    totalCostUsd: FieldValue.increment(params.costUsd),
    [`byTier.${params.tier}.costUsd`]: FieldValue.increment(params.costUsd),
    [`byTier.${params.tier}.queryCount`]: FieldValue.increment(1),
    [`byFeature.${params.feature}.costUsd`]: FieldValue.increment(params.costUsd),
    [`byFeature.${params.feature}.queryCount`]: FieldValue.increment(1),
    [`byCapability.${params.capability}.costUsd`]: FieldValue.increment(params.costUsd),
    [`byCapability.${params.capability}.queryCount`]: FieldValue.increment(1),
    [`byTier.${params.tier}.inputTokens`]: FieldValue.increment(params.inputTokens),
    [`byTier.${params.tier}.outputTokens`]: FieldValue.increment(params.outputTokens),
    [`byTier.${params.tier}.latencyMsTotal`]: FieldValue.increment(params.latencyMs),
    // ... grounding warnings, etc.
  }, { merge: true });
}
```

Document shape:
```
tenants/{tid}/_costs/{yyyy-MM-dd}
  totalCostUsd: number
  byTier: {
    1: { costUsd, queryCount, inputTokens, outputTokens, latencyMsTotal }
    2: { ... }
    ...
  }
  byFeature: { lab_ops: ..., theory: ..., spectrum_analysis: ..., paper_writing: ..., audit: ... }
  byCapability: { ... }
  latencyP50, latencyP95
  groundingWarnings: { unverifiedNumbers, unsourcedClaims }
```

Backed up daily by `backupCostsDaily` Cloud Function (R171-3) to GCS for offline analysis.

### Dry-run mode

`src/app/api/chat/route.ts` accepts query param `?dry_run=1`:

```ts
if (request.nextUrl.searchParams.get('dry_run') === '1') {
  return NextResponse.json({
    mode: 'dry_run',
    tier: intentDecision.tier,
    feature: intentDecision.feature,
    capability: getCapabilityForTier(intentDecision.tier),
    intentDecision,
    estimatedCostUsd: estimateCost(intentDecision.tier, intentDecision.feature),
    costGuardCheck: await checkCostGuard(tenantId, intentDecision.tier, intentDecision.feature, estimated)
  });
}
```

Returns routing decision + cost estimate without calling LLM. Useful for:
- Testing classifier behavior
- Debug "why did this query route to T2 not T3?"
- Estimate cost before bulk operation

### Structured logging (R171-4)

In `src/app/api/chat/route.ts`, after `checkCostGuard`:

```ts
console.info(JSON.stringify({
  event: 'cost_guard_check',
  tenantId,
  tier,
  feature,
  estimated,
  allowed: costCheck.allowed,
  reason: costCheck.reason,
  dailyCurrent: costCheck.dailyCurrent,
  dailyLimit: costCheck.dailyLimit,
  monthlyCurrent: costCheck.monthlyCurrent,
  monthlyLimit: costCheck.monthlyLimit
}));
```

Visible in Vercel logs + Cloud Logging (if Vercel logs forwarded). Queryable by `event:"cost_guard_check"`.

---

## Consequences

### Positive

- **Predictable spend**: 4 gates prevent any single tenant from runaway cost
- **Per-feature visibility**: Optimize quotas based on actual usage patterns
- **Pre-call rejection**: Failed requests return 429 fast (no LLM call), saving cost
- **Dry-run testing**: Validate routing/cost without LLM cost
- **Audit trail**: Structured logs for cost forensics

### Negative

- **Firestore reads per call**: 2 reads (today + month aggregates) before every LLM call
- **Estimator accuracy**: ~80% accurate; over/under-estimates by ~20%
- **Cap rigidity**: Hard limits may block legitimate high-quality queries near month-end

### Mitigations

- Firestore reads cached briefly (5s) — same tenant within window reuses cache
- Calibrate estimator quarterly based on telemetry drift
- Enterprise tier has `Infinity` caps (no block)
- Override mechanism: superadmin can bump tenant tier via `set-tenant-tier.mjs`

---

## Implementation phases

- **R170-1**: Capability getter helper `getCapabilityForTier()`
- **R170-2**: Cost estimator with feature-aware defaults
- **R170-3**: Cost Guard 4-gate pre-check
- **R170-4**: Per-feature telemetry in `recordCost`
- **R170-5**: Wire Cost Guard into `/api/chat/route.ts`
- **R170-6**: Conversation cost endpoint `/api/conversations/[id]/cost`
- **R170-7**: Dry-run mode `?dry_run=1`
- **R171-4**: Structured logging for Cost Guard decisions
- **R171-5**: Ragas eval cost cap $5/run (mirror Cost Guard)
- **R172**: Superadmin dashboard reads telemetry aggregates

---

## Monitoring

### Cost Guard alerts (Cloud Functions cron)

R171-6 `reconcileCostDrift` cron 02:30 UTC daily:
1. Sum estimated costs from `tenants/{tid}/_costs/{D-2}.totalCostUsd`
2. Fetch actual costs:
   - Anthropic Usage API (cross-org via Admin Key)
   - Google Billing BigQuery export (R176-2)
3. Per-tenant attribution via share ratio
4. Alert if |estimated - actual| / actual > 20%

### Founder dashboard (R172)

`/dashboard/superadmin/costs`:
- 4 KPI cards (period total, queries, avg/query, projected monthly)
- Daily cost trend chart (stacked area by tier)
- Recent days raw data table

`/dashboard/superadmin/drift`:
- Drift reports + alerts when |drift| > 20%
- Per-tenant breakdown

---

## Cost optimization roadmap

Phase 1 (current R175):
- Hard caps prevent runaway
- Telemetry reveals usage patterns

Phase 2 (R180+):
- Auto-adjust quotas based on drift
- Per-feature CPM optimization (e.g., move paper_writing to gemini-3-flash-preview when SDK stable)
- Prompt caching audit (Anthropic ephemeral 5m/1h, Gemini context cache)

Phase 3 (R190+):
- Multi-region routing (latency-aware)
- Spot pricing arbitrage (when available)
- Self-hosted models for high-volume capabilities

---

## References

- ADR-019 — AI Tier Architecture (capability abstraction)
- ADR-021 — Inter-tier Protocols (deferred — Tech 5 prompt caching, Tech 7 memoization, Tech 9 cross-tier dedup)
- `src/lib/ai/governance/cost-guard.ts` — implementation
- `src/lib/ai/cost/estimator.ts` — cost estimator
- `src/lib/ai/cost/telemetry.ts` — telemetry writer
- `functions/src/scheduled/cost-drift.ts` — drift detection cron

---

@phase R170-architecture-decision

---

## Addendum R190-1 (2026-05-22) — T0 GA pricing correction

Gemini 3.1 Flash-Lite reached GA on 2026-05-07. `CAPABILITY_MAP` emits the GA
string `gemini-3.1-flash-lite` (no `-preview`), but the authoritative PRICING
table still keyed the entry as `gemini-3.1-flash-lite-preview`. Result: every
Tier-0 (Shield + Router) request fell through to the `unknown model -> $0`
branch for ~2 weeks, under-counting per-feature cost telemetry **and** the
Cost Guard per-tenant caps that gate commercial launch.

Fix: renamed the PRICING key to the GA string and updated GA caching rates
($0.20/M read, $0.50/M write; previously preview $0.025/$0.25). Input rate
$0.25/M is the cache-miss rate, which matches the `nonCachedInput` passed by
the Gemini provider after subtracting `cachedContentTokenCount`.

Follow-up (R190-2, tracked): add a guardrail test asserting every model in
`isTierModel()` exists in `PRICING`. The `unknown -> return 0` branch silently
swallowed this defect; a tier model with no price is a launch-blocking error
and must fail in CI, not log a warning at runtime.

