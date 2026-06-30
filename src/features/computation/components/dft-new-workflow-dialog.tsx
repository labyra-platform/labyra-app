/**
 * New-computation dialog — launches a run from an existing workflow's definition
 * under a fresh run id (the launchable source of truth; templates are
 * metadata-only and the graph composer was retired in R251). Posts to
 * /api/dft/clone and navigates to the new run's workspace.
 *
 * @phase R305-clone-workflow
 */
'use client';

import { IconLoader2, IconPlus, IconRocket } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';
import { DFT_MACHINE_PRESETS } from '@/lib/schemas/dft-submit-schema';

interface Base {
  id: string;
  name: string;
}
type Feedback = { ok: boolean; text: string } | null;

export function DftNewWorkflowDialog({ bases }: { bases: Base[] }) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [baseId, setBaseId] = useState(bases[0]?.id ?? '');
  const [runId, setRunId] = useState('');
  const [preset, setPreset] = useState<string>(DFT_MACHINE_PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const validId = /^[a-z0-9][a-z0-9-]{2,63}$/.test(runId);
  const canLaunch = validId && baseId !== '' && runId !== baseId && !busy;

  async function launch() {
    if (!canLaunch) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dft/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseWorkflowId: baseId, newRunId: runId, machinePreset: preset })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? t('newError') });
        return;
      }
      setOpen(false);
      router.push(`/dashboard/computation/${runId}`);
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('newError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm'>
          <IconPlus className='mr-1 size-4' />
          {t('newWorkflow')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newWorkflow')}</DialogTitle>
          <DialogDescription>{t('newDescription')}</DialogDescription>
        </DialogHeader>
        {bases.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('newNoBase')}</p>
        ) : (
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label>{t('newBase')}</Label>
              <Select value={baseId} onValueChange={setBaseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bases.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='new-run-id'>{t('computeRunId')}</Label>
              <Input
                id='new-run-id'
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder='e.g. ws2-pbeu-2'
              />
              <p className='text-muted-foreground text-xs'>{t('submitWorkflowIdHint')}</p>
            </div>
            <div className='space-y-1.5'>
              <Label>{t('computeMachine')}</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
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
            {feedback ? (
              <p className={feedback.ok ? 'text-xs text-emerald-600' : 'text-destructive text-xs'}>
                {feedback.text}
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button onClick={launch} disabled={!canLaunch}>
            {busy ? (
              <IconLoader2 className='mr-1 size-4 animate-spin' />
            ) : (
              <IconRocket className='mr-1 size-4' />
            )}
            {t('newLaunch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
