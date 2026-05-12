'use client';

/**
 * Client hook v2 — handles conversationId persistence + title updates.
 * @phase R160-ai-2a
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import type { AiMessage, ChatStreamEventV2, AiCostBreakdown } from '@/types/ai';

export interface UseChatStreamResult {
  messages: AiMessage[];
  isStreaming: boolean;
  error: string | null;
  lastUsage: AiCostBreakdown | null;
  sessionUsage: AiCostBreakdown;
  conversationId: string | null;
  send: (text: string) => Promise<void>;
  reset: () => void;
  loadConversation: (messages: AiMessage[], conversationId: string) => void;
}

const ZERO_USAGE: AiCostBreakdown = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  usd: 0
};

function addUsage(a: AiCostBreakdown, b: AiCostBreakdown): AiCostBreakdown {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    usd: a.usd + b.usd
  };
}

export function useChatStream(): UseChatStreamResult {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<AiCostBreakdown | null>(null);
  const [sessionUsage, setSessionUsage] = useState<AiCostBreakdown>(ZERO_USAGE);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLastUsage(null);
    setSessionUsage(ZERO_USAGE);
    setConversationId(null);
    setIsStreaming(false);
  }, []);

  const loadConversation = useCallback((loadedMessages: AiMessage[], cid: string) => {
    setMessages(loadedMessages);
    setConversationId(cid);
    setSessionUsage(ZERO_USAGE);
    setLastUsage(null);
    setError(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      const userMsg: AiMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: Date.now()
      };

      const assistantMsg: AiMessage = {
        id: `pending-${Date.now()}`,
        role: 'assistant',
        content: '',
        createdAt: Date.now()
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      try {
        const user = getAuth().currentUser;
        if (!user) throw new Error('not_authenticated');
        const token = await user.getIdToken();

        const controller = new AbortController();
        abortRef.current = controller;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ message: text, conversationId }),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          const err = await response.text();
          throw new Error(err || `status_${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let realAssistantId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice('data: '.length);
            let event: ChatStreamEventV2;
            try {
              event = JSON.parse(json) as ChatStreamEventV2;
            } catch {
              continue;
            }

            if (event.type === 'conversation_init') {
              setConversationId(event.conversationId);
              if (event.isNew) {
                qc.invalidateQueries({ queryKey: ['aiConversations'] });
              }
            } else if (event.type === 'message_start') {
              realAssistantId = event.messageId;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, id: event.messageId } : m))
              );
            } else if (event.type === 'text_delta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === (realAssistantId ?? assistantMsg.id)
                    ? { ...m, content: m.content + event.delta }
                    : m
                )
              );
            } else if (event.type === 'tool_call') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === (realAssistantId ?? assistantMsg.id)
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []),
                          {
                            id: event.toolCallId,
                            name: event.toolName,
                            input: event.input
                          }
                        ]
                      }
                    : m
                )
              );
            } else if (event.type === 'tool_result') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === (realAssistantId ?? assistantMsg.id)
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((tc) =>
                          tc.id === event.toolCallId
                            ? { ...tc, result: event.result, isError: event.isError }
                            : tc
                        )
                      }
                    : m
                )
              );
            } else if (event.type === 'message_complete') {
              setLastUsage(event.usage);
              setSessionUsage((prev) => addUsage(prev, event.usage));
            } else if (event.type === 'title_update') {
              qc.invalidateQueries({ queryKey: ['aiConversations'] });
            } else if (event.type === 'error') {
              setError(event.message);
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error';
        setError(msg);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, conversationId, qc]
  );

  return {
    messages,
    isStreaming,
    error,
    lastUsage,
    sessionUsage,
    conversationId,
    send,
    reset,
    loadConversation
  };
}
