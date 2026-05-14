#!/usr/bin/env tsx
/**
 * Admin migration: backfill spectrumType='xrd' on legacy reference cards.
 *
 * Run once after deploying R163-spectra-4c-1. Idempotent: skips cards already
 * having spectrumType field.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-refcards-add-type.ts
 *
 * Authentication: uses GOOGLE_APPLICATION_CREDENTIALS env var.
 *
 * @phase R163-spectra-4c-1
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'lab-manager-268a6';
console.log(`Migrating reference cards for project: ${projectId}`);

initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
  projectId
});

const db = getFirestore();

async function migrate() {
  // Iterate all tenants
  const tenantsSnap = await db.collection('tenants').get();
  console.log(`Found ${tenantsSnap.size} tenants`);

  let totalChecked = 0;
  let totalMigrated = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const cardsRef = db.collection('tenants').doc(tenantId).collection('reference_cards');
    const cardsSnap = await cardsRef.get();

    for (const cardDoc of cardsSnap.docs) {
      totalChecked++;
      const data = cardDoc.data();
      if (data.spectrumType) {
        // Already migrated, skip
        continue;
      }
      // Legacy card — backfill as XRD (only existing type pre-R163-spectra-4c-1)
      await cardDoc.ref.update({
        spectrumType: 'xrd',
        updatedAt: Date.now()
      });
      totalMigrated++;
      console.log(`  ✓ ${tenantId}/${cardDoc.id}: backfilled spectrumType=xrd`);
    }
  }

  console.log(`\nMigration complete: ${totalMigrated}/${totalChecked} cards updated`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
