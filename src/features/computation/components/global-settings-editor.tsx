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
import { Checkbox } from '@/components/ui/checkbox';
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
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { NumberField } from './compose-node-editor';
import { PseudoEditor, type PseudoInfo } from './pseudo-editor';

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

  const t = useTranslations('computation');
  const [library, setLibrary] = useState<PseudoInfo[]>([]);

  // Suggested cutoffs from the assigned UPFs: ecutwfc/ecutrho = the max across
  // species of each pseudopotential's author-suggested minimum. The dominant
  // pseudopotential kind sets the expected ecutrho/ecutwfc ratio shown to the
  // user (norm-conserving ≈ 4×; ultrasoft/PAW 8–12×), so an atypical value is
  // easy to spot.
  const cutoffSuggestion = useMemo(() => {
    const assigned = Object.values(value.pseudoMap ?? {});
    if (assigned.length === 0) return null;
    const infos = assigned
      .map((fn) => library.find((p) => p.filename === fn))
      .filter((p): p is PseudoInfo => Boolean(p));
    const wfcs = infos
      .map((p) => p.ecutwfc)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const rhos = infos
      .map((p) => p.ecutrho)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    if (wfcs.length === 0) return null;
    const ecutwfc = Math.max(...wfcs);
    const kinds = infos.map((p) => (p.pseudoType ?? '').toUpperCase());
    const isPawUs = kinds.some((k) => k === 'PAW' || k === 'US');
    // If any UPF is PAW/US, ecutrho follows the 8–12× rule (take 10×) unless the
    // headers already suggest a higher value; norm-conserving uses 4×.
    const headerRho = rhos.length > 0 ? Math.max(...rhos) : 0;
    const ratio = isPawUs ? 10 : 4;
    const ecutrho = Math.max(headerRho, Math.round(ecutwfc * ratio));
    const kind = kinds.find((k) => k === 'PAW') ?? kinds.find((k) => k === 'US') ?? 'NC';
    return {
      ecutwfc,
      ecutrho,
      kind,
      ratioLabel: isPawUs ? '8–12×' : '4×'
    };
  }, [value.pseudoMap, library]);
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
            <SelectTrigger className='h-8 w-full'>
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
        <label className='flex items-center gap-2'>
          <Checkbox
            checked={value.vdwCorr === 'grimme-d3'}
            onCheckedChange={(c) =>
              update({
                vdwCorr: c === true ? 'grimme-d3' : undefined,
                dftd3Version: c === true ? (value.dftd3Version ?? 4) : undefined
              })
            }
          />
          <span className='text-sm font-medium'>{t('vdwLabel')}</span>
        </label>
        {value.vdwCorr === 'grimme-d3' ? (
          <div className='space-y-1 pl-6'>
            <div className='flex items-center gap-2'>
              <Label className='text-xs'>{t('vdwVersion')}</Label>
              <Select
                value={String(value.dftd3Version ?? 4)}
                onValueChange={(v) => update({ dftd3Version: Number(v) })}
              >
                <SelectTrigger className='h-7 w-56'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='4'>D3-BJ (Becke-Johnson)</SelectItem>
                  <SelectItem value='3'>D3(0) (zero-damping)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className='text-muted-foreground text-[11px]'>{t('vdwHint')}</p>
          </div>
        ) : null}
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
        onLibrary={setLibrary}
      />

      {cutoffSuggestion ? (
        <div className='bg-muted/40 space-y-1 rounded-md border p-2 text-xs'>
          <div className='flex items-center justify-between'>
            <span className='font-medium'>{t('autoCutoffTitle')}</span>
            <Button
              variant='outline'
              size='sm'
              className='h-7'
              onClick={() =>
                update({
                  ecutwfc: cutoffSuggestion.ecutwfc,
                  ecutrho: cutoffSuggestion.ecutrho
                })
              }
            >
              {t('autoCutoffApply')}
            </Button>
          </div>
          <p className='text-muted-foreground'>
            {t('autoCutoffDetail', {
              wfc: cutoffSuggestion.ecutwfc,
              rho: cutoffSuggestion.ecutrho,
              kind: cutoffSuggestion.kind,
              ratio: cutoffSuggestion.ratioLabel
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
