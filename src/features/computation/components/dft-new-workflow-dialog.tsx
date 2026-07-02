/**
 * New-computation dialog — two ways to launch a run:
 *  • Clone: reuse an existing workflow's definition (structure+global+units)
 *    under a fresh run id, optionally overriding Hubbard U per manifold.
 *  • Import: paste a workflow JSON ({structure, global, units}) to bootstrap a
 *    brand-new material — works even on an empty tenant.
 * Clone posts /api/dft/clone; import posts /api/dft/submit. Both navigate to the
 * new run's workspace on success.
 *
 * @phase R312-import-workflow
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { DFT_MACHINE_PRESETS } from '@/lib/schemas/dft-submit-schema';
import type { HubbardParam } from '@/types/dft';

interface Base {
  id: string;
  name: string;
  hubbard: HubbardParam[];
}
type Feedback = { ok: boolean; text: string } | null;
type Mode = 'clone' | 'import';
type ImportedWorkflow = { structure: unknown; global: unknown; units: unknown[] };

function initU(base: Base | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of base?.hubbard ?? []) m[h.manifold] = String(h.value);
  return m;
}

function parseImport(text: string): ImportedWorkflow | null {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const units = o.units;
    if (o.structure == null || o.global == null || !Array.isArray(units) || units.length === 0) {
      return null;
    }
    return { structure: o.structure, global: o.global, units };
  } catch {
    return null;
  }
}

export function DftNewWorkflowDialog({ bases }: { bases: Base[] }) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(bases.length > 0 ? 'clone' : 'import');
  const [baseId, setBaseId] = useState(bases[0]?.id ?? '');
  const [runId, setRunId] = useState('');
  const [preset, setPreset] = useState<string>('bulk-large');
  const [uValues, setUValues] = useState<Record<string, string>>(() => initU(bases[0]));
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedBase = bases.find((b) => b.id === baseId);

  function selectBase(id: string) {
    setBaseId(id);
    setUValues(initU(bases.find((b) => b.id === id)));
  }

  const hubbardOut = (selectedBase?.hubbard ?? []).map((h) => ({
    manifold: h.manifold,
    value: Number(uValues[h.manifold] ?? h.value)
  }));
  const hubbardValid = hubbardOut.every((h) => Number.isFinite(h.value) && h.value >= 0);
  const importValid = mode === 'import' ? parseImport(importText) != null : true;
  const validId = /^[a-z0-9][a-z0-9-]{2,63}$/.test(runId);
  const canLaunch =
    validId &&
    runId !== baseId &&
    !busy &&
    (mode === 'clone' ? baseId !== '' && hubbardValid : importValid);

  async function launch() {
    if (!canLaunch) return;
    setBusy(true);
    setFeedback(null);
    try {
      let res: Response;
      if (mode === 'clone') {
        res = await fetch('/api/dft/clone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseWorkflowId: baseId,
            newRunId: runId,
            machinePreset: preset,
            hubbard: hubbardOut
          })
        });
      } else {
        const wf = parseImport(importText);
        if (!wf) {
          setFeedback({ ok: false, text: t('newImportInvalid') });
          setBusy(false);
          return;
        }
        res = await fetch('/api/dft/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: runId, machinePreset: preset, workflow: wf })
        });
      }
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

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='clone' disabled={bases.length === 0}>
              {t('newTabClone')}
            </TabsTrigger>
            <TabsTrigger value='import'>{t('newTabImport')}</TabsTrigger>
          </TabsList>

          <TabsContent value='clone' className='space-y-3'>
            {bases.length === 0 ? (
              <p className='text-muted-foreground text-sm'>{t('newNoBase')}</p>
            ) : (
              <>
                <div className='space-y-1.5'>
                  <Label>{t('newBase')}</Label>
                  <Select value={baseId} onValueChange={selectBase}>
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
                {selectedBase && selectedBase.hubbard.length > 0 ? (
                  <div className='space-y-1.5'>
                    <Label>{t('newHubbard')}</Label>
                    <div className='grid grid-cols-2 gap-2'>
                      {selectedBase.hubbard.map((h) => (
                        <div key={h.manifold} className='flex items-center gap-2'>
                          <span className='text-muted-foreground shrink-0 text-xs'>
                            U({h.manifold})
                          </span>
                          <Input
                            type='number'
                            step='0.1'
                            min='0'
                            value={uValues[h.manifold] ?? String(h.value)}
                            onChange={(e) =>
                              setUValues((v) => ({ ...v, [h.manifold]: e.target.value }))
                            }
                            className='h-8'
                          />
                        </div>
                      ))}
                    </div>
                    <p className='text-muted-foreground text-xs'>{t('newHubbardHint')}</p>
                  </div>
                ) : null}
              </>
            )}
          </TabsContent>

          <TabsContent value='import' className='space-y-1.5'>
            <Label htmlFor='import-json'>{t('newImportLabel')}</Label>
            <Textarea
              id='import-json'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{ "structure": …, "global": …, "units": [ … ] }'
              className='h-40 font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>{t('newImportHint')}</p>
          </TabsContent>
        </Tabs>

        <div className='space-y-3'>
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
