'use client';

/**
 * Chat shell v3 — split layout with conversation history panel + chat area.
 * @phase R160-ai-2b
 */
import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useChatStream } from '@/lib/ai/use-chat-stream';
import { useConversationMessages } from '@/lib/firestore/queries/ai-conversations';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';
import { ConversationPanel } from './conversation-panel';
import { useTranslations } from 'next-intl';

export function ChatShell() {
  const t = useTranslations('ai');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  const { data: loadedMessages, isSuccess } = useConversationMessages(urlConvId);

  // When URL conv changes (sidebar click), load it
  useEffect(() => {
    if (!urlConvId) {
      // URL cleared — fresh chat
      if (conversationId) reset();
      return;
    }
    if (isSuccess && loadedMessages && urlConvId !== conversationId) {
      loadConversation(loadedMessages, urlConvId);
    }
  }, [urlConvId, isSuccess, loadedMessages, conversationId, loadConversation, reset]);

  // Sync URL when new conversation created via streaming
  useEffect(() => {
    if (conversationId && conversationId !== urlConvId) {
      const url = new URL(window.location.href);
      url.searchParams.set('c', conversationId);
      router.replace(url.pathname + url.search);
    }
  }, [conversationId, urlConvId, router, pathname]);

  const hasMessages = messages.length > 0;

  return (
    <div className='flex h-[calc(100vh-7rem)] w-full'>
      <ConversationPanel />

      <div className='flex flex-1 flex-col gap-4 px-4 py-4'>
        <div className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4'>
          <header>
            <h1 className='text-xl font-semibold'>{t('title')}</h1>
            <p className='text-muted-foreground text-sm'>{t('subtitle')}</p>
          </header>

          <MessageList messages={messages} />

          {error && (
            <div className='bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm'>
              {t('error')}: {error}
            </div>
          )}

          {hasMessages && (
            <div className='text-muted-foreground space-y-0.5 text-xs'>
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

          <MessageInput onSend={send} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}
