'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
/**
 * MessageList with stick-to-bottom auto-scroll.
 *
 * Pattern from ChatGPT / Claude.ai:
 * - If user is near bottom (within threshold), follow new content
 * - If user scrolled up to read, don't force-scroll them back down
 * - Use 'instant' during streaming (smooth lags behind text_delta)
 *
 * @phase R160-ai-3b-hotfix-scroll
 */
import type { AiMessage } from '@/types/ai';
import { MessageBubble } from './message-bubble';
import { ThinkingIndicator } from './thinking-indicator';

const NEAR_BOTTOM_THRESHOLD_PX = 100;

export function MessageList({
  messages,
  isStreaming,
  conversationId
}: {
  messages: AiMessage[];
  isStreaming?: boolean;
  conversationId?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Detect whether user is near bottom (tracked on scroll)
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distance < NEAR_BOTTOM_THRESHOLD_PX);
  };

  // Auto-scroll to bottom only when user is near it
  // useLayoutEffect runs sync after DOM mutation, before paint — keeps stream smooth
  useLayoutEffect(() => {
    if (!isNearBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isNearBottom]);

  // Re-anchor to bottom whenever the message COUNT increases (new message starts).
  // This forces scroll even if user had scrolled up — typical UX when sending a
  // new question.
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      setIsNearBottom(true);
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className='flex-1 space-y-4 overflow-y-auto rounded-lg border bg-card p-4 scroll-smooth'
    >
      {messages.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>Start a conversation...</p>
      ) : (
        messages.map((m) => {
          const isLastEmpty =
            isStreaming &&
            m === messages[messages.length - 1] &&
            m.role === 'assistant' &&
            !m.content;
          if (isLastEmpty) {
            return <ThinkingIndicator key={m.id} />;
          }
          return <MessageBubble key={m.id} message={m} conversationId={conversationId} />;
        })
      )}
    </div>
  );
}
