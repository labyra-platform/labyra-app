/**
 * DeviationSkeleton — loading placeholder for DeviationPanel/CrossSpectrumPanel.
 *
 * R513: the heading is not loading. It is static text we already hold, so
 * skeletoning it made the panel change height the moment data arrived — the
 * shift a skeleton exists to prevent (§7). Renders the real Panel with the
 * real title; only the data below is placeholder.
 *
 * @phase R185-10d-2
 */
'use client';

import { IconReportAnalytics } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { Panel } from '@/components/ui-extra/panel';
import { Skeleton } from '@/components/ui/skeleton';

export function DeviationSkeleton() {
  const t = useTranslations('deviation.panel');
  return (
    <Panel title={t('title')} icon={IconReportAnalytics}>
      <div className='space-y-3'>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='space-y-1'>
              <Skeleton className='h-3 w-16' />
              <Skeleton className='h-6 w-12' />
            </div>
          ))}
        </div>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-32 w-full' />
      </div>
    </Panel>
  );
}
