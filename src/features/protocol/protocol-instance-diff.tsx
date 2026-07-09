'use client';

/**
 * Compare two experiments' protocol instances of the SAME template — the payoff
 * of clone+tweak: see which parameters differ between runs (180 °C vs 200 °C),
 * how each step's status landed, and how many measurements each produced. This is
 * combined logical + data provenance: different conditions ↔ different results.
 *
 * @phase R274 — Protocol Instance (diff)
 */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useProtocolInstance } from '@/features/protocol/use-protocol-instance';
import { useExperiments } from '@/lib/firestore/queries/experiments';
import type { ProtocolInstance, ProtocolStepStatus } from '@/types/protocol-instance';
import { cn } from '@/lib/utils';

interface InputDiff {
  label: string;
  valueA?: string;
  valueB?: string;
  differ: boolean;
}

interface StepDiff {
  id: string;
  label: string;
  statusA?: ProtocolStepStatus;
  statusB?: ProtocolStepStatus;
  statusDiffer: boolean;
  inputs: InputDiff[];
  measurementsA: number;
  measurementsB: number;
}

function diffInstances(a: ProtocolInstance, b: ProtocolInstance): StepDiff[] {
  return a.steps.map((sa) => {
    const sb = b.steps.find((s) => s.id === sa.id);
    const inputIds = [
      ...new Set([...sa.inputs.map((i) => i.id), ...(sb?.inputs.map((i) => i.id) ?? [])])
    ];
    const inputs: InputDiff[] = inputIds.map((iid) => {
      const ia = sa.inputs.find((x) => x.id === iid);
      const ib = sb?.inputs.find((x) => x.id === iid);
      const valueA = ia?.value;
      const valueB = ib?.value;
      return {
        label: ia?.label ?? ib?.label ?? '',
        valueA,
        valueB,
        differ: (valueA ?? '') !== (valueB ?? '')
      };
    });
    return {
      id: sa.id,
      label: sa.label,
      statusA: sa.status,
      statusB: sb?.status,
      statusDiffer: sa.status !== sb?.status,
      inputs,
      measurementsA: sa.measurementIds?.length ?? 0,
      measurementsB: sb?.measurementIds?.length ?? 0
    };
  });
}

export function ProtocolInstanceDiff() {
  const t = useTranslations('protocolTemplates');
  const { experiments } = useExperiments();
  const [expA, setExpA] = useState('');
  const [expB, setExpB] = useState('');
  const { instance: instA } = useProtocolInstance(expA || null);
  const { instance: instB } = useProtocolInstance(expB || null);

  const bothSelected = expA !== '' && expB !== '';
  const bothHave = Boolean(instA && instB);
  const sameTemplate = Boolean(instA && instB && instA.templateId === instB.templateId);
  const diff = useMemo(
    () => (instA && instB && sameTemplate ? diffInstances(instA, instB) : []),
    [instA, instB, sameTemplate]
  );

  const labelFor = (id: string) => {
    const e = experiments.find((x) => x.id === id);
    return e ? `${e.experimentCode} · ${e.title}` : id;
  };

  const picker = (value: string, onChange: (v: string) => void, exclude: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={t('diffSelectExperiment')} />
      </SelectTrigger>
      <SelectContent>
        {experiments
          .filter((e) => e.id !== exclude)
          .map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.experimentCode} · {e.title}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label className='text-xs'>{t('diffRunA')}</Label>
          {picker(expA, setExpA, expB)}
        </div>
        <div className='space-y-1.5'>
          <Label className='text-xs'>{t('diffRunB')}</Label>
          {picker(expB, setExpB, expA)}
        </div>
      </div>

      {bothSelected && !bothHave && (
        <p className='rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground'>
          {t('diffMissingInstance')}
        </p>
      )}
      {bothHave && !sameTemplate && (
        <p className='rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
          {t('diffDifferentTemplates')}
        </p>
      )}

      {sameTemplate && (
        <div className='space-y-3'>
          <p className='text-sm'>
            <span className='text-muted-foreground'>{t('instanceFromTemplate')} </span>
            <span className='font-medium'>{instA?.templateName}</span>
          </p>
          {diff.map((step) => (
            <div key={step.id} className='overflow-hidden rounded-lg border'>
              <div className='flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2'>
                <span className='text-sm font-medium'>{step.label}</span>
                <div className='flex items-center gap-3 text-[11px]'>
                  <span className={cn(step.statusDiffer && 'font-semibold text-amber-700')}>
                    A: {step.statusA ? t(`status_${step.statusA}`) : '—'}
                  </span>
                  <span className={cn(step.statusDiffer && 'font-semibold text-amber-700')}>
                    B: {step.statusB ? t(`status_${step.statusB}`) : '—'}
                  </span>
                </div>
              </div>
              <div className='divide-y text-xs'>
                {step.inputs.length === 0 ? (
                  <p className='px-3 py-2 text-muted-foreground'>{t('diffNoInputs')}</p>
                ) : (
                  step.inputs.map((inp, i) => (
                    <div
                      key={i}
                      className={cn(
                        'grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1.5',
                        inp.differ && 'bg-amber-50 dark:bg-amber-950/30'
                      )}
                    >
                      <span className='truncate'>{inp.label || '—'}</span>
                      <span
                        className={cn(
                          'w-24 text-right font-mono tabular-nums',
                          inp.differ && 'font-semibold text-amber-800 dark:text-amber-200'
                        )}
                      >
                        {inp.valueA ?? '—'}
                      </span>
                      <span
                        className={cn(
                          'w-24 text-right font-mono tabular-nums',
                          inp.differ && 'font-semibold text-amber-800 dark:text-amber-200'
                        )}
                      >
                        {inp.valueB ?? '—'}
                      </span>
                    </div>
                  ))
                )}
                {(step.measurementsA > 0 || step.measurementsB > 0) && (
                  <div className='grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 text-muted-foreground'>
                    <span>{t('linkedMeasurements')}</span>
                    <span className='w-24 text-right tabular-nums'>{step.measurementsA}</span>
                    <span className='w-24 text-right tabular-nums'>{step.measurementsB}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {diff.length > 0 && (
            <div className='grid grid-cols-[1fr_auto_auto] gap-3 px-3 text-[11px] text-muted-foreground'>
              <span />
              <span className='w-24 text-right'>{labelFor(expA)}</span>
              <span className='w-24 text-right'>{labelFor(expB)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
