'use client';

/**
 * Client-side auth actions
 *
 * Wrappers around Firebase Auth client methods.
 * Used từ login/signup pages.
 */

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  GithubAuthProvider,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  type UserCredential
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

/** Sign in với email + password */
export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign in với Google popup */
export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  return signInWithPopup(auth, googleProvider);
}

/** Sign in với GitHub popup — requires the GitHub provider to be enabled in
 * Firebase Console (Authentication → Sign-in method → GitHub). */
export async function signInWithGithub(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  return signInWithPopup(auth, githubProvider);
}

/** Sign up email + password — sends a verification email immediately. */
export async function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // Email/password accounts start unverified. Verification is required before
  // accepting an invite (ownership proof for email-match onboarding).
  try {
    await sendEmailVerification(cred.user);
  } catch {
    // Non-fatal — user can resend from /onboarding.
  }
  return cred;
}

/** Resend the verification email to the current user. */
export async function resendVerificationEmail(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('not_authenticated');
  await sendEmailVerification(user);
}

/** Sign out current user */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}

/** Send password reset email */
export async function resetPassword(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email);
}

/**
 * Establish the server session cookie for a freshly signed-in user, awaiting
 * completion so callers can safely redirect to a protected route afterwards.
 * Without this the proxy may not see the cookie yet (race) and bounce back to
 * sign-in. Idempotent with the AuthProvider's onIdTokenChanged sync.
 */
export async function establishSession(cred: UserCredential): Promise<void> {
  const idToken = await cred.user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!res.ok) {
    throw new Error('session_failed');
  }
}
