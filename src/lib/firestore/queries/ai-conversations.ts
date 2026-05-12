'use client';

/**
 * AI conversation Firestore queries — TanStack Query hooks.
 * Tenant-scoped via useTenantId().
 * @phase R160-ai-2a
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  query,
  orderBy,
  limit as limitQ,
  getDocs,
  getDoc,
  deleteDoc,
  type DocumentSnapshot
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { useTenantId } from '@/lib/auth/use-claims';
import type { AiConversation, AiMessage } from '@/types/ai';

function db() {
  return getFirebaseFirestore();
}

function conversationFromSnapshot(snap: DocumentSnapshot): AiConversation {
  const d = snap.data();
  return {
    id: snap.id,
    title: d?.title ?? 'Untitled',
    userId: d?.userId ?? '',
    createdAt: d?.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: d?.updatedAt?.toMillis?.() ?? Date.now(),
    messageCount: d?.messageCount ?? 0,
    totalCost: d?.totalCost ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      usd: 0
    }
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
    createdAt: d?.createdAt?.toMillis?.() ?? Date.now(),
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
export function useDeleteConversation() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!tenantId) throw new Error('no_tenant');
      // Delete all messages first
      const msgsQ = query(
        collection(db(), `tenants/${tenantId}/aiConversations/${conversationId}/messages`)
      );
      const msgsSnap = await getDocs(msgsQ);
      await Promise.all(msgsSnap.docs.map((m) => deleteDoc(m.ref)));
      // Then delete the conversation doc
      await deleteDoc(doc(db(), `tenants/${tenantId}/aiConversations/${conversationId}`));
    },
    // Optimistic update — remove from cache immediately
    onMutate: async (conversationId: string) => {
      // Cancel ongoing refetches so they don't overwrite optimistic update
      await qc.cancelQueries({ queryKey: ['aiConversations'] });

      // Snapshot all conversation-list query caches (any maxResults variant)
      const snapshot = qc.getQueriesData<unknown[]>({
        queryKey: ['aiConversations']
      });

      // Optimistically remove from all matching caches
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

      // Return snapshot for rollback
      return { snapshot };
    },
    onError: (_err, _conversationId, context) => {
      // Rollback: restore each cached query
      context?.snapshot.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
    },
    onSettled: () => {
      // Final reconciliation with server
      qc.invalidateQueries({ queryKey: ['aiConversations'] });
    }
  });
}
