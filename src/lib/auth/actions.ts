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

  /**
   * R563: clear the server session *before* returning.
   *
   * The provider does clear it — onIdTokenChanged fires with a null user and
   * DELETEs the cookie. I first wrote that nobody called the route and was
   * wrong; the caller exists. The bug is that it races.
   *
   * signOut resolved as soon as firebaseSignOut did, and the listener ran
   * afterwards, asynchronously. Callers await signOut and navigate straight
   * away (app-sidebar, nav-user), so the DELETE is still in flight when the
   * page changes — and may die with it. The Firebase session ends; the
   * HttpOnly cookie that src/proxy.ts actually reads survives. Sign-out ends
   * the session the client can see and leaves the one the server acts on.
   *
   * Awaiting it here makes the guarantee the callers already assume. The
   * listener's DELETE stays as the path for sign-outs this function does not
   * originate (token revoked, another tab); a second DELETE is harmless.
   *
   * Nam found it from the right clue: incognito was unaffected, because
   * incognito had no cookie to inherit.
   *
   * Failure throws rather than being swallowed. A logout that reports success
   * while the server session stands is precisely the bug being fixed.
   */
  const res = await fetch('/api/auth/session', { method: 'DELETE' });
  if (!res.ok) throw new Error('signout_session_clear_failed');
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
