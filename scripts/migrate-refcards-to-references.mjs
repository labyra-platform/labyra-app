#!/usr/bin/env node
/**
 * R164-phase-6c — Migrate reference_cards → references collection.
 *
 * Strategy:
 *   - Read tenants/{tid}/reference_cards/*
 *   - Copy each doc to tenants/{tid}/references/{same-id} with ProvBase fields
 *   - Preserve original ID (to avoid breaking measurement citation references)
 *   - Mark source with `_migrated: true`
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-refcards-to-references.mjs [opts]
 *
 * Options:
 *   --dry-run      Don't write, print counts only
 *   --tenant=<id>  Migrate single tenant
 *   --force        Re-migrate docs already marked
 *
 * @phase R164-phase-6c
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const tenantArg = args.find((a) => a.startsWith('--tenant='));
const onlyTenant = tenantArg ? tenantArg.slice('--tenant='.length) : null;

// ─── Admin SDK init (multi-env-convention support) ─────────────────────
// R164-phase-6c-fix-creds: support multiple credential env var names.
function loadCredentials() {
  // Option 1: Base64-encoded full JSON
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
    return JSON.parse(
      Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf-8')
    );
  }
  // Option 2: Raw JSON in env
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  }
  // Option 3: File path (Google standard)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const fs = require('node:fs');
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8'));
  }
  // Option 4: Single FIREBASE_SERVICE_ACCOUNT_KEY env var (Vercel pattern)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  }
  // Option 5: Composed from individual vars (Next.js pattern)
  if (
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY
    };
  }
  return null;
}

const creds = loadCredentials();
if (!creds) {
  console.error('No Firebase credentials found. Set one of:');
  console.error('  - GOOGLE_APPLICATION_CREDENTIALS_BASE64');
  console.error('  - GOOGLE_APPLICATION_CREDENTIALS_JSON');
  console.error('  - GOOGLE_APPLICATION_CREDENTIALS (file path)');
  console.error('  - FIREBASE_SERVICE_ACCOUNT_KEY (full JSON)');
  console.error('  - FIREBASE_ADMIN_PROJECT_ID + _CLIENT_EMAIL + _PRIVATE_KEY (combined)');
  process.exit(1);
}
if (typeof creds.private_key === 'string') {
  creds.private_key = creds.private_key.replace(/\\n/g, '\n');
}

initializeApp({ credential: cert(creds) });
const db = getFirestore();
// R164-phase-6c-fix-creds: use FIRESTORE_DATABASE_ID env if set (defaults to 'labbook')
db.settings({ ignoreUndefinedProperties: true, databaseId: process.env.FIRESTORE_DATABASE_ID || 'labbook' });

console.log(`[migrate-refs] mode=${dryRun ? 'DRY-RUN' : 'WRITE'} tenant=${onlyTenant ?? 'ALL'} force=${force}`);

async function main() {
  const tenantsSnap = await db.collection('tenants').get();
  let totalRead = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    if (onlyTenant && tenantId !== onlyTenant) continue;

    const cardsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('reference_cards')
      .get();

    if (cardsSnap.empty) {
      console.log(`[${tenantId}] no reference_cards, skip`);
      continue;
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of cardsSnap.docs) {
      totalRead++;
      const data = doc.data();
      const id = doc.id;

      if (data._migrated && !force) {
        skipped++;
        totalSkipped++;
        continue;
      }

      // Build new reference doc with ProvBase + R164 fields
      const reference = {
        ...data,
        // Identity
        id,
        tenantId,
        schemaVersion: 1,
        // ProvBase audit
        createdBy: data.createdBy ?? 'migration-system',
        createdAt: data.createdAt ?? Date.now(),
        updatedBy: data.updatedBy,
        updatedAt: data.updatedAt,
        // PROV-O lineage (refs derive from paper if linked)
        derivedFrom: data.paperId ? [data.paperId] : undefined,
        generatedBy: 'migration:R164-phase-6c',
        lifecycleStatus: 'active',
        // R164 versioning (starts at 1)
        currentVersion: 1,
        // paperId already present in some R163 cards as undefined — preserve
        paperId: data.paperId
      };

      // Cleanup
      delete reference._migrated;

      try {
        if (!dryRun) {
          await db
            .collection('tenants')
            .doc(tenantId)
            .collection('references')
            .doc(id)
            .set(reference);

          await doc.ref.update({
            _migrated: true,
            _migratedAt: FieldValue.serverTimestamp(),
            _migratedTo: `tenants/${tenantId}/references/${id}`
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

    console.log(
      `[${tenantId}] migrated=${migrated} skipped=${skipped} errors=${errors} (total=${cardsSnap.size})`
    );
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`Summary: read=${totalRead} migrated=${totalMigrated} skipped=${totalSkipped} errors=${totalErrors}`);
  console.log('─'.repeat(60));

  if (dryRun) {
    console.log('DRY-RUN — no writes. Re-run without --dry-run to apply.');
  } else {
    console.log('Source docs marked with _migrated=true (kept for audit).');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
