/**
 * Cost telemetry recording — writes to tenants/{tid}/_costs/{date} aggregate.
 *
 * R170-3: extended with latency + actual tokens.
 * R170-4: extended with grounding signals.
 *
 * Best-effort: failures logged, never throw to caller.
 *
 * @phase R169-3 base, R170-3 extended, R170-4 grounding
 * @see docs/adr/ADR-020-ai-cost-controls.md
 */
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { CostTelemetryInput } from '@/types/cost';

function todayUtcYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function recordCost(input: CostTelemetryInput): Promise<void> {
  const {
    tenantId,
    tier,
    capability,
    feature,
    costUsd,
    inputTokens = 0,
    outputTokens = 0,
    latencyMs = 0,
    unverifiedNumbers = 0,
    unsourcedClaims = 0
  } = input;
  if (costUsd <= 0) return;

  const date = todayUtcYmd();
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/_costs/${date}`);

  try {
    const updates: Record<string, unknown> = {
      schemaVersion: 2,
      date,
      tenantId,
      totalCost: FieldValue.increment(costUsd),
      [`byTier.${tier}.queries`]: FieldValue.increment(1),
      [`byTier.${tier}.cost`]: FieldValue.increment(costUsd),
      [`byCapability.${capability}.cost`]: FieldValue.increment(costUsd),
      [`byCapability.${capability}.queries`]: FieldValue.increment(1),
      [`byFeature.${feature}.queries`]: FieldValue.increment(1),
      [`byFeature.${feature}.cost`]: FieldValue.increment(costUsd),
      updatedAt: Date.now()
    };

    if (inputTokens > 0) {
      updates[`byCapability.${capability}.inputTokens`] = FieldValue.increment(inputTokens);
    }
    if (outputTokens > 0) {
      updates[`byCapability.${capability}.outputTokens`] = FieldValue.increment(outputTokens);
    }
    if (latencyMs > 0) {
      updates[`byCapability.${capability}.latencyMsTotal`] = FieldValue.increment(latencyMs);
    }
    if (unverifiedNumbers > 0) {
      updates[`byFeature.${feature}.unverifiedNumbersTotal`] =
        FieldValue.increment(unverifiedNumbers);
    }
    if (unsourcedClaims > 0) {
      updates[`byFeature.${feature}.unsourcedClaimsTotal`] = FieldValue.increment(unsourcedClaims);
    }

    await ref.set(updates, { merge: true });
  } catch (err) {
    // eslint-disable-next-line no-console -- telemetry is best-effort
    console.warn('[recordCost] write failed (non-fatal):', err);
  }
}
