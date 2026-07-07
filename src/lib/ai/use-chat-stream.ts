'use client';

import { useQueryClient } from '@tanstack/react-query';
import { getFirebaseAuth } from '@/lib/firebase/client';
/**
 * Client hook v2 — handles conversationId persistence + title updates.
 * @phase R160-ai-2a
 */
import { useCallback, useRef, useState } from 'react';
import type { AiCostBreakdown, AiMessage, ChatAttachment, ChatStreamEventV2 } from '@/types/ai';

export interface UseChatStreamResult {
  messages: AiMessage[];
  isStreaming: boolean;
  error: string | null;
  lastUsage: AiCostBreakdown | null;
  sessionUsage: AiCostBreakdown;
  conversationId: string | null;
  send: (text: string, files?: File[]) => Promise<void>;
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
    async (text: string, files: File[] = []) => {
      if ((!text.trim() && files.length === 0) || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      // ADR-036: ensure a conversationId BEFORE uploading attachments
      // (route get-or-creates by this id; upload path needs it).
      let convId = conversationId;
      if (files.length > 0 && !convId) {
        convId = crypto.randomUUID();
        setConversationId(convId);
      }

      // ADR-036: upload images via signed URL, collect refs.
      const attachments: ChatAttachment[] = [];
      const previewUrls: string[] = [];
      try {
        if (files.length > 0 && convId) {
          const authUser = getFirebaseAuth().currentUser;
          if (!authUser) throw new Error('not_authenticated');
          const tok = await authUser.getIdToken();
          for (const file of files) {
            const sigRes = await fetch('/api/chat/attachment-url', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
              body: JSON.stringify({
                conversationId: convId,
                contentType: file.type,
                sizeBytes: file.size,
                name: file.name
              })
            });
            if (!sigRes.ok) throw new Error(`attachment_upload_failed_${sigRes.status}`);
            const { signedUploadUrl, storagePath } = (await sigRes.json()) as {
              signedUploadUrl: string;
              storagePath: string;
            };
            const put = await fetch(signedUploadUrl, {
              method: 'PUT',
              headers: { 'content-type': file.type },
              body: file
            });
            if (!put.ok) throw new Error(`attachment_put_failed_${put.status}`);
            attachments.push({ storagePath, mimeType: file.type, name: file.name });
            previewUrls.push(URL.createObjectURL(file));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'attachment_error');
        setIsStreaming(false);
        return;
      }

      const userMsg: AiMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: Date.now(),
        ...(attachments.length > 0
          ? {
              attachments: attachments.map((a, i) => ({
                ...a,
                previewUrl: previewUrls[i]
              }))
            }
          : {})
      };

      const assistantMsg: AiMessage = {
        id: `pending-${Date.now()}`,
        role: 'assistant',
        content: '',
        createdAt: Date.now()
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      try {
        const user = getFirebaseAuth().currentUser;
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
          body: JSON.stringify({ message: text, conversationId: convId, attachments }),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          const err = await response.text();
          // R178-2c-fix-2: handle CONVERSATION_GONE (410). Clear state
          // + surface friendly error so URL reset can happen in chat-shell.
          if (response.status === 410) {
            let code = '';
            try {
              const parsed = JSON.parse(err) as { error?: { code?: string } };
              code = parsed?.error?.code ?? '';
            } catch {
              /* non-JSON body */
            }
            if (code === 'CONVERSATION_GONE') {
              setConversationId(null);
              setMessages([]);
              throw new Error('conversation_gone');
            }
          }
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
              // AI-4: buffer already keeps incomplete trailing lines (split on
              // '\n\n', pop the remainder), so a line reaching here is a COMPLETE
              // SSE frame. A parse failure means genuinely malformed data — don't
              // swallow it silently (that looks like a frozen assistant with no
              // trace). Log for diagnosis; continue so one bad frame doesn't kill
              // the rest of the stream. isStreaming is reset in `finally`.
              // eslint-disable-next-line no-console -- diagnostic for malformed SSE frame
              console.warn('[chat-stream] dropped malformed SSE frame:', json.slice(0, 200));
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
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, id: event.messageId, tier: event.tier } : m
                )
              );
            }
            if (event.type === 'text_delta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === (realAssistantId ?? assistantMsg.id)
                    ? { ...m, content: m.content + event.delta }
                    : m
                )
              );
            } else if (event.type === 'grounding') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === (realAssistantId ?? assistantMsg.id)
                    ? {
                        ...m,
                        grounding: {
                          unverifiedNumbers: event.unverifiedNumbers,
                          contradictedNumbers: event.contradictedNumbers,
                          unsourcedClaims: event.unsourcedClaims,
                          details: event.details
                        }
                      }
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
                            ? {
                                ...tc,
                                result: event.result,
                                isError: event.isError
                              }
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
