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
  cert,
  getApps as getAdminApps,
  getApp as getAdminApp,
  initializeApp as initializeAdminApp,
  type App as AdminApp
} from 'firebase-admin/app';
import { getAuth as getAdminAuth, type Auth as AdminAuth } from 'firebase-admin/auth';
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore
} from 'firebase-admin/firestore';
import {
  getDatabase as getAdminDatabase,
  type Database as AdminDatabase
} from 'firebase-admin/database';
import {
  getStorage as getAdminStorage,
  type Storage as AdminStorage
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

export function getAdminFirestoreService(): AdminFirestore {
  return getAdminFirestore(getFirebaseAdminApp());
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
