#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Labyra dev tenant seed script
 * ──────────────────────────────
 * Creates /tenants/tenant-dev-001 with 5 sub-collections of mock data,
 * and (optionally) sets custom claims on a Firebase Auth user by email.
 *
 * Usage:
 *   node scripts/seed-dev-tenant.mjs --email=you@gmail.com
 *   node scripts/seed-dev-tenant.mjs --email=you@gmail.com --claims-only
 *
 * Idempotent: deterministic IDs, so re-running overwrites existing docs.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Constants ──────────────────────────────────────────────────────
const TENANT_ID = 'tenant-dev-001';
const TENANT_NAME = 'Labyra Dev Lab';

// ─── Args ───────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [arg, true];
  })
);

const userEmail = args.email;
const claimsOnly = !!args['claims-only'];

if (!userEmail || typeof userEmail !== 'string') {
  console.error('Error: --email=<address> is required');
  console.error('Usage: node scripts/seed-dev-tenant.mjs --email=you@gmail.com');
  process.exit(1);
}


// ─── Initialize Admin SDK ───────────────────────────────────────────
function initAdmin() {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing FIREBASE_ADMIN_* env vars in .env.local');
    process.exit(1);
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey })
  });
}

initAdmin();
const db = getFirestore();
const auth = getAuth();

// ─── Mock data generators ───────────────────────────────────────────
// Deterministic IDs → re-runnable, no duplicates.

const now = Timestamp.fromDate(new Date('2026-05-01T00:00:00Z'));

const materials = Array.from({ length: 10 }, (_, i) => ({
  id: `mat-${String(i + 1).padStart(3, '0')}`,
  name: [
    'Tungsten Trioxide',
    'Molybdenum Disulfide',
    'Titanium Dioxide',
    'Zinc Oxide',
    'Iron Oxide',
    'Copper Oxide',
    'Nickel Oxide',
    'Cobalt Oxide',
    'Manganese Dioxide',
    'Vanadium Pentoxide'
  ][i],
  formula: ['WO₃', 'MoS₂', 'TiO₂', 'ZnO', 'Fe₂O₃', 'CuO', 'NiO', 'Co₃O₄', 'MnO₂', 'V₂O₅'][i],
  category: i < 3 ? 'transition-metal-oxide' : i < 6 ? 'metal-oxide' : 'oxide',
  bandgap_eV: [2.8, 1.8, 3.2, 3.37, 2.2, 1.4, 3.6, 2.07, 1.3, 2.3][i],
  createdAt: now,
  createdBy: userEmail
}));

const samples = Array.from({ length: 10 }, (_, i) => ({
  id: `smp-${String(i + 1).padStart(3, '0')}`,
  code: `SMP-2026-${String(i + 1).padStart(4, '0')}`,
  materialId: materials[i % materials.length].id,
  mass_g: Number((0.5 + Math.random() * 4.5).toFixed(3)),
  preparation: ['hydrothermal', 'sol-gel', 'sputtering', 'CVD', 'spin-coating'][i % 5],
  createdAt: now,
  createdBy: userEmail
}));

const experiments = Array.from({ length: 10 }, (_, i) => ({
  id: `exp-${String(i + 1).padStart(3, '0')}`,
  title: [
    'WO₃ electrochromic switching',
    'MoS₂ Raman characterization',
    'TiO₂ photocatalytic degradation',
    'ZnO UV photoresponse',
    'Fe₂O₃ water splitting',
    'CuO cyclic voltammetry',
    'NiO supercapacitor test',
    'Co₃O₄ XRD scan',
    'MnO₂ battery cycling',
    'V₂O₅ thin film deposition'
  ][i],
  status: i < 5 ? 'completed' : i < 8 ? 'running' : 'planned',
  sampleIds: [samples[i].id, samples[(i + 1) % 10].id],
  temperature_C: 25 + i * 15,
  startedAt: now,
  completedAt: i < 5 ? now : null,
  createdBy: userEmail
}));

