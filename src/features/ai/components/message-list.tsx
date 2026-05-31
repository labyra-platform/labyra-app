'use client';

/**
 * MessageList — virtualised with react-virtuoso (R251).
 *
 * Opening a long conversation used to render every MessageBubble at once, parsing
 * each one's markdown + KaTeX up front (~50–80ms/message → seconds; the mount jank
 * confirmed on prod). Virtuoso renders only the messages near the viewport, so a
 * long conversation parses ~a screenful instead of all N.
 *
 * Stick-to-bottom: followOutput="auto" follows new / growing messages ONLY when
 * the user is already at the bottom (won't yank someone who scrolled up to read);
 * initialTopMostItemIndex opens the conversation at the latest message.
 *
 * Supersedes the R160 hand-rolled scroll effects and the R248 dev render probe.
 */
import { useTranslations } from 'next-intl';
import { Virtuoso } from 'react-virtuoso';
import type { AiMessage } from '@/types/ai';
import { MessageBubble } from './message-bubble';
import { ThinkingIndicator } from './thinking-indicator';

// Compute the thinking label from the streaming assistant message (most specific
// first: active tool > tier > default).
function thinkingLabel(m: AiMessage, t: (k: string) => string): string {
  const tools = m.toolCalls ?? [];
  const searching = tools.some((tc) => tc.name === 'searchPapers' && tc.result === undefined);
  if (searching) return t('thinkingSearchPapers');

  switch (m.tier) {
    case 1:
      return t('thinkingTier1');
    case 2:
      return t('thinkingTier2');
    case 3:
      return t('thinkingTier3');
    case 4:
      return t('thinkingTier4');
    case 5:
      return t('thinkingTier5');
    default:
      return t('thinking');
  }
}

export function MessageList({
  messages,
  isStreaming,
  conversationId
}: {
  messages: AiMessage[];
  isStreaming?: boolean;
  conversationId?: string;
}) {
  const t = useTranslations('ai');

  if (messages.length === 0) {
    return (
      <div className='flex-1 overflow-y-auto px-1 py-2'>
        <p className='text-muted-foreground py-8 text-center text-sm'>{t('emptyHistory')}</p>
      </div>
    );
  }

  const lastIndex = messages.length - 1;

  return (
    // Wrapper holds the height (flex child of the chat column); Virtuoso fills it.
    <div className='min-h-0 flex-1'>
      <Virtuoso
        style={{ height: '100%' }}
        data={messages}
        computeItemKey={(_index, m) => m.id}
        initialTopMostItemIndex={lastIndex}
        followOutput='auto'
        atBottomThreshold={100}
        increaseViewportBy={400}
        itemContent={(index, m) => {
          const isLastAssistant = index === lastIndex && m.role === 'assistant';
          const isLastEmpty = Boolean(isStreaming) && isLastAssistant && !m.content;
          return (
            <div className='px-1 pb-6'>
              {isLastEmpty ? (
                <ThinkingIndicator label={thinkingLabel(m, t)} />
              ) : (
                <MessageBubble
                  message={m}
                  conversationId={conversationId}
                  streaming={Boolean(isStreaming) && isLastAssistant}
                />
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
