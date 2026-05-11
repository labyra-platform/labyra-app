/**
 * Firebase Configuration
 *
 * Centralized env var access với runtime validation.
 * Client vars: NEXT_PUBLIC_* (exposed to browser bundle)
 * Server vars: no prefix (Node.js runtime only)
 */

// ─── Client-side config (browser) ─────────────────────────────────
export const firebaseClientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!
} as const;

// ─── Server-side config (Node.js only) ────────────────────────────
export const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
  // Note: private key trong .env.local có \n literal escaped
  // Cần replace lại thành actual newlines
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? ''
} as const;

// ─── Validation helpers ────────────────────────────────────────────
export function validateClientConfig(): void {
  const missing = Object.entries(firebaseClientConfig)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase client env vars: ${missing.join(', ')}.\n` +
        `Check .env.local has NEXT_PUBLIC_FIREBASE_* vars.`
    );
  }
}

export function validateAdminConfig(): void {
  const missing = Object.entries(firebaseAdminConfig)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase admin env vars: ${missing.join(', ')}.\n` +
        `Check .env.local has FIREBASE_ADMIN_* vars.`
    );
  }
}
