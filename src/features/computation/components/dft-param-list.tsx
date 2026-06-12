/**
 * Grouped DFT param list (report DFT §4.4): Basic (A constraints + D quality with
 * baseline ✓/⚠/⛔) | Advanced (B, collapsible) | Locked (C). Read-only here;
 * editing-with-warnings lands with the compose flow.
 *
 * @phase R257-dft-param-list-types
 */
'use client';

import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconLock
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  baselineStatus,
  DFT_PARAM_SPEC,
  paramGroupOf,
  type ParamGroup
} from '@/features/computation/dft-param-spec';
import type { DftUnitParams } from '@/types/dft';

const STATUS_BADGE = {
  ok: { Icon: IconCircleCheck, cls: 'text-emerald-600 dark:text-emerald-400' },
  warn: { Icon: IconAlertTriangle, cls: 'text-amber-500' },
  bad: { Icon: IconAlertOctagon, cls: 'text-destructive' }
} as const;

function ParamRow({ name, value }: { name: string; value: unknown }) {
  const spec = DFT_PARAM_SPEC[name];
  const status = baselineStatus(name, value);
  const badge = status ? STATUS_BADGE[status] : null;
  const StatusIcon = badge?.Icon;
  return (
    <div className='flex items-center justify-between gap-3'>
      <dt className='text-muted-foreground shrink-0'>{spec?.label ?? name}</dt>
      <dd className='flex items-center gap-1 truncate'>
        <span className='truncate'>{String(value)}</span>
        {StatusIcon && badge ? (
          <StatusIcon className={`size-3.5 shrink-0 ${badge.cls}`} aria-hidden />
        ) : null}
      </dd>
    </div>
  );
}

export function DftParamList({ params }: { params: DftUnitParams }) {
  const t = useTranslations('computation');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const entries = Object.entries(params).filter(
    ([key, value]) => value != null && key !== 'kPoints'
  );
  const grouped: Record<ParamGroup, [string, unknown][]> = { A: [], B: [], C: [], D: [] };
  for (const [key, value] of entries) grouped[paramGroupOf(key)].push([key, value]);
  const basic = [...grouped.A, ...grouped.D];

  return (
    <div className='space-y-2 font-mono text-xs'>
      {basic.length > 0 ? (
        <dl className='space-y-0.5'>
          {basic.map(([key, value]) => (
            <ParamRow key={key} name={key} value={value} />
          ))}
        </dl>
      ) : null}

      {grouped.B.length > 0 ? (
        <div>
          <button
            type='button'
            onClick={() => setShowAdvanced((s) => !s)}
            className='text-muted-foreground hover:text-foreground font-sans text-[11px]'
          >
            {showAdvanced ? '▾' : '▸'} {t('paramAdvanced')} ({grouped.B.length})
          </button>
          {showAdvanced ? (
            <dl className='mt-0.5 space-y-0.5'>
              {grouped.B.map(([key, value]) => (
                <ParamRow key={key} name={key} value={value} />
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {grouped.C.length > 0 ? (
        <dl className='text-muted-foreground/70 space-y-0.5'>
          {grouped.C.map(([key, value]) => (
            <div key={key} className='flex items-center justify-between gap-3'>
              <dt className='flex shrink-0 items-center gap-1'>
                <IconLock className='size-3' aria-hidden />
                {DFT_PARAM_SPEC[key]?.label ?? key}
              </dt>
              <dd className='truncate'>{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
