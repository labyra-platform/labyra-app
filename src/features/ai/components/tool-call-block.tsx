'use client';

import { IconAlertTriangle, IconCheck, IconChevronDown, IconTool } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
/**
 * Displays a tool call + result within an assistant message.
 * Collapsed by default, click to expand JSON.
 * @phase R160-ai-3c1
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ToolCallProps {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
}

export function ToolCallBlock({ name, input, result, isError }: ToolCallProps) {
  const t = useTranslations('ai');
  const [expanded, setExpanded] = useState(false);
  const hasResult = result !== undefined;

  return (
    <div
      className={cn(
        'my-1.5 overflow-hidden rounded-md border bg-background/50 text-xs',
        isError && 'border-destructive/30 bg-destructive/5'
      )}
    >
      <button
        type='button'
        onClick={() => setExpanded((s) => !s)}
        className='hover:bg-muted/50 flex w-full items-center gap-2 px-2 py-1.5 text-left'
      >
        <IconTool className='size-3.5 shrink-0' />
        <span className='font-mono font-medium'>{name}</span>
        <span className='text-muted-foreground flex-1 truncate'>
          {Object.keys(input).length > 0
            ? Object.entries(input)
                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                .join(', ')
            : t('toolNoArgs')}
        </span>
        {hasResult && !isError && (
          <IconCheck className='text-emerald-600 dark:text-emerald-400 size-3.5 shrink-0' />
        )}
        {isError && <IconAlertTriangle className='text-destructive size-3.5 shrink-0' />}
        <IconChevronDown
          className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && (
        <div className='space-y-2 border-t bg-muted/30 px-3 py-2'>
          <div>
            <div className='text-muted-foreground mb-1 text-[10px] uppercase tracking-wide'>
              {t('toolInput')}
            </div>
            <pre className='whitespace-pre-wrap break-words font-mono text-[11px]'>
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
          {hasResult && (
            <div>
              <div className='text-muted-foreground mb-1 text-[10px] uppercase tracking-wide'>
                {isError ? t('toolError') : t('toolResult')}
              </div>
              <pre className='whitespace-pre-wrap break-words font-mono text-[11px]'>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
