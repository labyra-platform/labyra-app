#!/usr/bin/env node
/**
 * Promote a Firebase Auth user to platform-level superadmin role.
 *
 * Usage:
 *   node --env-file=.env.local scripts/set-superadmin.mjs <uid>
 *   node --env-file=.env.local scripts/set-superadmin.mjs --email <email>
 *
 * Example:
 *   node --env-file=.env.local scripts/set-superadmin.mjs --email nvhn.7202@gmail.com
 *
 * After running, user must sign out + sign in (or wait ~1h for token refresh)
 * to see new claims. Or call refreshAuthClaims() client-side.
 *
 * @phase R172-1
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function loadAdminCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin env vars');
  }
  return { projectId, clientEmail, privateKey };
}

async function main() {
  const args = process.argv.slice(2);
  let uid = null;
  let email = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') email = args[++i];
    else if (!uid) uid = args[i];
  }

  if (!uid && !email) {
    console.error('Usage: node --env-file=.env.local scripts/set-superadmin.mjs <uid>');
    console.error('       node --env-file=.env.local scripts/set-superadmin.mjs --email <email>');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert(loadAdminCredentials()) });
  }

  const auth = getAuth();

  if (email) {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
    console.log(`Resolved email '${email}' → uid '${uid}'`);
  }

  const user = await auth.getUser(uid);
  const existing = user.customClaims ?? {};
  const previousRole = existing.role ?? '(unset)';

  await auth.setCustomUserClaims(uid, {
    ...existing,
    role: 'superadmin',
    superadminSince: Date.now()
  });

  console.log(`✓ User ${uid} (${user.email}): role ${previousRole} → superadmin`);
  console.log(`  User must sign out + sign in to see new claims.`);
  console.log(`  Or call refreshAuthClaims() client-side from a logged-in tab.`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
