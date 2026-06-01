'use client';

import {
  collection,
  type DocumentSnapshot,
  doc,
  onSnapshot,
  orderBy,
  query
} from 'firebase/firestore';
/**
 * Client-side Firestore queries for papers.
 * Uses TanStack Query with Firestore realtime listeners.
 * @phase R160-ai-5b-1
 */
import { useEffect, useState } from 'react';
import { useGroupId, useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { MonthlyUsage, Paper } from '@/types/papers';

function paperFromSnapshot(snap: DocumentSnapshot): Paper | null {
  if (!snap.exists()) return null;
  return snap.data() as Paper;
}

/** Realtime listener for all papers in current tenant, sorted by uploadedAt desc. */
export function usePapers() {
  const tenantId = useTenantId();
  const groupId = useGroupId();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = query(collection(db(), `tenants/${tenantId}/papers`), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPapers(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }) as Paper)
            .filter((p) => !p.lifecycleStatus || p.lifecycleStatus === 'active')
            // ADR-034 TEAM-4: group-scoped KB isolation. A user sees papers in
            // their own group plus tenant-wide shared papers ('lab-shared').
            // Papers missing groupId (pre-migration) are treated as shared so
            // they never vanish before the backfill runs.
            .filter(
              (p) =>
                !p.groupId ||
                p.groupId === 'lab-shared' ||
                (groupId !== null && p.groupId === groupId)
            )
        );
        setLoading(false);
      },
      (err) => {
        console.error('usePapers listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, groupId]);

  return { papers, loading };
}

/** Realtime listener for a single paper. */
export function usePaper(paperId: string | null) {
  const tenantId = useTenantId();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !paperId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/papers/${paperId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setPaper(paperFromSnapshot(snap));
        setLoading(false);
      },
      (err) => {
        console.error('usePaper listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId, paperId]);

  return { paper, loading };
}

/** Current-month usage for tenant. */
export function useMonthlyUsage() {
  const tenantId = useTenantId();
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const yearMonth = (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    setLoading(true);
    const ref = doc(db(), `tenants/${tenantId}/usage/${yearMonth}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setUsage(snap.exists() ? (snap.data() as MonthlyUsage) : null);
        setLoading(false);
      },
      (err) => {
        console.error('useMonthlyUsage listener error', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  return { usage, loading };
}

export interface Pretranslation {
  abstract?: string;
  conclusion?: string;
  headings?: Record<string, string>;
  sourceLanguage?: string;
  targetLanguage?: string;
}

/** Realtime listener for a paper's pre-translated sections in `lang` (Lớp 1).
 *  Returns null when none exist (e.g. en→en skip, or ineligible paper). */
export function usePretranslation(paperId: string | null, lang: string | null) {
  const tenantId = useTenantId();
  const [pretranslation, setPretranslation] = useState<Pretranslation | null>(null);

  useEffect(() => {
    if (!tenantId || !paperId || !lang) {
      setPretranslation(null);
      return;
    }
    const ref = doc(db(), `tenants/${tenantId}/papers/${paperId}/pretranslations/${lang}`);
    const unsub = onSnapshot(
      ref,
      (snap) => setPretranslation(snap.exists() ? (snap.data() as Pretranslation) : null),
      (err) => {
        console.error('usePretranslation listener error', err);
        setPretranslation(null);
      }
    );
    return () => unsub();
  }, [tenantId, paperId, lang]);

  return pretranslation;
}
