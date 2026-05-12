'use client';

import type { AiMessage } from '@/types/ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { ToolCallBlock } from './tool-call-block';
import 'katex/dist/katex.min.css';

const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'tierFlash',
  2: 'tierSonnet',
  3: 'tierOpus'
};

const TIER_COLORS: Record<1 | 2 | 3, string> = {
  1: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  2: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  3: 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
};

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const t = useTranslations('ai');
  return (
    <span
      className={cn(
        'mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
        TIER_COLORS[tier]
      )}
    >
      {t(TIER_LABELS[tier])}
    </span>
  );
}

export function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {isUser ? (
          <p className='whitespace-pre-wrap'>{message.content}</p>
        ) : (
          <>
            {message.tier && <TierBadge tier={message.tier} />}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className='mb-2'>
                {message.toolCalls.map((tc) => (
                  <ToolCallBlock
                    key={tc.id}
                    name={tc.name}
                    input={tc.input}
                    result={tc.result}
                    isError={tc.isError}
                  />
                ))}
              </div>
            )}
            <div className='prose prose-sm dark:prose-invert max-w-none prose-table:my-2 prose-pre:my-2 prose-p:my-1.5'>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {message.content || (message.toolCalls?.length ? '' : '...')}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