const chemicals = Array.from({ length: 10 }, (_, i) => ({
  id: `chem-${String(i + 1).padStart(3, '0')}`,
  name: [
    'Ethanol',
    'Acetone',
    'Hydrochloric Acid',
    'Sodium Hydroxide',
    'Sulfuric Acid',
    'Nitric Acid',
    'Methanol',
    'Isopropanol',
    'Hydrogen Peroxide',
    'Ammonia Solution'
  ][i],
  formula: ['C₂H₆O', 'C₃H₆O', 'HCl', 'NaOH', 'H₂SO₄', 'HNO₃', 'CH₃OH', 'C₃H₈O', 'H₂O₂', 'NH₃'][i],
  stockGrams: Math.floor(100 + Math.random() * 900),
  hazard: i < 4 ? 'low' : i < 7 ? 'medium' : 'high',
  location: `Cabinet ${String.fromCharCode(65 + (i % 4))}`,
  createdAt: now
}));

const equipment = Array.from({ length: 10 }, (_, i) => ({
  id: `eq-${String(i + 1).padStart(3, '0')}`,
  name: [
    'Bruker D8 XRD',
    'Hitachi SU8230 SEM',
    'JEOL JEM-2100 TEM',
    'Renishaw inVia Raman',
    'Bruker Tensor 27 FTIR',
    'CHI 660E Potentiostat',
    'Agilent Cary 5000 UV-Vis',
    'Mettler TGA/DSC',
    'Quantachrome BET',
    'Edwards E306 Evaporator'
  ][i],
  type: i < 3 ? 'microscopy' : i < 6 ? 'spectroscopy' : 'analysis',
  status: i % 3 === 0 ? 'available' : i % 3 === 1 ? 'in-use' : 'maintenance',
  location: `Room ${201 + (i % 5)}`,
  createdAt: now
}));

// ─── Tenant doc + sub-collections ───────────────────────────────────
async function seedTenant() {
  console.log(`\n→ Seeding tenant: ${TENANT_ID}`);

  // Tenant root doc
  await db.collection('tenants').doc(TENANT_ID).set({
    name: TENANT_NAME,
    plan: 'dev',
    createdAt: now,
    createdBy: userEmail
  });
  console.log(`  ✓ /tenants/${TENANT_ID}`);

  // Sub-collections
  const collections = [
    ['materials', materials],
    ['samples', samples],
    ['experiments', experiments],
    ['chemicals', chemicals],
    ['equipment', equipment]
  ];

  for (const [name, docs] of collections) {
    const colRef = db.collection(`tenants/${TENANT_ID}/${name}`);
    // Use batch for efficiency (max 500 ops, we have 10)
    const batch = db.batch();
    for (const doc of docs) {
      const { id, ...data } = doc;
      batch.set(colRef.doc(id), data);
    }
    await batch.commit();
    console.log(`  ✓ /tenants/${TENANT_ID}/${name}/  (${docs.length} docs)`);
  }
}

// ─── Auth custom claims ─────────────────────────────────────────────
async function setClaims() {
  console.log(`\n→ Setting custom claims for ${userEmail}`);

  let user;
  try {
    user = await auth.getUserByEmail(userEmail);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.error(`  ✗ User ${userEmail} not found in Firebase Auth.`);
      console.error('    Sign in via the app first, then re-run.');
      process.exit(1);
    }
    throw err;
  }

  await auth.setCustomUserClaims(user.uid, {
    tenantId: TENANT_ID,
    role: 'admin'
  });
  console.log(`  ✓ Claims set: { tenantId: '${TENANT_ID}', role: 'admin' }`);
  console.log(`  ℹ User must sign out + sign in again for claims to refresh.`);
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  if (!claimsOnly) {
    await seedTenant();
  }
  await setClaims();
  console.log('\n✓ Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Seed failed:', err);
  process.exit(1);
});
