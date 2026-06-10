/**
 * DFT submit form — launch a verified preset.
 *
 * Lightweight controlled form (3 fields, action-style). Server-side Zod
 * validation in /api/dft/submit is the real guard; the route accepts only
 * known template ids.
 *
 * @phase R240-dft-submit
 */
'use client';

import { IconLoader2, IconRocket } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { DFT_TEMPLATES } from '@/features/computation/templates';
import { DFT_MACHINE_PRESETS } from '@/lib/schemas/dft-submit-schema';

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export function DftSubmitForm() {
  const t = useTranslations('computation');
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string>(DFT_TEMPLATES[0].id);
  const [workflowId, setWorkflowId] = useState('');
  const [preset, setPreset] = useState<string>('bulk-large');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const valid = /^[a-z0-9][a-z0-9-]{2,63}$/.test(workflowId);

  async function onSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, workflowId, machinePreset: preset })
      });
      if (!res.ok) {
        setFeedback({ kind: 'error', text: t('submitError') });
        return;
      }
      setFeedback({ kind: 'ok', text: t('submitOk', { id: workflowId }) });
      setWorkflowId('');
      router.refresh();
    } catch {
      setFeedback({ kind: 'error', text: t('submitError') });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='max-w-md space-y-4'>
      <div className='space-y-1.5'>
        <Label htmlFor='dft-template'>{t('submitTemplate')}</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger id='dft-template'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DFT_TEMPLATES.map((tpl) => (
              <SelectItem key={tpl.id} value={tpl.id}>
                {tpl.name} · {tpl.method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='dft-run-id'>{t('submitWorkflowId')}</Label>
        <Input
          id='dft-run-id'
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
          placeholder='ws2-run-1'
          autoComplete='off'
          spellCheck={false}
        />
        <p className='text-muted-foreground text-xs'>{t('submitWorkflowIdHint')}</p>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='dft-preset'>{t('submitPreset')}</Label>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger id='dft-preset'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DFT_MACHINE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={onSubmit} disabled={!valid || submitting}>
        {submitting ? (
          <IconLoader2 className='size-4 animate-spin' aria-hidden />
        ) : (
          <IconRocket className='size-4' aria-hidden />
        )}
        {submitting ? t('submitting') : t('submitButton')}
      </Button>

      {feedback ? (
        <p
          className={
            feedback.kind === 'ok'
              ? 'text-sm text-emerald-600 dark:text-emerald-400'
              : 'text-destructive text-sm'
          }
          role='status'
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
