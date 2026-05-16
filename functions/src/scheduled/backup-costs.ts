/**
 * Scheduled function: backup yesterday's _costs/* docs to Firebase Storage.
 *
 * Schedule: 02:00 UTC daily.
 * Target: gs://{bucket}/_admin/cost-backups/{date}/{tenantId}.json
 *
 * Retention: GCS lifecycle policy (recommend 90 days). Set manually:
 *   gsutil lifecycle set lifecycle.json gs://{bucket}
 *
 * @phase R171-3
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

interface BackupSummary {
  date: string;
  tenantsProcessed: number;
  totalDocs: number;
  errors: string[];
}

function yesterdayUtcYmd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const backupCostsDaily = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 1
  },
  async (_event) => {
    const date = yesterdayUtcYmd();
    const db = getFirestore();
    const storage = getStorage();
    const bucket = storage.bucket();

    const summary: BackupSummary = {
      date,
      tenantsProcessed: 0,
      totalDocs: 0,
      errors: []
    };

    logger.info('[backup-costs] starting', { date, bucket: bucket.name });

    try {
      const tenantsSnap = await db.collection('tenants').get();
      logger.info(`[backup-costs] found ${tenantsSnap.size} tenants`);

      for (const tenantDoc of tenantsSnap.docs) {
        const tenantId = tenantDoc.id;
        try {
          const costDocRef = db.doc(`tenants/${tenantId}/_costs/${date}`);
          const costSnap = await costDocRef.get();

          if (!costSnap.exists) {
            logger.info(`[backup-costs] no data for ${tenantId}/${date}, skipping`);
            continue;
          }

          const data = costSnap.data();
          const filename = `_admin/cost-backups/${date}/${tenantId}.json`;
          const file = bucket.file(filename);

          await file.save(JSON.stringify(data, null, 2), {
            contentType: 'application/json',
            metadata: {
              metadata: {
                tenantId,
                date,
                backupAt: new Date().toISOString(),
                source: 'r171-3-backup-costs'
              }
            }
          });

          summary.tenantsProcessed++;
          summary.totalDocs++;
          logger.info(`[backup-costs] saved ${filename}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          summary.errors.push(`${tenantId}: ${msg}`);
          logger.error(`[backup-costs] error for ${tenantId}`, { err: msg });
        }
      }

      logger.info('[backup-costs] complete', summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.error('[backup-costs] fatal error', { err: msg });
      throw err;
    }
  }
);
