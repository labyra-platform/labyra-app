/**
 * GlobalSettingsEditor — workflow-global QE settings shared by every unit:
 * functional, plane-wave cutoffs (&SYSTEM ecutwfc/ecutrho), and the HUBBARD +U
 * card (DFT+U). Per-species U values are in eV; the projector is ortho-atomic
 * (the robust default for oxides such as WO₃). Feeds definition.global → worker.
 *
 * @phase R342-hubbard-u
 */
'use client';

import { IconPlus, IconTrash } from '@tabler/icons-react';
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
import type { DftFunctional, DftWorkflowGlobal, HubbardParam } from '@/types/dft';
import { NumberField } from './compose-node-editor';
import { PseudoEditor } from './pseudo-editor';

const FUNCTIONALS: DftFunctional[] = ['pbe', 'pbesol', 'hse'];

export function GlobalSettingsEditor({
  value,
  species,
  onChange
}: {
  value: DftWorkflowGlobal;
  species: string[];
  onChange: (next: DftWorkflowGlobal) => void;
}) {
  const update = (patch: Partial<DftWorkflowGlobal>) => onChange({ ...value, ...patch });
  const rows = value.hubbard ?? [];
  const setHubbard = (next: HubbardParam[]) => update({ hubbard: next });

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <p className='text-sm font-medium'>Global settings</p>

      <div className='grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-3'>
        <div className='space-y-1'>
          <Label className='text-xs'>functional</Label>
          <Select
            value={value.functional ?? 'pbe'}
            onValueChange={(v) => update({ functional: v as DftFunctional })}
          >
            <SelectTrigger className='h-8'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUNCTIONALS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1'>
          <Label className='text-xs'>ecutwfc (Ry)</Label>
          <NumberField
            value={value.ecutwfc ?? 0}
            onCommit={(n) => update({ ecutwfc: n })}
            className='h-8'
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-xs'>ecutrho (Ry)</Label>
          <NumberField
            value={value.ecutrho ?? 0}
            onCommit={(n) => update({ ecutrho: n })}
            className='h-8'
          />
        </div>
      </div>

      <div className='space-y-2 border-t pt-3'>
        <div className='flex items-center justify-between'>
          <p className='font-mono text-xs font-medium'>HUBBARD {'{ortho-atomic}'}</p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setHubbard([...rows, { manifold: '', value: 0 }])}
          >
            <IconPlus className='mr-1 size-4' />
            Add U
          </Button>
        </div>
        {species.length > 0 ? (
          <p className='text-muted-foreground text-xs'>
            Species: {species.join(', ')} — e.g. W-5d, O-2p (values in eV)
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className='text-muted-foreground text-xs'>No +U — add a per-species U for DFT+U.</p>
        ) : (
          rows.map((h, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className='flex items-center gap-1.5'>
              <Input
                value={h.manifold}
                onChange={(e) =>
                  setHubbard(
                    rows.map((r, idx) => (idx === i ? { ...r, manifold: e.target.value } : r))
                  )
                }
                placeholder='e.g. W-5d'
                className='h-8 flex-1'
                aria-label='manifold'
              />
              <NumberField
                value={h.value}
                onCommit={(n) =>
                  setHubbard(rows.map((r, idx) => (idx === i ? { ...r, value: n } : r)))
                }
                className='h-8 w-24'
              />
              <Button
                variant='ghost'
                size='icon'
                className='text-destructive size-8'
                onClick={() => setHubbard(rows.filter((_, idx) => idx !== i))}
                aria-label='Remove U'
              >
                <IconTrash className='size-4' />
              </Button>
            </div>
          ))
        )}
      </div>

      <PseudoEditor
        species={species}
        value={value.pseudoMap ?? {}}
        onChange={(m) => update({ pseudoMap: m })}
      />
    </div>
  );
}
