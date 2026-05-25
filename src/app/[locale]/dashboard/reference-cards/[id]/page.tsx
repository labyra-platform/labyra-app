/**
 * Reference card detail page — read-only view linked from CitationChip.
 *
 * Path: /[locale]/dashboard/reference-cards/[id]
 *
 * Server component: fetches one card via the existing API (which enforces
 * tenant isolation server-side).
 *
 * @phase R162-spectra-4b
 */

import { IconBook, IconChevronLeft } from '@tabler/icons-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { ReferenceCardActions } from '@/features/spectra/components/reference-card-actions';
// R165-phase-4-ref-ui: lifecycle + lineage UI
import { ReferenceDetailActions } from '@/features/spectra/components/reference-detail-actions';
import { formatSciText } from '@/features/spectra/utils/format-units';
import { getCurrentTenantId } from '@/lib/auth/server';
import { ReferenceCardPeakList } from '@/features/spectra/components/reference-card-peak-list';
import { getReferenceCard } from '@/lib/firebase/reference-cards/service';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'referenceCards' });
  return { title: t('title') };
}

export default async function ReferenceCardDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  // Tenant isolation: getReferenceCard scopes by tenantId path segment.
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    notFound();
  }
  const card = await getReferenceCard(tenantId, id);
  if (!card) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'referenceCards' });

  // R163-4c-2-narrow-detail: XRD-only access (4c-4 will branch UI per type)
  const isXrd = card.spectrumType === 'xrd';
  const xrdCard = isXrd ? (card as import('@/types/spectra').XRDReferenceCard) : null;

  return (
    <PageContainer
      pageTitle={formatSciText(card.phaseName)}
      pageDescription={card.formula ? formatSciText(card.formula) : card.cardNumber}
    >
      <div className='space-y-6'>
        <Link
          href={`/${locale}/dashboard/reference-cards`}
          className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <IconChevronLeft className='size-4' />
          {t('backToLibrary')}
        </Link>

        <div className='rounded-lg border bg-card p-4 space-y-3'>
          <div className='flex items-center gap-2'>
            <IconBook className='size-5 text-muted-foreground' />
            <h2 className='text-lg font-medium'>{formatSciText(card.phaseName)}</h2>
            <Badge variant='secondary' className='ml-auto'>
              {t('badgeInternal')} · {card.cardNumber}
            </Badge>
          </div>

          <div className='flex flex-wrap items-center justify-between gap-3'>
            <ReferenceDetailActions
              id={card.id}
              status={
                (
                  card as {
                    lifecycleStatus?: 'active' | 'deprecated' | 'retracted';
                  }
                ).lifecycleStatus ?? 'active'
              }
            />
            <ReferenceCardActions card={card} />
          </div>

          <div className='grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
            <div>
              <div className='text-muted-foreground text-xs'>{t('formula')}</div>
              <div className='font-mono'>{card.formula ? formatSciText(card.formula) : '—'}</div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>{t('spaceGroup')}</div>
              <div>{xrdCard?.spaceGroup ?? '—'}</div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>{t('anode')}</div>
              <div>{xrdCard?.anode ?? '—'}</div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>{t('peaks')}</div>
              <div>{card.peaks?.length ?? 0}</div>
            </div>
          </div>

          {card.notes && (
            <div className='border-t pt-3'>
              <div className='text-muted-foreground text-xs mb-1'>{t('notes')}</div>
              <p className='text-sm whitespace-pre-wrap'>{card.notes}</p>
            </div>
          )}
        </div>

        <div className='rounded-lg border bg-card overflow-hidden'>
          <div className='border-b p-3'>
            <h3 className='text-sm font-medium'>{t('peakList')}</h3>
            <p className='text-xs text-muted-foreground'>
              {t('peakListSubtitle', { count: card.peaks?.length ?? 0 })}
            </p>
          </div>
          <ReferenceCardPeakList card={card} locale={locale} />
        </div>
      </div>

      {/* R165-phase-4-ref-ui: PROV-O lineage graph */}
    </PageContainer>
  );
}
