'use client';

/**
 * R506: "Needs attention".
 *
 * The only card that reports problems, so it leads. Each row names the subject
 * first (the chemical, the run — that's what someone scans for), states the
 * facts underneath, and offers the one action that resolves it. An empty list
 * is a real answer here, not a placeholder: nothing is wrong.
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { type AttentionItem, useAttentionItems } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';

const ACTION_KEY: Record<AttentionItem['kind'], string> = {
  dft_failed: 'attention.viewLog',
  chemical_low: 'attention.order',
  chemical_expiring: 'attention.view'
};

function Row({ item }: { item: AttentionItem }) {
  const t = useTranslations('dashboard');
  return (
    <li className='flex items-start gap-2.5 py-2.5'>
      <span
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          item.severity === 'danger' ? 'bg-destructive' : 'bg-amber-500'
        )}
        aria-hidden
      />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>{item.title}</p>
        <p className='text-muted-foreground truncate text-xs'>
          {[t(`attention.reason.${item.kind}`), item.detail].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Button asChild size='sm' variant='outline' className='h-7 shrink-0 text-xs'>
        <Link href={item.href}>{t(ACTION_KEY[item.kind])}</Link>
      </Button>
    </li>
  );
}

export function AttentionCard({ locale }: { locale: string }) {
  const t = useTranslations('dashboard');
  const { items, isLoading } = useAttentionItems(locale);
  const shown = items.slice(0, 5);

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='pb-1'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Icons.warning className='size-4' aria-hidden />
            {t('attention.title')}
          </CardTitle>
          {!isLoading && items.length > 0 && (
            <span className='text-muted-foreground text-xs tabular-nums'>
              {t('attention.count', { count: items.length })}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className='flex-1'>
        {isLoading ? (
          <div className='space-y-3 py-2'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-9 w-full' />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-1.5 py-8 text-center'>
            <Icons.check className='text-primary size-6' aria-hidden />
            <p className='text-sm font-medium'>{t('attention.clearTitle')}</p>
            <p className='text-muted-foreground text-xs'>{t('attention.clearDesc')}</p>
          </div>
        ) : (
          <ul className='divide-border -my-1 divide-y'>
            {shown.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
