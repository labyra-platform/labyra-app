/**
 * DftPrelaunchChecklist — renders pre-launch sanity checks (buildChecks) as an
 * ok/warn/error list shown in the Compute tab before the user launches a run.
 * @phase R299
 */
'use client';
import { IconAlertTriangle, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { buildChecks, type Severity } from './prelaunch-checks';
import type { DftWorkflow } from '@/types/dft';

const ICON: Record<Severity, typeof IconCircleCheck> = {
  ok: IconCircleCheck,
  warn: IconAlertTriangle,
  error: IconCircleX
};
const COLOR: Record<Severity, string> = {
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  error: 'text-destructive'
};
const RANK: Record<Severity, number> = { error: 0, warn: 1, ok: 2 };

export function DftPrelaunchChecklist({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const checks = useMemo(() => buildChecks(workflow, t), [workflow, t]);
  if (checks.length === 0) return null;

  const sorted = checks.toSorted((a, b) => RANK[a.severity] - RANK[b.severity]);
  const nErr = checks.filter((c) => c.severity === 'error').length;
  const nWarn = checks.filter((c) => c.severity === 'warn').length;

  return (
    <div className='mb-4 rounded-lg border p-3'>
      <div className='mb-2 flex flex-wrap items-center gap-2'>
        <p className='text-sm font-medium'>{t('checklistTitle')}</p>
        {nErr === 0 && nWarn === 0 ? (
          <span className='rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600'>
            {t('checklistAllOk')}
          </span>
        ) : (
          <span className='text-muted-foreground text-xs'>
            {nErr > 0 ? t('checklistErrors', { n: nErr }) : ''}
            {nErr > 0 && nWarn > 0 ? ' · ' : ''}
            {nWarn > 0 ? t('checklistWarnings', { n: nWarn }) : ''}
          </span>
        )}
      </div>
      <ul className='space-y-1'>
        {sorted.map((c, i) => {
          const Icon = ICON[c.severity];
          return (
            <li key={i} className='flex items-start gap-2 text-sm'>
              <Icon className={`mt-0.5 size-4 shrink-0 ${COLOR[c.severity]}`} />
              <span className={c.severity === 'ok' ? 'text-muted-foreground' : ''}>{c.msg}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
