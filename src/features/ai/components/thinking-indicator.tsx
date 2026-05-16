/**
 * Thinking indicator — Gemini-style animated dots shown when AI is reasoning
 * before first text_delta arrives.
 *
 * Rendered by MessageList when isStreaming && last assistant message empty.
 *
 * @phase R174-3
 */
'use client';
import { useTranslations } from 'next-intl';

export function ThinkingIndicator({ label }: { label?: string }) {
  const t = useTranslations('ai');
  const text = label ?? t('thinking');
  return (
    <div className='flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3'>
      <div className='flex items-center gap-1.5 pt-1'>
        <span
          className='block h-2 w-2 animate-pulse rounded-full bg-foreground/60'
          style={{ animationDelay: '0ms', animationDuration: '1.2s' }}
        />
        <span
          className='block h-2 w-2 animate-pulse rounded-full bg-foreground/60'
          style={{ animationDelay: '200ms', animationDuration: '1.2s' }}
        />
        <span
          className='block h-2 w-2 animate-pulse rounded-full bg-foreground/60'
          style={{ animationDelay: '400ms', animationDuration: '1.2s' }}
        />
      </div>
      <span className='text-muted-foreground text-sm'>{text}</span>
    </div>
  );
}
