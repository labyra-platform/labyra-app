/**
 * DFT results card — read-only summary of one computation workflow.
 *
 * Band gap (direct/indirect + VBM/CBM k-positions), relaxed cell, total energy,
 * plus the pipeline as an LR status DAG. The title links to the workflow
 * workspace. Server Component; the DAG is a client island.
 *
 * @phase R259-link-card-to-workspace
 */
import { IconActivity, IconAtom2, IconChartHistogram } from '@tabler/icons-react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DftWorkflowGraph } from '@/features/workflow/components/dft-workflow-graph';
import { Link } from '@/i18n/navigation';
import type { DftOverallStatus, DftWorkflow } from '@/types/dft';

function fmt(n: number | null | undefined, digits = 4): string {
  return typeof n === 'number' ? n.toFixed(digits) : '—';
}
function fmtK(k: [number, number, number] | null): string {
  return k ? `(${k.map((x) => x.toFixed(3)).join(', ')})` : '—';
}

const OVERALL_VARIANT: Record<DftOverallStatus, 'default' | 'secondary' | 'destructive'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive'
};

interface Props {
  workflow: DftWorkflow;
}

export async function DftResultsCard({ workflow }: Props) {
  const t = await getTranslations('computation');
  const r = workflow.results;
  const g = workflow.global;
  const overall = workflow.overallStatus;
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <IconAtom2 className='size-4 shrink-0' aria-hidden />
          <Link href={`/dashboard/computation/${workflow.id}`} className='truncate hover:underline'>
            {g?.prefix ?? workflow.id}
          </Link>
          {g?.functional ? (
            <span className='text-muted-foreground text-xs uppercase'>{g.functional}</span>
          ) : null}
        </CardTitle>
        {overall ? (
          <Badge variant={OVERALL_VARIANT[overall]}>
            {overall === 'completed'
              ? t('status.completed')
              : overall === 'running'
                ? t('status.running')
                : t('status.failed')}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className='space-y-4'>
        {r?.bandGap ? (
          <section className='space-y-1'>
            <h3 className='flex items-center gap-1.5 text-sm font-medium'>
              <IconChartHistogram className='size-4' aria-hidden />
              {t('bandGap')}
            </h3>
            <div className='flex items-center gap-2'>
              <span className='text-2xl font-semibold tabular-nums'>
                {fmt(r.bandGap.band_gap_ev, 2)} eV
              </span>
              <Badge variant='outline'>
                {r.bandGap.direct === true
                  ? t('direct')
                  : r.bandGap.direct === false
                    ? t('indirect')
                    : '—'}
              </Badge>
            </div>
            <p className='text-muted-foreground text-xs tabular-nums'>
              {t('vbm')} {fmt(r.bandGap.vbm_ev, 4)} eV @ {fmtK(r.bandGap.vbm_k)}
              {' · '}
              {t('cbm')} {fmt(r.bandGap.cbm_ev, 4)} eV @ {fmtK(r.bandGap.cbm_k)}
            </p>
          </section>
        ) : null}
        {r?.relaxedStructure ? (
          <>
            <Separator />
            <section className='space-y-1'>
              <h3 className='text-sm font-medium'>{t('relaxedStructure')}</h3>
              <dl className='text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums sm:grid-cols-4'>
                <div>
                  a <span className='text-foreground'>{fmt(r.relaxedStructure.aAng, 4)} Å</span>
                </div>
                <div>
                  c <span className='text-foreground'>{fmt(r.relaxedStructure.cAng, 4)} Å</span>
                </div>
                <div>
                  c/a <span className='text-foreground'>{fmt(r.relaxedStructure.coa, 4)}</span>
                </div>
                <div>
                  V{' '}
                  <span className='text-foreground'>
                    {fmt(r.relaxedStructure.volumeAng3, 2)} Å³
                  </span>
                </div>
              </dl>
            </section>
          </>
        ) : null}
        {typeof r?.totalEnergyRy === 'number' ? (
          <p className='text-muted-foreground text-xs tabular-nums'>
            {t('totalEnergy')} <span className='text-foreground'>{fmt(r.totalEnergyRy, 4)} Ry</span>
          </p>
        ) : null}
        {!r ? <p className='text-muted-foreground text-sm'>{t('noResults')}</p> : null}
        <Separator />
        <section className='space-y-1.5'>
          <h3 className='flex items-center gap-1.5 text-sm font-medium'>
            <IconActivity className='size-4' aria-hidden />
            {t('pipeline')}
          </h3>
          <DftWorkflowGraph workflow={workflow} className='h-[240px]' />
        </section>
      </CardContent>
    </Card>
  );
}
