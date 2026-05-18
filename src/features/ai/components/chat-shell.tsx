'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
/**
 * Chat shell v5 — fixed layout (input stays at bottom).
 *
 * v4 bug: long responses expanded parent containers because flex children
 * default to min-content size. MessageList scrollbar didn't engage because
 * its parent didn't constrain height → content pushed input below fold.
 *
 * v5 fix: add `min-h-0` to all flex-1 ancestors of MessageList so they
 * shrink to remaining space and let inner overflow-y-auto handle scroll.
 *
 * @phase R160-ai-3b-hotfix-layout
 */
import { useEffect, useRef } from 'react';
import { useChatStream } from '@/lib/ai/use-chat-stream';
import { useConversationMessages } from '@/lib/firestore/queries/ai-conversations';
import { useCopyAsLatex } from '../hooks/use-copy-as-latex';
import { useConversation } from '@/lib/firestore/queries/ai-conversations';
import { ConversationPanel } from './conversation-panel';
import { MessageInput } from './message-input';
import { MessageList } from './message-list';
import { PaperSelectorPanel } from './paper-selector-panel';

export function ChatShell() {
  // R160-ai-5d-3d: copy math equations as LaTeX source
  const containerRef = useRef<HTMLDivElement>(null);
  useCopyAsLatex(containerRef);

  const t = useTranslations('ai');
  const searchParams = useSearchParams();
  const router = useRouter();
  const _pathname = usePathname();
  const urlConvId = searchParams.get('c');

  const {
    messages,
    isStreaming,
    error,
    lastUsage,
    sessionUsage,
    conversationId,
    send,
    reset,
    loadConversation
  } = useChatStream();

  // R178-2b: load conversation doc to access selectedPaperIds
  const { data: convDoc } = useConversation(urlConvId);

  const lastLoadedConvIdRef = useRef<string | null>(null);

  const {
    data: loadedMessages,
    isLoading: isLoadingMessages,
    dataUpdatedAt
  } = useConversationMessages(urlConvId);

  useEffect(() => {
    if (!urlConvId) return;
    if (isLoadingMessages) return;
    if (!loadedMessages) return;
    if (lastLoadedConvIdRef.current === urlConvId) return;
    lastLoadedConvIdRef.current = urlConvId;
    loadConversation(loadedMessages, urlConvId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlConvId, isLoadingMessages, loadedMessages, loadConversation]);

  useEffect(() => {
    if (!conversationId) return;
    if (conversationId === urlConvId) return;
    lastLoadedConvIdRef.current = conversationId;
    const url = new URL(window.location.href);
    url.searchParams.set('c', conversationId);
    router.replace(url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, urlConvId, router.replace]);

  useEffect(() => {
    if (urlConvId) return;
    if (!conversationId) return;
    lastLoadedConvIdRef.current = null;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlConvId, reset, conversationId]);

  const hasMessages = messages.length > 0;

  return (
    <div ref={containerRef} className='flex h-[calc(100vh-4rem)] w-full overflow-hidden'>
      <ConversationPanel />

      <div className='flex min-w-0 flex-1 flex-col px-4 py-4'>
        <div className='mx-auto flex w-full min-h-0 max-w-5xl flex-1 flex-col gap-4'>
          <header className='shrink-0'>
            <h1 className='text-xl font-semibold'>{t('title')}</h1>
            <p className='text-muted-foreground text-sm'>{t('subtitle')}</p>
          </header>

          {/* min-h-0 critical: lets flex-1 child shrink below content size,
              enabling MessageList's overflow-y-auto to engage */}
          <div className='flex min-h-0 flex-1 flex-col'>
            <MessageList messages={messages} isStreaming={isStreaming} />
          </div>

          {error && (
            <div className='bg-destructive/10 text-destructive shrink-0 rounded-md border px-3 py-2 text-sm'>
              {t('error')}: {error}
            </div>
          )}

          {hasMessages && (
            <div className='text-muted-foreground shrink-0 space-y-0.5 text-xs'>
              {lastUsage && (
                <div>
                  {t('lastUsage', {
                    input: lastUsage.inputTokens,
                    output: lastUsage.outputTokens,
                    usd: lastUsage.usd.toFixed(4)
                  })}
                </div>
              )}
              {sessionUsage.usd > 0 && (
                <div className='font-medium'>
                  {t('sessionUsage', {
                    input: sessionUsage.inputTokens,
                    output: sessionUsage.outputTokens,
                    usd: sessionUsage.usd.toFixed(4)
                  })}
                </div>
              )}
            </div>
          )}

          <div className='shrink-0'>
            <MessageInput onSend={send} disabled={isStreaming} />
          </div>
        </div>
      </div>
      <PaperSelectorPanel
        conversationId={conversationId ?? urlConvId}
        initialSelectedIds={convDoc?.selectedPaperIds}
      />
    </div>
  );
}
