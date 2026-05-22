/**
 * Reference cards list — client view rendering tenant's library.
 *
 * @phase R162-ref-cards-list
 */
'use client';

import { IconBook } from '@tabler/icons-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
// R163-4c-2-narrow-list
import { useReferenceCards } from '@/features/spectra/hooks/use-reference-cards';
import { SciText } from '@/features/spectra/utils/format-units';

export function ReferenceCardsList() {
  const t = useTranslations('referenceCards');
  const locale = useLocale();
  const { allCards, loading } = useReferenceCards();

  if (loading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  if (allCards.length === 0) {
    return (
      <div className='rounded-lg border bg-muted/30 p-8 text-center text-sm space-y-2'>
        <IconBook className='text-muted-foreground mx-auto size-8' />
        <p className='font-medium'>{t('emptyTitle')}</p>
        <p className='text-muted-foreground'>{t('emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className='rounded-lg border bg-card overflow-hidden'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-xs'>
          <tr>
            <th className='p-3 text-left'>{t('col.phase')}</th>
            <th className='p-3 text-left'>{t('col.formula')}</th>
            <th className='p-3 text-left'>{t('col.spaceGroup')}</th>
            <th className='p-3 text-left'>{t('col.anode')}</th>
            <th className='p-3 text-right'>{t('col.peaks')}</th>
            <th className='p-3 text-left'>{t('col.cardNumber')}</th>
          </tr>
        </thead>
        <tbody className='divide-y'>
          {allCards.map((card) => (
            <tr key={card.id} className='hover:bg-muted/30'>
              <td className='p-3'>
                <Link
                  href={`/${locale}/dashboard/reference-cards/${card.id}`}
                  className='font-medium hover:underline'
                >
                  {card.phaseName}
                </Link>
              </td>
              <td className='p-3 font-mono'>
                {card.formula ? <SciText>{card.formula}</SciText> : '—'}
              </td>
              <td className='p-3'>
                {card.spectrumType === 'xrd' ? (card.spaceGroup ?? '—') : '—'}
              </td>
              <td className='p-3'>
                {card.spectrumType === 'xrd' && card.anode ? (
                  <Badge variant='outline'>{card.anode}</Badge>
                ) : (
                  '—'
                )}
              </td>
              <td className='p-3 text-right font-mono'>{card.peaks?.length ?? 0}</td>
              <td className='p-3 text-xs text-muted-foreground font-mono'>{card.cardNumber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
