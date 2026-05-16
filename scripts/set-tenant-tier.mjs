#!/usr/bin/env node
/**
 * Set tenants/{tenantId}.tier field for Cost Guard (R170+).
 *
 * Usage:
 *   node --env-file=.env.local scripts/set-tenant-tier.mjs <tenantId> <tier>
 *
 * Examples:
 *   node --env-file=.env.local scripts/set-tenant-tier.mjs tenant-dev-001 enterprise
 *   node --env-file=.env.local scripts/set-tenant-tier.mjs tenant-dev-001 pro
 *
 * Valid tiers: 'free' | 'starter' | 'pro' | 'enterprise'
 *
 * @phase R171-1
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const VALID_TIERS = ['free', 'starter', 'pro', 'enterprise'];

function loadAdminCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin env vars. Required: FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY'
    );
  }

  return { projectId, clientEmail, privateKey };
}

async function main() {
  const [tenantId, tier] = process.argv.slice(2);

  if (!tenantId || !tier) {
    console.error('Usage: node --env-file=.env.local scripts/set-tenant-tier.mjs <tenantId> <tier>');
    console.error(`Valid tiers: ${VALID_TIERS.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_TIERS.includes(tier)) {
    console.error(`Invalid tier '${tier}'. Valid: ${VALID_TIERS.join(', ')}`);
    process.exit(1);
  }

  if (getApps().length === 0) {
    const creds = loadAdminCredentials();
    initializeApp({ credential: cert(creds) });
  }

  const db = getFirestore();
  const ref = db.doc(`tenants/${tenantId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    console.error(`Tenant '${tenantId}' does not exist. Create first via admin onboarding.`);
    process.exit(1);
  }

  const existing = snap.data();
  const previousTier = existing?.tier ?? '(unset)';

  await ref.update({
    tier,
    tierUpdatedAt: new Date().toISOString(),
    tierSource: 'r171-set-script'
  });

  console.log(`✓ tenants/${tenantId}.tier: ${previousTier} → ${tier}`);
  console.log(`  Tier limits now apply (see src/lib/ai/governance/cost-guard.ts COST_LIMITS).`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
