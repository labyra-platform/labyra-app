'use client';

/**
 * Inspector for a selected step of a protocol instance. Unlike the template
 * inspector, the step's identity (label/kind) is fixed by the snapshot; here the
 * member sets execution status, overrides reagent/parameter values for THIS run,
 * and records a note. Text edits commit on blur; status / add / remove commit
 * immediately.
 *
 * @phase R272 — Protocol Instance (override + status)
 */
import { IconPlus, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSpectraByExperiment } from '@/lib/firestore/queries/spectra';
import { PROTOCOL_STEP_STATUSES } from '@/types/protocol-instance';
import type { ProtocolInstanceStep, ProtocolStepStatus } from '@/types/protocol-instance';
import type { ProtocolInput } from '@/types/protocol-template';

interface Props {
  step: ProtocolInstanceStep;
  experimentId: string;
  onPatch: (patch: Partial<ProtocolInstanceStep>) => void;
  onClose: () => void;
}

export function ProtocolInstanceInspector({ step, experimentId, onPatch, onClose }: Props) {
  const t = useTranslations('protocolTemplates');
  const { spectra } = useSpectraByExperiment(experimentId);
  const [inputs, setInputs] = useState<ProtocolInput[]>(step.inputs);
  const [note, setNote] = useState(step.note ?? '');

  const linkedIds = step.measurementIds ?? [];
  const toggleMeasurement = (id: string) => {
    const next = linkedIds.includes(id) ? linkedIds.filter((x) => x !== id) : [...linkedIds, id];
    onPatch({ measurementIds: next.length > 0 ? next : undefined });
  };

  // Re-seed local drafts when a different step is selected.
  useEffect(() => {
    setInputs(step.inputs);
    setNote(step.note ?? '');
  }, [step.id, step.inputs, step.note]);

  const commitInputs = (next: ProtocolInput[]) => {
    setInputs(next);
    onPatch({ inputs: next });
  };

  return (
    <div className='w-72 shrink-0 space-y-3 rounded-lg border p-3'>
      <div className='flex items-start justify-between gap-2'>
        <p className='text-sm font-medium leading-snug'>{step.label}</p>
        <Button variant='ghost' size='icon' className='size-6 shrink-0' onClick={onClose}>
          <IconX className='size-4' />
          <span className='sr-only'>{t('close')}</span>
        </Button>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs'>{t('stepStatus')}</Label>
        <Select
          value={step.status}
          onValueChange={(v) => onPatch({ status: v as ProtocolStepStatus })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROTOCOL_STEP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status_${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <div className='flex items-center justify-between'>
          <Label className='text-xs'>{t('nodeInputs')}</Label>
          <Button
            variant='ghost'
            size='sm'
            className='h-6 gap-1 px-1.5 text-xs text-muted-foreground'
            onClick={() =>
              commitInputs([...inputs, { id: crypto.randomUUID(), label: '', value: '' }])
            }
          >
            <IconPlus className='size-3' />
            {t('addInput')}
          </Button>
        </div>
        {inputs.length === 0 ? (
          <p className='text-[11px] text-muted-foreground'>{t('noInputs')}</p>
        ) : (
          <div className='space-y-1.5'>
            {inputs.map((inp, i) => (
              <div key={inp.id} className='flex items-center gap-1'>
                <Input
                  value={inp.label}
                  onChange={(e) =>
                    setInputs(
                      inputs.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x))
                    )
                  }
                  onBlur={() => onPatch({ inputs })}
                  placeholder={t('inputLabelPlaceholder')}
                  className='h-7 text-xs'
                />
                <Input
                  value={inp.value ?? ''}
                  onChange={(e) =>
                    setInputs(
                      inputs.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x))
                    )
                  }
                  onBlur={() => onPatch({ inputs })}
                  placeholder={t('inputValuePlaceholder')}
                  className='h-7 w-20 shrink-0 text-xs tabular-nums'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-6 shrink-0 text-muted-foreground'
                  onClick={() => commitInputs(inputs.filter((_, idx) => idx !== i))}
                >
                  <IconX className='size-3' />
                  <span className='sr-only'>{t('removeInput')}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs'>{t('stepNote')}</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onPatch({ note: note.trim() || undefined })}
          rows={2}
          placeholder={t('notePlaceholder')}
          className='text-xs'
        />
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs'>
          {t('linkedMeasurements')}
          {linkedIds.length > 0 && (
            <span className='ml-1 text-muted-foreground'>({linkedIds.length})</span>
          )}
        </Label>
        {spectra.length === 0 ? (
          <p className='text-[11px] text-muted-foreground'>{t('noMeasurements')}</p>
        ) : (
          <div className='max-h-32 space-y-0.5 overflow-y-auto rounded-md border p-1.5'>
            {spectra.map((sp) => (
              <label
                key={sp.id}
                className='flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-muted'
              >
                <input
                  type='checkbox'
                  checked={linkedIds.includes(sp.id)}
                  onChange={() => toggleMeasurement(sp.id)}
                  aria-label={sp.originalFilename}
                  className='size-3 shrink-0'
                />
                <span className='truncate'>{sp.originalFilename}</span>
                <span className='ml-auto shrink-0 uppercase text-muted-foreground'>
                  {sp.spectrumType}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
