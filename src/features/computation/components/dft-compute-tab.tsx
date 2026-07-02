/**
 * DFT Compute tab — backend + launch (report DFT §10.5).
 *
 * Machine preset (combo, never raw cpu/mem) + Run ID → POST /api/dft/submit,
 * which re-runs this workflow's definition (structure + global + units) on
 * Cloud Batch (Spot) under a new run ID. Cost/Spot/maxRunDuration are handled
 * server-side for now.
 *
 * @phase R255-dft-compute-launch
 */
'use client';

import { IconLoader2, IconRocket } from '@tabler/icons-react';
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
import { DFT_MACHINE_PRESETS } from '@/lib/schemas/dft-submit-schema';
import type { DftWorkflow } from '@/types/dft';

const RUN_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function DftComputeTab({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const [preset, setPreset] = useState<string>('bulk-large');
  const [runId, setRunId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = RUN_ID_RE.test(runId);

  async function launch() {
    if (!valid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/dft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: runId,
          machinePreset: preset,
          workflow: {
            structure: workflow.structure,
            global: workflow.global,
            units: workflow.units
          }
        })
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? t('computeLaunchError') });
        return;
      }
      setMsg({ ok: true, text: t('computeLaunchOk', { id: runId }) });
      setRunId('');
    } catch {
      setMsg({ ok: false, text: t('computeLaunchError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='max-w-md space-y-4'>
      <p className='text-muted-foreground text-sm'>{t('computeBackendNote')}</p>

      <div className='space-y-1.5'>
        <Label htmlFor='dft-preset'>{t('computeMachine')}</Label>
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

      <div className='space-y-1.5'>
        <Label htmlFor='dft-runid'>{t('computeRunId')}</Label>
        <Input
          id='dft-runid'
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          placeholder='ws2-rerun-1'
          autoComplete='off'
          spellCheck={false}
        />
      </div>

      <Button onClick={launch} disabled={!valid || busy}>
        {busy ? (
          <IconLoader2 className='size-4 animate-spin' aria-hidden />
        ) : (
          <IconRocket className='size-4' aria-hidden />
        )}
        {busy ? t('computeLaunching') : t('computeLaunch')}
      </Button>

      {msg ? (
        <p
          className={
            msg.ok ? 'text-sm text-emerald-600 dark:text-emerald-400' : 'text-destructive text-sm'
          }
          role='status'
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
