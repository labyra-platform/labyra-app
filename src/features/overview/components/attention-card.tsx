'use client';

/**
 * Needs attention (R506, rebuilt on Panel R510).
 *
 * The only panel that reports problems, so it leads the page. Each row names
 * the subject first — that's what someone scans for — states the facts under
 * it, and offers the one action that resolves it.
 *
 * The empty state is a real answer here, not an apology: nothing is wrong, and
 * saying so plainly is the most useful thing this panel ever does.
 */
import { useLocale, useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Panel, PanelEmpty, PanelList, PanelRow } from '@/components/ui-extra/panel';
import { Button } from '@/components/ui/button';
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
    <PanelRow className='items-start'>
      {/* §5: status palette — red is "the calculation says wrong", amber is
          "wrong soon". Never a category hue. */}
      <span
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          item.severity === 'danger' ? 'bg-destructive' : 'bg-amber-500'
        )}
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <p className='text-body truncate font-medium'>{item.title}</p>
        <p className='text-muted-foreground text-meta truncate tabular-nums'>
          {[t(`attention.reason.${item.kind}`), item.detail].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Button asChild size='sm' variant='outline' className='text-caption h-7 shrink-0'>
        <Link href={item.href}>{t(ACTION_KEY[item.kind])}</Link>
      </Button>
    </PanelRow>
  );
}

export function AttentionCard() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const { items, isLoading } = useAttentionItems(locale);
  const shown = items.slice(0, 5);

  return (
    <Panel
      title={t('attention.title')}
      icon={Icons.warning}
      count={isLoading || !items.length ? undefined : items.length}
    >
      {isLoading ? (
        <div className='space-y-2'>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className='h-10 w-full' />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <PanelEmpty title={t('attention.clearTitle')} description={t('attention.clearDesc')} />
      ) : (
        <PanelList>
          {shown.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </PanelList>
      )}
    </Panel>
  );
}
