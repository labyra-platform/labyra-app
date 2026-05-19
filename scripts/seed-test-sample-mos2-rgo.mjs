/**
 * Seed test sample for R185 E2E validation.
 *
 * Creates a MoS2/rGO heterostructure sample with composition declared.
 * Run manually via the UI is also fine — this script is for repeatable testing.
 *
 * Usage:
 *   node scripts/seed-test-sample-mos2-rgo.mjs <tenantId> <userToken>
 *
 * Where:
 *   tenantId   — your dev tenant ID (e.g. tenant-dev-001)
 *   userToken  — Firebase ID token (from Console Snippets)
 *
 * @phase R185-validation
 */

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function main() {
  const [, , tenantId, token] = process.argv;
  if (!tenantId || !token) {
    console.error('Usage: node seed-test-sample-mos2-rgo.mjs <tenantId> <userToken>');
    process.exit(1);
  }

  const payload = {
    sampleCode: 'MOS2-RGO-001',
    name: 'MoS2/rGO composite test',
    description: 'R185 E2E validation sample',
    parentMaterialIds: [],
    preparedAt: Date.now(),
    preparedBy: 'test',
    workflowStatus: 'prepared',
    composition: [
      { formula: 'MoS2', role: 'matrix', nominalFraction: 0.7 },
      { formula: 'C', role: 'support', nominalFraction: 0.3 },
    ],
    compositeType: 'heterostructure',
  };

  const res = await fetch(`${APP_URL}/api/samples`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error('Seed failed:', res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log('Seeded:', data.id);
  console.log('Next: upload Raman + XRD measurements for this sample');
  console.log(`App URL: ${APP_URL}/en/dashboard/samples/${data.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
