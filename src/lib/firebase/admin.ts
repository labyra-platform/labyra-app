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

/** Verify Firebase ID token from request header */
export async function verifyIdToken(token: string) {
  const auth = getAdminAuthService();
  return auth.verifyIdToken(token);
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
