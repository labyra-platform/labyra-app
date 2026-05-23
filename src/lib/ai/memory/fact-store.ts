/**
 * Fact store (ADR-035 M2, L2) — persist extracted facts with dedupe, supersede,
 * and a hard cap. Admin SDK; bypasses client rules.
 *
 * Q3 (ADR-035): MAX_FACTS_PER_USER = 200 hard technical cap (NOT a billing tier).
 * Eviction is NOT FIFO — it protects high-value, verified, high-confidence facts.
 * Q5 (ADR-035): every fact write is audited to aiProvenance-style audit log.
 *
 * Path: tenants/{tid}/userMemories/{uid}/facts/{factId}
 *
 * @phase R193-mem-m2
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { UserFact } from '@/types/memory';
import { HIGH_VALUE_SUBJECTS, type FactSubject } from './fact-taxonomy';
import type { ExtractedFact } from './fact-extractor';

/** Q3: hard technical cap. Tier-based caps (billing) layer on top later. */
export const MAX_FACTS_PER_USER = 200;

function factsCol(tenantId: string, uid: string) {
  return getAdminFirestoreService().collection(`tenants/${tenantId}/userMemories/${uid}/facts`);
}

function auditCol(tenantId: string) {
  return getAdminFirestoreService().collection(`tenants/${tenantId}/auditLogs`);
}

/**
 * Pure: given current (non-superseded) facts and how many slots must be freed,
 * pick which facts to evict. Protects verified facts and HIGH_VALUE_SUBJECTS;
 * evicts lowest-confidence, oldest, unverified, non-high-value first.
 *
 * Exported for unit testing.
 */
export function selectEvictions(
  facts: Array<Pick<UserFact, 'id' | 'subject' | 'confidence' | 'extractedAt' | 'verifiedAt'>>,
  slotsToFree: number
): string[] {
  if (slotsToFree <= 0) return [];
  const evictable = facts
    .filter((f) => f.verifiedAt == null) // never auto-evict user-confirmed facts
    .filter((f) => !HIGH_VALUE_SUBJECTS.has(f.subject as FactSubject))
    .toSorted((a, b) => {
      // lowest confidence first; tie-break oldest first
      if (a.confidence !== b.confidence) return a.confidence - b.confidence;
      return a.extractedAt - b.extractedAt;
    });
  return evictable.slice(0, slotsToFree).map((f) => f.id);
}

interface CurrentFact {
  id: string;
  subject: string;
  confidence: number;
  extractedAt: number;
  verifiedAt: number | null;
  supersededBy: string | null;
}

/**
 * Upsert extracted facts for a user. For each candidate:
 *  - if a current (non-superseded) fact with the SAME subject exists, mark it
 *    superseded and write the new one (correction/update);
 *  - else create new.
 * Then enforce the cap via selectEvictions. Audits each write (Q5).
 */
export async function upsertFacts(opts: {
  tenantId: string;
  uid: string;
  conversationId: string;
  sourceMessageId: string;
  facts: ExtractedFact[];
}): Promise<{ written: number; superseded: number; evicted: number }> {
  if (opts.facts.length === 0) return { written: 0, superseded: 0, evicted: 0 };

  const col = factsCol(opts.tenantId, opts.uid);
  const now = Date.now();

  // Load current (non-superseded) facts.
  const snap = await col
    .where('supersededBy', '==', null)
    .limit(MAX_FACTS_PER_USER + 50)
    .get();
  const current: CurrentFact[] = snap.docs.map((d) => {
    const data = d.data() as UserFact;
    return {
      id: d.id,
      subject: data.subject,
      confidence: data.confidence,
      extractedAt: data.extractedAt,
      verifiedAt: data.verifiedAt ?? null,
      supersededBy: data.supersededBy ?? null
    };
  });

  const bySubject = new Map<string, CurrentFact>();
  for (const f of current) if (!bySubject.has(f.subject)) bySubject.set(f.subject, f);

  const db = getAdminFirestoreService();
  const batch = db.batch();
  let written = 0;
  let superseded = 0;
  const newDocsForCap: CurrentFact[] = [];

  for (const cand of opts.facts) {
    const ref = col.doc();
    const fact: UserFact = {
      id: ref.id,
      subject: cand.subject,
      object: cand.object,
      confidence: cand.confidence,
      sourceMessageId: opts.sourceMessageId,
      sourceQuote: cand.sourceQuote,
      extractedAt: now,
      verifiedAt: null,
      supersededBy: null
    };
    batch.set(ref, JSON.parse(JSON.stringify(fact)));
    written++;
    newDocsForCap.push({
      id: ref.id,
      subject: cand.subject,
      confidence: cand.confidence,
      extractedAt: now,
      verifiedAt: null,
      supersededBy: null
    });

    // Supersede an existing same-subject fact (correction/update).
    const prior = bySubject.get(cand.subject);
    if (prior) {
      batch.update(col.doc(prior.id), { supersededBy: ref.id });
      superseded++;
    }

    // Q5: audit each fact write.
    batch.set(auditCol(opts.tenantId).doc(), {
      event: 'memory.fact_extracted',
      userId: opts.uid,
      factId: ref.id,
      subject: cand.subject,
      confidence: cand.confidence,
      sourceMessageId: opts.sourceMessageId,
      conversationId: opts.conversationId,
      at: now
    });
  }

  // Enforce cap on the projected set of live facts (current minus superseded plus new).
  const supersededIds = new Set<string>();
  for (const cand of opts.facts) {
    const prior = bySubject.get(cand.subject);
    if (prior) supersededIds.add(prior.id);
  }
  const projectedLive = current.filter((f) => !supersededIds.has(f.id)).concat(newDocsForCap);

  let evicted = 0;
  if (projectedLive.length > MAX_FACTS_PER_USER) {
    const evictIds = selectEvictions(projectedLive, projectedLive.length - MAX_FACTS_PER_USER);
    for (const id of evictIds) {
      batch.delete(col.doc(id));
      evicted++;
    }
  }

  await batch.commit();
  return { written, superseded, evicted };
}

/** Load current (non-superseded) facts for retrieval/injection. */
export async function loadCurrentFacts(
  tenantId: string,
  uid: string,
  limit = 50
): Promise<UserFact[]> {
  const snap = await factsCol(tenantId, uid).where('supersededBy', '==', null).limit(limit).get();
  return snap.docs.map((d) => ({ ...(d.data() as UserFact), id: d.id }));
}

/** Delete a single fact (user-initiated, trust/GDPR). */
export async function deleteFact(tenantId: string, uid: string, factId: string): Promise<void> {
  await factsCol(tenantId, uid).doc(factId).delete();
  await auditCol(tenantId)
    .doc()
    .set({ event: 'memory.fact_deleted', userId: uid, factId, at: Date.now() });
}
