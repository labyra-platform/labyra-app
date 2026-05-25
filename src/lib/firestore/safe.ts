/**
 * Firestore read-boundary validation (audit Option B, R244).
 *
 * Parse a document snapshot through a Zod schema at the data boundary so that
 * a malformed / legacy / partial doc is logged and handled deterministically
 * instead of crashing render deep in a component (the R192/R239 crash class).
 *
 * Two intended schema styles:
 *  - LENIENT schema (per-field `.catch(...)`, `.default(...)`): the doc almost
 *    always parses; bad fields are coerced to safe values so the row STAYS
 *    visible (critical while data is mid-migration — e.g. legacy Material
 *    categories must remain editable, not vanish). safeDoc returns the row.
 *  - STRICT schema: a genuinely invalid doc fails parse; safeDoc logs + returns
 *    null so the caller can skip it. Use only when a bad doc is truly unusable.
 *
 * The doc id is injected before parsing (so schemas can require `id: string`).
 *
 * @phase R244-zod-boundary
 */
import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import type { z } from 'zod';
import { logger } from '@/lib/logger';

type AnySnapshot = DocumentSnapshot | QueryDocumentSnapshot;

/**
 * Parse one snapshot through `schema`. Returns the typed value, or null if the
 * doc does not exist or fails validation (logged as `firestore_schema_drift`).
 */
export function safeDoc<S extends z.ZodTypeAny>(
  snap: AnySnapshot,
  schema: S,
  collectionLabel?: string
): z.infer<S> | null {
  if (!snap.exists()) return null;
  const result = schema.safeParse({ ...snap.data(), id: snap.id });
  if (!result.success) {
    logger.warn('firestore_schema_drift', {
      id: snap.id,
      collection: collectionLabel,
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`)
    });
    return null;
  }
  return result.data;
}

/**
 * Parse an array of snapshots; drops (and logs) any that fail validation.
 * With a lenient schema this drops effectively nothing.
 */
export function safeDocs<S extends z.ZodTypeAny>(
  snaps: readonly AnySnapshot[],
  schema: S,
  collectionLabel?: string
): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const snap of snaps) {
    const parsed = safeDoc(snap, schema, collectionLabel);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}
