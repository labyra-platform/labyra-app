/**
 * Firebase Client SDK (browser-side)
 *
 * Singleton pattern: app + services initialized once và reused.
 * Safe to import từ Server Components vì check 'undefined' window.
 */

import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth } from 'firebase/auth';
import { type Database, getDatabase } from 'firebase/database';
import { type Firestore, getFirestore } from 'firebase/firestore';
import { type FirebaseStorage, getStorage } from 'firebase/storage';

import { firebaseClientConfig, validateClientConfig } from './config';

// ─── Singleton app initialization ──────────────────────────────────
let _app: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error('getFirebaseApp() can only be called client-side');
  }

  if (_app) return _app;

  validateClientConfig();

  // Reuse existing app nếu đã initialize (HMR-safe)
  _app = getApps().length > 0 ? getApp() : initializeApp(firebaseClientConfig);
  return _app;
}

// ─── Service accessors (lazy-init) ─────────────────────────────────
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseDatabase(): Database {
  return getDatabase(getFirebaseApp());
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
