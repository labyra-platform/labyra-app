/**
 * Scheduled function: daily drift reconciliation.
 *
 * Compares estimated cost (from _costs/{date} aggregates) against actual
 * billing (Anthropic Usage API + Google Cloud Billing API).
 *
 * Schedule: 02:30 UTC daily.
 * Date: D-2 (2 days ago — Anthropic billing data 24h delay).
 *
 * Output: tenants/{tid}/_drift/{date}
 * Alert threshold: |drift| > 20% triggers logger.warn.
 *
 * Voyage + Mistral NOT reconciled (no public usage API). Only Anthropic + Google.
 *
 * @phase R171-6
 * @see docs/adr/ADR-020-ai-cost-controls.md
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { GoogleAuth } from 'google-auth-library';

const anthropicAdminKey = defineSecret('ANTHROPIC_ADMIN_KEY');
const gcpBillingAccountId = defineSecret('GCP_BILLING_ACCOUNT_ID');

const DRIFT_ALERT_THRESHOLD = 0.2; // 20% drift triggers warn

// ─── Types ───────────────────────────────────────────────────
interface DriftReport {
  schemaVersion: 1;
  date: string;
  tenantId: string;
  estimated: {
    anthropic: number;
    google: number;
    voyage: number;
    mistral: number;
    total: number;
  };
  actual: {
    anthropic: number;
    google: number;
  };
  drift: {
    anthropic: number;
    google: number;
    reconciledTotal: number; // (anthropic + google actual) vs estimated portion
  };
  alertTriggered: boolean;
  alertReasons: string[];
  reconciledAt: number;
  notes: string;
}

interface TenantCostBreakdown {
  byProvider: {
    anthropic: number;
    google: number;
    voyage: number;
    mistral: number;
  };
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────
function utcYmd(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Map capability name → provider (mirrors capabilities.ts).
 * Cannot import from src/lib/ai/ (separate build context).
 */
function capabilityProvider(capability: string): 'anthropic' | 'google' | 'voyage' | 'mistral' {
  if (capability === 'reasoning-balanced' || capability === 'reasoning-frontier')
    return 'anthropic';
  if (
    capability === 'security-router' ||
    capability === 'tool-calling-cheap' ||
    capability === 'rag-balanced'
  )
    return 'google';
  if (capability === 'embedding' || capability === 'rerank') return 'voyage';
  if (capability === 'ocr') return 'mistral';
  return 'google'; // default fallback
}

async function getTenantEstimated(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  date: string
): Promise<TenantCostBreakdown> {
  const snap = await db.doc(`tenants/${tenantId}/_costs/${date}`).get();
  if (!snap.exists) {
    return {
      byProvider: { anthropic: 0, google: 0, voyage: 0, mistral: 0 },
      total: 0
    };
  }
  const data = snap.data() as {
    byCapability?: Record<string, { cost?: number }>;
    totalCost?: number;
  };

  const byProvider = { anthropic: 0, google: 0, voyage: 0, mistral: 0 };
  for (const [cap, stats] of Object.entries(data.byCapability ?? {})) {
    const provider = capabilityProvider(cap);
    byProvider[provider] += stats.cost ?? 0;
  }

  return {
    byProvider,
    total: data.totalCost ?? 0
  };
}

/**
 * Fetch Anthropic actual cost for a date.
 * Uses Cost Report API endpoint.
 *
 * @see https://docs.anthropic.com/en/api/admin-api/usage_cost/get-cost-report
 */
