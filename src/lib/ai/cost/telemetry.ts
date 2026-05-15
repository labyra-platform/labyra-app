/**
 * Cost telemetry recording — writes to tenants/{tid}/_costs/{date} aggregate.
 *
 * Pattern: increment aggregate doc (1 Firestore write/request).
 * Reads via aggregator helper (separate file when needed).
 *
 * Idempotent: if recordCost fails (network), tier handler continues — cost
 * tracking is observability, not correctness.
 *
 * @phase R169-3
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

/**
 * Record cost to tenant daily aggregate. Best-effort: failures logged but
 * never throw to caller (tier handler must complete the user request).
 */
export async function recordCost(input: CostTelemetryInput): Promise<void> {
  const { tenantId, tier, capability, feature, costUsd } = input;
  if (costUsd <= 0) return;

  const date = todayUtcYmd();
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/_costs/${date}`);

  try {
    await ref.set(
      {
        schemaVersion: 1,
        date,
        tenantId,
        totalCost: FieldValue.increment(costUsd),
        [`byTier.${tier}.queries`]: FieldValue.increment(1),
        [`byTier.${tier}.cost`]: FieldValue.increment(costUsd),
        [`byCapability.${capability}.cost`]: FieldValue.increment(costUsd),
        [`byFeature.${feature}.queries`]: FieldValue.increment(1),
        [`byFeature.${feature}.cost`]: FieldValue.increment(costUsd),
        updatedAt: Date.now()
      },
      { merge: true }
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- telemetry is best-effort
    console.warn('[recordCost] write failed (non-fatal):', err);
  }
}
