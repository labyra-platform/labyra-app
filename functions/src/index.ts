/**
 * Firebase Functions entry point.
 *
 * R171-0: Initial setup for scheduled cost backup, Ragas eval, drift detection.
 *
 * Region: asia-southeast1 (matches spectra-worker for cross-service IAM simplicity).
 *
 * Scheduled functions:
 *   - backupCostsDaily: 02:00 UTC daily (R171-3)
 *   - ragasEvalWeekly: 03:00 UTC Sunday (R171-5)
 *   - reconcileCostDrift: 02:30 UTC daily (R171-6)
 *
 * @phase R171-0
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

// Global config — applies to all functions in this file
setGlobalOptions({
  region: 'asia-southeast1',
  memory: '512MiB',
  timeoutSeconds: 540, // 9 minutes max for Gen 2
  maxInstances: 10
});

// Initialize Admin SDK once (shared across functions)
initializeApp();

// R171-3: backup daily cost aggregates to Firebase Storage
export { backupCostsDaily } from './scheduled/backup-costs.js';

// R171-5: weekly Ragas-style evaluation of random conversation sample
export { ragasEvalWeekly } from './scheduled/ragas-eval.js';

// R171-6: daily drift reconciliation between estimated and actual billing
export { reconcileCostDrift } from './scheduled/cost-drift.js';

// Stub export so deploy doesn't fail before scheduled functions added
export const healthCheck = (() => {
  // Placeholder — replaced when first scheduled function ships
  return null;
})();