async function fetchAnthropicActual(adminKey: string, date: string): Promise<number> {
  // Start of day UTC
  const startDate = new Date(`${date}T00:00:00Z`).toISOString();
  const endDate = new Date(`${date}T23:59:59Z`).toISOString();

  const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(startDate)}&ending_at=${encodeURIComponent(endDate)}`;

  const response = await fetch(url, {
    headers: {
      'x-api-key': adminKey,
      'anthropic-version': '2023-06-01'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ cost?: { amount?: number; currency?: string } }>;
  };

  // Sum all line items (cost in USD)
  const total = (data.data ?? []).reduce((sum, line) => {
    return sum + (line.cost?.amount ?? 0);
  }, 0);

  return total;
}

/**
 * Fetch Google Cloud Billing API actual cost for a date.
 * Note: requires roles/billing.viewer on billing account.
 *
 * Uses Cloud Catalog/Billing reporting via REST.
 */
async function fetchGoogleActual(
  billingAccountId: string,
  date: string,
  project: string
): Promise<number> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-billing']
  });
  const client = await auth.getClient();
  const tokenInfo = await client.getAccessToken();
  if (!tokenInfo.token) throw new Error('Failed to get GCP access token');

  // Cloud Billing API doesn't expose daily cost directly via REST.
  // Workaround: use BigQuery billing export (if enabled) or estimate from cost report.
  // For now: best-effort placeholder returning 0 + log warning.
  //
  // Full implementation requires:
  //   1. Enable billing export to BigQuery (manual setup)
  //   2. Query BigQuery: SELECT SUM(cost) FROM billing_export WHERE date = ? AND project = ?
  //
  // R172+ task: implement BigQuery billing export.
  logger.warn(
    '[cost-drift] Google billing fetch — BigQuery export not yet configured. Returning 0.',
    {
      billingAccountId,
      date,
      project
    }
  );

  return 0;
}

function calculateDrift(estimated: number, actual: number): number {
  if (estimated === 0 && actual === 0) return 0;
  if (estimated === 0) return actual > 0 ? 1.0 : 0;
  return (actual - estimated) / estimated;
}

// ─── Main Cron Handler ───────────────────────────────────────
export const reconcileCostDrift = onSchedule(
  {
    schedule: '30 2 * * *',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 1,
    secrets: [anthropicAdminKey, gcpBillingAccountId]
  },
  async (_event) => {
    const date = utcYmd(2); // D-2
    const db = getFirestore();
    const project = process.env.GCLOUD_PROJECT;
    if (!project) throw new Error('GCLOUD_PROJECT not set — refusing to run cost-drift');

    logger.info('[cost-drift] starting', { date });

    let totalEstimated = 0;
    let totalActualAnthropic = 0;
    let totalActualGoogle = 0;
    let tenantsReconciled = 0;

    try {
      // Fetch actual cost ONCE (cross-tenant aggregate)
      const [anthropicActual, googleActual] = await Promise.all([
        fetchAnthropicActual(anthropicAdminKey.value(), date).catch((err) => {
          logger.error('[cost-drift] Anthropic fetch failed', { err: err.message });
          return -1; // sentinel for failure
        }),
        fetchGoogleActual(gcpBillingAccountId.value(), date, project).catch((err) => {
          logger.error('[cost-drift] Google fetch failed', { err: err.message });
          return -1;
        })
      ]);

      logger.info('[cost-drift] actual fetched', {
        date,
        anthropicActual,
        googleActual
      });

      // Sum estimated across all tenants
      const tenantsSnap = await db.collection('tenants').get();
      const tenantBreakdowns = new Map<string, TenantCostBreakdown>();

      for (const tenantDoc of tenantsSnap.docs) {
        const tenantId = tenantDoc.id;
        const breakdown = await getTenantEstimated(db, tenantId, date);
        tenantBreakdowns.set(tenantId, breakdown);
        totalEstimated += breakdown.total;
      }

      // Write per-tenant drift reports
      // Note: actual is cross-tenant; per-tenant drift uses tenant's share of estimated
      for (const [tenantId, breakdown] of tenantBreakdowns) {
        const tenantShareAnthropic =
          totalEstimated > 0
            ? (breakdown.byProvider.anthropic / totalEstimated) *
              (anthropicActual >= 0 ? anthropicActual : 0)
            : 0;
        const tenantShareGoogle =
          totalEstimated > 0
            ? (breakdown.byProvider.google / totalEstimated) *
              (googleActual >= 0 ? googleActual : 0)
            : 0;

        const driftAnthropic = calculateDrift(breakdown.byProvider.anthropic, tenantShareAnthropic);
        const driftGoogle = calculateDrift(breakdown.byProvider.google, tenantShareGoogle);
        const driftReconciledTotal = calculateDrift(
          breakdown.byProvider.anthropic + breakdown.byProvider.google,
          tenantShareAnthropic + tenantShareGoogle
        );

        const alertReasons: string[] = [];
        if (Math.abs(driftAnthropic) > DRIFT_ALERT_THRESHOLD)
          alertReasons.push(`anthropic_drift_${(driftAnthropic * 100).toFixed(1)}%`);
        if (Math.abs(driftGoogle) > DRIFT_ALERT_THRESHOLD)
          alertReasons.push(`google_drift_${(driftGoogle * 100).toFixed(1)}%`);

        const report: DriftReport = {
          schemaVersion: 1,
          date,
          tenantId,
          estimated: {
            anthropic: breakdown.byProvider.anthropic,
            google: breakdown.byProvider.google,
            voyage: breakdown.byProvider.voyage,
            mistral: breakdown.byProvider.mistral,
            total: breakdown.total
          },
          actual: {
            anthropic: tenantShareAnthropic,
            google: tenantShareGoogle
          },
          drift: {
            anthropic: driftAnthropic,
            google: driftGoogle,
            reconciledTotal: driftReconciledTotal
          },
          alertTriggered: alertReasons.length > 0,
          alertReasons,
          reconciledAt: Date.now(),
          notes:
            googleActual === -1
              ? 'Google actual unavailable (BigQuery billing export not configured)'
              : 'OK'
        };

        await db.doc(`tenants/${tenantId}/_drift/${date}`).set(report);

        if (report.alertTriggered) {
          logger.warn(`[cost-drift] DRIFT ALERT ${tenantId}`, report);
        }

        tenantsReconciled++;
      }

      totalActualAnthropic = anthropicActual >= 0 ? anthropicActual : 0;
      totalActualGoogle = googleActual >= 0 ? googleActual : 0;

      logger.info('[cost-drift] complete', {
        date,
        tenantsReconciled,
        totalEstimated: totalEstimated.toFixed(4),
        totalActualAnthropic: totalActualAnthropic.toFixed(4),
        totalActualGoogle: totalActualGoogle.toFixed(4),
        globalDriftAnthropic:
          totalEstimated > 0
            ? ((totalActualAnthropic - totalEstimated) / totalEstimated).toFixed(4)
            : 'n/a'
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.error('[cost-drift] fatal', { err: msg });
      throw err;
    }
  }
);
