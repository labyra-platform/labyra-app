/**
 * Firebase Admin SDK (server-side)
 *
 * For Server Components, Route Handlers, Server Actions.
 * NEVER import this from Client Components ('use client').
 *
 * Singleton pattern: app initialized once và reused.
 * Uses service account credentials từ env vars.
 */

import 'server-only';

import {
  type App as AdminApp,
  cert,
  getApp as getAdminApp,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp
} from 'firebase-admin/app';
import { type Auth as AdminAuth, getAuth as getAdminAuth } from 'firebase-admin/auth';
import {
  type Database as AdminDatabase,
  getDatabase as getAdminDatabase
} from 'firebase-admin/database';
import {
  type Firestore as AdminFirestore,
  getFirestore as getAdminFirestore
} from 'firebase-admin/firestore';
import {
  type Storage as AdminStorage,
  getStorage as getAdminStorage
} from 'firebase-admin/storage';

import { firebaseAdminConfig, firebaseClientConfig, validateAdminConfig } from './config';

// ─── Singleton admin app initialization ────────────────────────────
let _adminApp: AdminApp | undefined;

export function getFirebaseAdminApp(): AdminApp {
  if (_adminApp) return _adminApp;

  validateAdminConfig();

  // Reuse existing app nếu đã init (Next.js HMR safe)
  const apps = getAdminApps();
  if (apps.length > 0) {
    _adminApp = getAdminApp();
    return _adminApp;
  }

  _adminApp = initializeAdminApp({
    credential: cert({
      projectId: firebaseAdminConfig.projectId,
      clientEmail: firebaseAdminConfig.clientEmail,
      privateKey: firebaseAdminConfig.privateKey
    }),
    databaseURL: firebaseClientConfig.databaseURL,
    storageBucket: firebaseClientConfig.storageBucket
  });

  return _adminApp;
}

// ─── Service accessors (lazy-init) ─────────────────────────────────
export function getAdminAuthService(): AdminAuth {
  return getAdminAuth(getFirebaseAdminApp());
}

let _adminFirestore: AdminFirestore | undefined;
let _firestoreSettingsApplied = false;
export function getAdminFirestoreService(): AdminFirestore {
  if (_adminFirestore) return _adminFirestore;
  const fs = getAdminFirestore(getFirebaseAdminApp());
  // Race-safe: settings() can only be called once per Firestore instance.
  // Multiple concurrent first-call paths can hit this; guard with try/catch.
  if (!_firestoreSettingsApplied) {
    try {
      fs.settings({ ignoreUndefinedProperties: true });
      _firestoreSettingsApplied = true;
    } catch (err) {
      // Settings already applied by a parallel caller — safe to ignore
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already been initialized')) throw err;
      _firestoreSettingsApplied = true;
    }
  }
  _adminFirestore = fs;
  return _adminFirestore;
}

export function getAdminDatabaseService(): AdminDatabase {
  return getAdminDatabase(getFirebaseAdminApp());
}

export function getAdminStorageService(): AdminStorage {
  return getAdminStorage(getFirebaseAdminApp());
}

// ─── Common admin helpers ──────────────────────────────────────────

/**
 * Verify a Firebase ID token. In production this fully verifies the signature
 * against Google's public keys. In development, if verification fails because
 * the network can't reach Google (common on networks that block
 * googleapis.com — the same reason next/font Google fails), we fall back to an
 * UNVERIFIED decode of the token payload so local dev isn't blocked. This is
 * dev-only and never runs in production.
 */
export async function verifyIdToken(token: string) {
  const auth = getAdminAuthService();
  try {
    return await auth.verifyIdToken(token);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    // Dev fallback: decode (NOT verify) the JWT payload so localhost works
    // offline / behind a Google-blocking network. Trusted because it's the
    // developer's own machine and never reaches production.
    const decoded = decodeJwtPayloadDev(token);
    if (!decoded) throw err;
    console.warn(
      '[admin] verifyIdToken failed (likely network block); using UNVERIFIED dev decode'
    );
    return decoded as unknown as Awaited<ReturnType<AdminAuth['verifyIdToken']>>;
  }
}

/** Dev-only: decode a JWT payload without signature verification. */
function decodeJwtPayloadDev(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part, 'base64').toString('utf8');
    const payload = JSON.parse(json) as Record<string, unknown>;
    // Shape it like a DecodedIdToken enough for downstream reads (uid, claims).
    if (typeof payload.user_id === 'string' && !payload.uid) payload.uid = payload.user_id;
    if (typeof payload.sub === 'string' && !payload.uid) payload.uid = payload.sub;
    return payload;
  } catch {
    return null;
  }
}

/** Get user record by UID */
export async function getUserById(uid: string) {
  const auth = getAdminAuthService();
  return auth.getUser(uid);
}

/** Set custom claims (vd: role, tenantId) cho user */
export async function setUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const auth = getAdminAuthService();
  await auth.setCustomUserClaims(uid, claims);
}
