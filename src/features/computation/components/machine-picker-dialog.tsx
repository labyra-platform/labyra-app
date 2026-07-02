/**
 * MachinePickerDialog — Mat3ra-style compute picker. Left: providers (Google
 * Cloud Batch is live; Lucia EuroHPC and AWS are visible but marked coming
 * soon). Right: selectable node rows with real specs mirroring the worker's
 * MACHINE_PRESETS (batch_client.py) — the chosen preset name is what /dft/submit
 * already accepts, so no worker change is needed.
 *
 * @phase R354-machine-picker
 */
'use client';

import { IconBrandAws, IconBrandGoogle, IconCheck, IconCpu, IconServer } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface MachineSpec {
  preset: string;
  machineType: string;
  vcpu: number;
  memGb: number;
  gpu: string | null;
  noteKey?: string;
}

/** Mirrors worker MACHINE_PRESETS (src/dft/batch_client.py). */
const GCP_MACHINES: MachineSpec[] = [
  { preset: 'low', machineType: 'e2 (auto)', vcpu: 4, memGb: 16, gpu: null },
  { preset: 'standard', machineType: 'e2 (auto)', vcpu: 8, memGb: 32, gpu: null },
  { preset: 'bulk-amd', machineType: 'c2d-standard-16', vcpu: 16, memGb: 64, gpu: null },
  { preset: 'bulk-large', machineType: 'c2d-standard-32', vcpu: 32, memGb: 128, gpu: null },
  { preset: 'bulk', machineType: 'c2-standard-60', vcpu: 60, memGb: 240, gpu: null },
  {
    preset: 'high-gpu',
    machineType: 'g2-standard-8',
    vcpu: 8,
    memGb: 32,
    gpu: 'NVIDIA L4',
    noteKey: 'machineGpuNote'
  }
];

const PROVIDERS = [
  { id: 'gcp', label: 'Google Cloud Batch', Icon: IconBrandGoogle, live: true, spec: null },
  {
    id: 'lucia',
    label: 'Lucia (EuroHPC)',
    Icon: IconServer,
    live: false,
    spec: 'AMD Milan · 128 cores/node · multi-node SLURM'
  },
  { id: 'aws', label: 'AWS', Icon: IconBrandAws, live: false, spec: null }
] as const;

export function MachinePickerDialog({
  value,
  onChange
}: {
  value: string;
  onChange: (preset: string) => void;
}) {
  const t = useTranslations('computation');
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>('gcp');
  const [selected, setSelected] = useState<string>(value);

  const current = GCP_MACHINES.find((m) => m.preset === value);

  const confirm = () => {
    onChange(selected);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant='outline' className='w-56 justify-start font-normal'>
          <IconCpu className='mr-2 size-4' />
          <span className='truncate'>
            {value}
            {current ? ` · ${current.vcpu} vCPU` : ''}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('machinePickerTitle')}</DialogTitle>
        </DialogHeader>

        <div className='grid gap-4 sm:grid-cols-[200px_1fr]'>
          <div className='space-y-1'>
            {PROVIDERS.map(({ id, label, Icon, live, spec }) => (
              <button
                key={id}
                type='button'
                disabled={!live}
                onClick={() => setProvider(id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                  provider === id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50',
                  !live && 'cursor-not-allowed opacity-60'
                )}
              >
                <Icon className='size-4 shrink-0' />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate'>{label}</span>
                  {spec ? (
                    <span className='text-muted-foreground block truncate text-[10px]'>{spec}</span>
                  ) : null}
                </span>
                {!live ? (
                  <Badge variant='outline' className='shrink-0 text-[10px]'>
                    {t('machineComingSoon')}
                  </Badge>
                ) : null}
              </button>
            ))}
          </div>

          <div className='max-h-[50vh] space-y-2 overflow-y-auto pr-1'>
            {GCP_MACHINES.map((m) => {
              const active = selected === m.preset;
              return (
                <button
                  key={m.preset}
                  type='button'
                  onClick={() => setSelected(m.preset)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-primary bg-accent/40' : 'hover:bg-accent/30'
                  )}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='text-sm font-medium'>{m.preset}</span>
                      <span className='text-muted-foreground font-mono text-xs'>
                        {m.machineType}
                      </span>
                    </div>
                    <p className='text-muted-foreground text-xs'>
                      1 {t('machineNodeUnit')} × {m.vcpu} vCPU · {m.memGb} GB RAM
                      {m.gpu ? ` · ${m.gpu}` : ''}
                      {m.noteKey ? ` — ${t(m.noteKey)}` : ''}
                    </p>
                  </div>
                  {active ? <IconCheck className='text-primary size-4 shrink-0' /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className='flex items-center gap-3 border-t pt-3'>
          <div className='flex items-center gap-2'>
            <Label htmlFor='machine-nodes' className='text-xs'>
              {t('machineNodes')}
            </Label>
            <Input id='machine-nodes' value='1' disabled className='h-8 w-16 text-center' />
          </div>
          <p className='text-muted-foreground text-xs'>{t('machineSingleNodeHint')}</p>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            {t('machineCancel')}
          </Button>
          <Button onClick={confirm}>{t('machineSelect')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
