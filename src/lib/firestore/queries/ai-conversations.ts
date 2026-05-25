'use client';

/**
 * AI conversation Firestore queries — TanStack Query hooks.
 * Tenant-scoped via useTenantId().
 * @phase R160-ai-2a
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  type DocumentSnapshot,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as limitQ,
  orderBy,
  query
} from 'firebase/firestore';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import type { AiConversation, AiMessage } from '@/types/ai';

function db() {
  return getFirebaseFirestore();
}

/**
 * R245 (audit L4): coerce a Firestore timestamp field to epoch ms. Handles
 * both Timestamp (admin/client `.toMillis()`) and legacy docs that stored a
 * plain number — so a numeric timestamp sorts correctly instead of silently
 * falling back to Date.now() (which scrambled ordering of legacy docs).
 */
function tsToMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === 'number') return v;
  return Date.now();
}

function conversationFromSnapshot(snap: DocumentSnapshot): AiConversation {
  const d = snap.data();
  return {
    id: snap.id,
    title: d?.title ?? 'Untitled',
    userId: d?.userId ?? '',
    createdAt: tsToMillis(d?.createdAt),
    updatedAt: tsToMillis(d?.updatedAt),
    messageCount: d?.messageCount ?? 0,
    totalCost: d?.totalCost ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      usd: 0
    },
    // R178-2b: papers user selected to scope RAG retrieval
    selectedPaperIds: Array.isArray(d?.selectedPaperIds) ? d.selectedPaperIds : []
  };
}

function messageFromSnapshot(snap: DocumentSnapshot): AiMessage {
  const d = snap.data();
  const tier = d?.tier;
  const toolCalls = Array.isArray(d?.toolCalls) ? d.toolCalls : undefined;
  return {
    id: snap.id,
    role: d?.role ?? 'assistant',
    content: d?.content ?? '',
    createdAt: tsToMillis(d?.createdAt),
    ...(tier === 1 || tier === 2 || tier === 3 ? { tier } : {}),
    ...(toolCalls ? { toolCalls } : {})
  };
}

/** List conversations for current tenant, ordered by updatedAt desc */
export function useConversations(maxResults = 50) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['aiConversations', tenantId, maxResults],
    enabled: !!tenantId,
    queryFn: async () => {
      const q = query(
        collection(db(), `tenants/${tenantId}/aiConversations`),
        orderBy('updatedAt', 'desc'),
        limitQ(maxResults)
      );
      const snap = await getDocs(q);
      return snap.docs.map(conversationFromSnapshot);
    }
  });
}

/** Get messages for a specific conversation, ordered by createdAt asc */
export function useConversationMessages(conversationId: string | null) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['aiMessages', tenantId, conversationId],
    enabled: !!tenantId && !!conversationId,
    queryFn: async () => {
      if (!conversationId) return [];
      const q = query(
        collection(db(), `tenants/${tenantId}/aiConversations/${conversationId}/messages`),
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(messageFromSnapshot);
    }
  });
}

/** Get a single conversation by id */
export function useConversation(conversationId: string | null) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['aiConversation', tenantId, conversationId],
    enabled: !!tenantId && !!conversationId,
    queryFn: async () => {
      if (!conversationId) return null;
      const ref = doc(db(), `tenants/${tenantId}/aiConversations/${conversationId}`);
      const snap = await getDoc(ref);
      return snap.exists() ? conversationFromSnapshot(snap) : null;
    }
  });
}

/** Delete a conversation + all its messages (client-side recursive) */
/** Hard delete from Firestore (used after Undo window expires) */
async function hardDeleteConversation(tenantId: string, conversationId: string): Promise<void> {
  const msgsQ = query(
    collection(db(), `tenants/${tenantId}/aiConversations/${conversationId}/messages`)
  );
  const msgsSnap = await getDocs(msgsQ);
  await Promise.all(msgsSnap.docs.map((m) => deleteDoc(m.ref)));
  await deleteDoc(doc(db(), `tenants/${tenantId}/aiConversations/${conversationId}`));
}

export function useDeleteConversation() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!tenantId) throw new Error('no_tenant');
      await hardDeleteConversation(tenantId, conversationId);
    },
    onMutate: async (conversationId: string) => {
      await qc.cancelQueries({ queryKey: ['aiConversations'] });
      const snapshot = qc.getQueriesData<unknown[]>({
        queryKey: ['aiConversations']
      });
      snapshot.forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        qc.setQueryData(
          key,
          data.filter(
            (c) =>
              typeof c === 'object' &&
              c !== null &&
              'id' in c &&
              (c as { id: string }).id !== conversationId
          )
        );
      });
      return { snapshot };
    },
    onError: (_err, _conversationId, context) => {
      context?.snapshot.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['aiConversations'] });
    }
  });
}

/** Restore conversation back into cache (used by Undo). Doesn't touch Firestore. */
export function useRestoreConversationCache() {
  const qc = useQueryClient();
  return (conversation: AiConversation) => {
    qc.setQueriesData<AiConversation[] | undefined>({ queryKey: ['aiConversations'] }, (old) => {
      if (!Array.isArray(old)) return old;
      if (old.some((c) => c.id === conversation.id)) return old;
      // Insert sorted by updatedAt desc
      return [...old, conversation].toSorted((a, b) => b.updatedAt - a.updatedAt);
    });
  };
}
