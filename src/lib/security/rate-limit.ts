import 'server-only';

/**
 * Per-key rate limiter backed by Firestore.
 *
 * Stage 1 implementation per docs/labyra-strategy.md — single source of truth
 * across serverless instances without adding Redis/Upstash dependency.
 *
 * Counter document path: _rate_limits/{key}
 *   Fields: { count: number, windowStart: number, expiresAt: Timestamp }
 *   expiresAt drives Firestore TTL cleanup (~24h grace), no manual GC.
 *
 * Concurrency: uses Firestore transaction to read+increment atomically.
 * Trade-off: each rate-limit check = 1 Firestore tx (~20ms).
 *
 * Stage 2 migration (triggered at 20+ labs OR specific abuse incident):
 *   Replace implementation with @upstash/ratelimit while keeping the
 *   checkRateLimit() signature stable. No route changes needed.
 *
 * @phase R162-security
 */
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

const COLLECTION = '_rate_limits';

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Current count in this window. */
  current: number;
  /** Max requests per window. */
  limit: number;
  /** Seconds until the window resets. */
  resetSec: number;
}

/**
 * Atomically check + increment a rate limit counter.
 *
 * @param key       Unique key (e.g. `reanalyze:${tenantId}`). Must be filesystem-safe.
 * @param limit     Max requests allowed per window.
 * @param windowSec Window size in seconds.
 * @returns         Result with `allowed` flag + diagnostic fields.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const db = getAdminFirestoreService();
  const ref = db.collection(COLLECTION).doc(sanitizeKey(key));
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as
      | { count?: number; windowStart?: number; expiresAt?: Timestamp }
      | undefined;

    let count = 1;
    if (data && data.windowStart === windowStart) {
      count = (data.count ?? 0) + 1;
    }

    const expiresAt = Timestamp.fromMillis(windowStart + windowSec * 1000 + 60_000);
    const resetSec = Math.max(1, Math.ceil((windowStart + windowSec * 1000 - now) / 1000));

    if (count > limit) {
      // Do NOT increment past limit (saves writes during attack)
      return { allowed: false, current: data?.count ?? limit, limit, resetSec };
    }

    tx.set(ref, { count, windowStart, expiresAt });
    return { allowed: true, current: count, limit, resetSec };
  });
}

/**
 * Convenience: build a key from action + identifier (tenant or IP).
 */
export function rateLimitKey(action: string, identifier: string): string {
  return `${action}:${identifier}`;
}

function sanitizeKey(key: string): string {
  // Firestore doc ID: no '/' or whitespace; cap length 1500 bytes.
  return key.replace(/[/\s]/g, '_').slice(0, 1500);
}
