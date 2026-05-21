/**
 * Thinking indicator — Gemini-style shimmer text shown when the AI is reasoning
 * before the first text_delta arrives.
 *
 * The shimmer sweep is purely decorative and is disabled under
 * prefers-reduced-motion (global rule in globals.css), leaving static text.
 *
 * @phase R174-3 / AI-POLISH-1
 */
'use client';
import { useTranslations } from 'next-intl';

export function ThinkingIndicator({ label }: { label?: string }) {
  const t = useTranslations('ai');
  const text = label ?? t('thinking');
  return (
    <div className='flex items-center gap-3 px-1 py-2'>
      <span className='shimmer-text text-sm font-medium'>{text}</span>
    </div>
  );
}
