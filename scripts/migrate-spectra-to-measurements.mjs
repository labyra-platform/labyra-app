#!/usr/bin/env node
/**
 * R164-phase-5c — Migrate spectra → measurements collection.
 *
 * Reads tenants/{tid}/spectra/* and copies each doc to
 * tenants/{tid}/measurements/{same-id} with ProvBase fields injected.
 *
 * Storage files are NOT moved; gs:// references are updated to point at the
 * NEW path format ONLY IF the old file location is also accessible at the new
 * path. Since storage paths are now `tenants/{tid}/measurements/{id}/raw/*`
 * for new uploads, OLD files at `tenants/{tid}/spectra/{id}/raw/*` remain
 * at the OLD path. For migrated docs we KEEP the original `storage.raw` URL
 * pointing at the old location — signed-download still works because the
 * /raw/ file physically exists where the gs:// URL says.
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-spectra-to-measurements.mjs [opts]
 *
 * Options:
 *   --dry-run      Don't write anything, just print counts
 *   --tenant=<id>  Migrate only one tenant (default: all)
 *   --force        Re-migrate docs already marked with _migrated
 *
 * Exit codes:
 *   0 success / dry-run
 *   1 any error during migration
 *
 * @phase R164-phase-5c
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Args parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const tenantArg = args.find((a) => a.startsWith('--tenant='));
const onlyTenant = tenantArg ? tenantArg.slice('--tenant='.length) : null;

// ─── Init Admin SDK ────────────────────────────────────────────────────
const credsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
let creds;
if (credsB64) {
  creds = JSON.parse(Buffer.from(credsB64, 'base64').toString('utf-8'));
} else if (credsJson) {
  creds = JSON.parse(credsJson);
} else {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS_BASE64 or _JSON');
  process.exit(1);
}
if (typeof creds.private_key === 'string') {
  creds.private_key = creds.private_key.replace(/\\n/g, '\n');
}

initializeApp({ credential: cert(creds) });
const db = getFirestore();
db.settings({ databaseId: 'labbook' });

console.log(`[migrate] mode=${dryRun ? 'DRY-RUN' : 'WRITE'} tenant=${onlyTenant ?? 'ALL'} force=${force}`);

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  const tenantsSnap = await db.collection('tenants').get();
  let totalRead = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const tenantStats = [];

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    if (onlyTenant && tenantId !== onlyTenant) continue;

    const spectraSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('spectra')
      .get();

    if (spectraSnap.empty) {
      console.log(`[${tenantId}] no spectra, skip`);
      continue;
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of spectraSnap.docs) {
      totalRead++;
      const data = doc.data();
      const id = doc.id;

      // Skip if already migrated (unless --force)
      if (data._migrated && !force) {
        skipped++;
        totalSkipped++;
        continue;
      }

      // Build new measurement doc with ProvBase fields
      const measurement = {
        // Keep all existing fields
        ...data,
        // ProvBase additions
        id,
        tenantId,
        schemaVersion: 1,
        createdBy: data.createdBy ?? data.operator ?? 'migration-system',
        createdAt: data.createdAt ?? Date.now(),
        lifecycleStatus: 'active',
        // Rename status semantics: legacy `status` = processing state.
        // Keep both fields for backward compat with reads expecting `status`.
        processingStatus: data.status ?? 'uploaded',
        processingStatusAt: data.updatedAt ?? data.createdAt ?? Date.now(),
        // Lineage: derive from sample (if present)
        derivedFrom: data.sampleId ? [data.sampleId] : undefined,
        // PROV: spectraImport activity
        generatedBy: `migration:${MARKER}`
      };

      // Cleanup: don't carry the _migrated flag itself
      delete measurement._migrated;

      try {
        if (!dryRun) {
          const measurementRef = db
            .collection('tenants')
            .doc(tenantId)
            .collection('measurements')
            .doc(id);

          // Use set with merge:false to be explicit — if a doc exists at
          // /measurements/{id} we WANT to overwrite (--force semantics).
          // If you want to preserve existing /measurements/, use merge:true.
          await measurementRef.set(measurement);

          // Mark source as migrated (don't delete — keep audit trail)
          await doc.ref.update({
            _migrated: true,
            _migratedAt: FieldValue.serverTimestamp(),
            _migratedTo: `tenants/${tenantId}/measurements/${id}`
          });
        }
        migrated++;
        totalMigrated++;
      } catch (err) {
        errors++;
        totalErrors++;
        console.error(`[${tenantId}/${id}] FAIL: ${err.message}`);
      }
    }

    tenantStats.push({ tenantId, total: spectraSnap.size, migrated, skipped, errors });
    console.log(
      `[${tenantId}] migrated=${migrated} skipped=${skipped} errors=${errors} (total=${spectraSnap.size})`
    );
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`Summary: read=${totalRead} migrated=${totalMigrated} skipped=${totalSkipped} errors=${totalErrors}`);
  console.log('─'.repeat(60));

  if (dryRun) {
    console.log('DRY-RUN — no writes performed. Re-run without --dry-run to apply.');
  } else {
    console.log('Migration complete. Source docs marked with _migrated=true (kept for audit).');
    console.log('Verify in Firebase Console: tenants/{tid}/measurements/');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
