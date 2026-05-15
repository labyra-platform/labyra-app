import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const creds = {
  type: 'service_account',
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(creds) });

const UID = process.argv[2];
const TENANT_ID = 'tenant-dev-001';

if (!UID) { console.error('Usage: node _set-tenant-claim.mjs <UID>'); process.exit(1); }

const auth = getAuth();
const user = await auth.getUser(UID);
const currentClaims = user.customClaims ?? {};
console.log('Current claims:', JSON.stringify(currentClaims));
await auth.setCustomUserClaims(UID, {
  ...currentClaims,
  tenantId: TENANT_ID
});
console.log(`✓ Set tenantId=${TENANT_ID} for ${user.email}`);
console.log('IMPORTANT: logout + login again to refresh token');
