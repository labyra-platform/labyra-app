'use client';

/**
 * Status timeline UI — shows pipeline steps with progress.
 * @phase R160-ai-5b-2
 */
import { IconCheck, IconCircle, IconLoader2, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { PaperStatus, Paper } from '@/types/papers';

const STEPS: Array<{ status: PaperStatus; key: string }> = [
  { status: 'queued', key: 'queued' },
  { status: 'ocr', key: 'ocr' },
  { status: 'chunking', key: 'chunking' },
  { status: 'enriching', key: 'enriching' },
  { status: 'embedding', key: 'embedding' },
  { status: 'indexing', key: 'indexing' },
  { status: 'indexed', key: 'indexed' }
];

const STEP_ORDER: Record<PaperStatus, number> = {
  queued: 0,
  ocr: 1,
  chunking: 2,
  enriching: 3,
  embedding: 4,
  indexing: 5,
  indexed: 6,
  failed: -1,
  cancelling: -1,
  cancelled: -1
};

export function ProcessingTimeline({ paper }: { paper: Paper }) {
  const t = useTranslations('papers');
  const currentOrder = STEP_ORDER[paper.status];
  const isFailed = paper.status === 'failed';
  const isCancelled = paper.status === 'cancelled' || paper.status === 'cancelling';

  return (
    <div className='space-y-1'>
      {STEPS.map((step) => {
        const stepOrder = STEP_ORDER[step.status];
        // Hotfix-5b-3: indexed terminal state shows ALL steps as past (incl. itself)
        const isIndexed = paper.status === 'indexed';
        const isCurrent = !isIndexed && paper.status === step.status;
        const isPast = isIndexed ? true : currentOrder > stepOrder && currentOrder >= 0;
        const isPending = currentOrder < stepOrder && !isFailed && !isCancelled;

        let icon = <IconCircle className='size-4 text-muted-foreground/40' />;
        let textClass = 'text-muted-foreground';

        if (isPast) {
          icon = <IconCheck className='size-4 text-emerald-600 dark:text-emerald-400' />;
          textClass = 'text-foreground';
        } else if (isCurrent && !isFailed && !isCancelled) {
          icon = <IconLoader2 className='size-4 animate-spin text-sky-600 dark:text-sky-400' />;
          textClass = 'text-foreground font-medium';
        } else if (isCurrent && isFailed) {
          icon = <IconX className='size-4 text-destructive' />;
          textClass = 'text-destructive font-medium';
        }

        return (
          <div key={step.status} className='flex items-center gap-3 py-1'>
            {icon}
            <span className={cn('text-sm', textClass)}>{t(`status.${step.key}`)}</span>
          </div>
        );
      })}

      {isFailed && (
        <div className='flex items-start gap-3 py-2 pl-7 text-destructive border-l-2 border-destructive/30 ml-2'>
          <IconAlertTriangle className='size-4 mt-0.5 shrink-0' />
          <div className='space-y-1'>
            <div className='text-sm font-medium'>{t('processingFailed')}</div>
            {paper.error && <div className='text-xs'>{paper.error}</div>}
          </div>
        </div>
      )}

      {isCancelled && (
        <div className='flex items-center gap-3 py-1 text-muted-foreground'>
          <IconX className='size-4' />
          <span className='text-sm'>{t(`status.${paper.status}`)}</span>
        </div>
      )}
    </div>
  );
}
