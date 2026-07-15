/**
 * CrossSpectrumPanel — sample-level CSIE result display.
 *
 * Renders:
 *  - Overall coherence + measurements analyzed
 *  - Per-phase evidence cards (confirmed/partial/missing/conflict)
 *  - Unexpected observations
 *  - Ambiguous observations + discrimination experiments
 *  - Refresh button (force=true)
 *
 * @phase R185-10c
 */
'use client';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { IconAlertTriangle, IconNetwork, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AmbiguousObservationCard } from '@/components/deviation/ambiguous-observation-card';
import { ConfidenceMeter } from '@/components/deviation/confidence-meter';
import { PhaseEvidenceCard } from '@/components/deviation/phase-evidence-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelEmpty } from '@/components/ui-extra/panel';
import { useTranslations } from 'next-intl';
import { DeviationSkeleton } from '@/components/deviation/deviation-skeleton';
import { useCSIEResult } from '@/lib/firestore/queries/csie';

interface CrossSpectrumPanelProps {
  sampleId: string;
}

export function CrossSpectrumPanel({ sampleId }: CrossSpectrumPanelProps) {
  const t = useTranslations('deviation.csie');
  const tAmb = useTranslations('deviation.ambiguous');
  const { result, loading } = useCSIEResult(sampleId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const tokenResult = await user.getIdTokenResult();
      const tenantId = tokenResult.claims.tenantId as string | undefined;
      if (!tenantId) throw new Error('tenant_missing');

      const token = await user.getIdToken();
      const res = await fetch(`/api/csie/${sampleId}/refresh`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tenantId, force: true })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('refreshSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('refreshFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <DeviationSkeleton />;
  }

  if (!result || result.status !== 'ok' || !result.consistency) {
    return (
      <Panel title={t('title')} icon={IconNetwork}>
        <PanelEmpty
          title={t('title')}
          description={
            result?.status === 'insufficient_data' ? t('insufficientData') : t('noResult')
          }
          action={
            <Button onClick={handleRefresh} variant='outline' size='sm' disabled={refreshing}>
              <IconRefresh className='mr-1 h-4 w-4' aria-hidden='true' />
              {refreshing ? t('computing') : t('runNow')}
            </Button>
          }
        />
      </Panel>
    );
  }

  const c = result.consistency;
  const ambiguous = c.ambiguous_observations ?? [];

  return (
    <div className='space-y-4'>
      <Panel
        title={t('title')}
        icon={IconNetwork}
        action={
          <Button
            onClick={handleRefresh}
            variant='ghost'
            size='sm'
            disabled={refreshing}
            className='h-8 shrink-0 px-2'
            aria-label={t('refreshAria')}
          >
            <IconRefresh className='h-3.5 w-3.5' aria-hidden='true' />
          </Button>
        }
      >
        <div className='space-y-4'>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm'>
            <div>
              <p className='text-xs text-muted-foreground'>Spectra analyzed</p>
              <p className='font-semibold tabular-nums'>{c.measurements_analyzed}</p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Techniques</p>
              <div className='flex gap-1 flex-wrap mt-0.5'>
                {c.spectrum_types_present.map((t) => (
                  <Badge key={t} variant='outline' className='text-xs uppercase'>
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Coherence score</p>
              <ConfidenceMeter value={c.overall_coherence_score} className='mt-1' />
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Conflicts</p>
              <p className='font-semibold tabular-nums'>
                {c.conflicts_count > 0 ? (
                  <span className='text-destructive'>{c.conflicts_count}</span>
                ) : (
                  <span>0</span>
                )}
              </p>
            </div>
          </div>

          {c.unexpected_observations.length > 0 && (
            <div
              role='alert'
              className='rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm'
            >
              <p className='font-medium text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1.5'>
                <IconAlertTriangle className='h-4 w-4' aria-hidden='true' />
                Unexpected observations
              </p>
              <ul className='text-xs space-y-1 pl-4 list-disc text-amber-700/80 dark:text-amber-300/80'>
                {c.unexpected_observations.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      {c.declared_phases.length > 0 && (
        <Panel title={t('phaseConsistency', { count: c.declared_phases.length })}>
          <div className='space-y-3'>
            {c.declared_phases.map((p) => (
              <PhaseEvidenceCard key={p.formula} evidence={p} />
            ))}
          </div>
        </Panel>
      )}

      {ambiguous.length > 0 && (
        <Panel title={tAmb('title', { count: ambiguous.length })} icon={IconAlertTriangle}>
          <div className='space-y-3'>
            {ambiguous.map((amb) => (
              <AmbiguousObservationCard key={amb.observation_id} observation={amb} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
