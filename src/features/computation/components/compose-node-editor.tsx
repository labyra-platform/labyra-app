/**
 * Composer node editor — the side panel for one pipeline node. Header carries the
 * unit id, an "execute" selector (change calc type, grouped by QE executable) and
 * clone / delete actions; the body renders the editable QE parameters for the
 * node's calc type (editableKeys + an Advanced reveal for pw.x). Numeric fields
 * are string-backed so scientific notation types cleanly.
 *
 * @phase R315-composer (R334 actions + execute selector)
 */
'use client';

import { IconCopy, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { DftCalcType } from '@/types/dft';
import {
  CALC_GROUPS,
  EXE_OF,
  FLAVORS,
  paramBlocks,
  type CellDofree,
  type CellDynamics,
  type ComposeNode,
  type Diagonalization,
  type IonDynamics,
  type MixingMode,
  type NodeParams,
  type ParamKey,
  type RestartMode,
  type SmearingType
} from '../compose-model';

interface Props {
  node: ComposeNode;
  canDelete: boolean;
  onChange: (params: NodeParams) => void;
  onChangeType: (calcType: DftCalcType) => void;
  onChangeFlavor: (flavor: string) => void;
  onClone: () => void;
  onDelete: () => void;
}

const SMEARING: SmearingType[] = [
  'gaussian',
  'methfessel-paxton',
  'marzari-vanderbilt',
  'fermi-dirac'
];

const RESTART: RestartMode[] = ['from_scratch', 'restart'];
const MIXING_MODE: MixingMode[] = ['plain', 'TF', 'local-TF'];
const DIAGONALIZATION: Diagonalization[] = ['david', 'cg', 'ppcg', 'rmm-davidson'];
const ION_DYNAMICS: IonDynamics[] = ['bfgs', 'damp', 'fire'];
const CELL_DYNAMICS: CellDynamics[] = ['bfgs', 'sd', 'damp-pr'];
const CELL_DOFREE: CellDofree[] = [
  'all',
  'x',
  'y',
  'z',
  'xy',
  'xz',
  'yz',
  '2Dxy',
  'shape',
  'volume'
];

/**
 * Numeric field backed by a raw string so scientific notation (e.g. "1e-8") and
 * partial decimals ("0.") type cleanly. A controlled type="number" input can't do
 * this: the browser returns "" for an in-progress "1e", collapsing the value to 0.
 * The model is only updated once the text parses to a finite number.
 */
export function NumberField({
  value,
  onCommit,
  className
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => {
    // Resync when the model value changes from outside (archetype switch / reset);
    // leave the user's in-progress text alone when it already equals the value.
    if (Number(raw) !== value) setRaw(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      type='text'
      inputMode='text'
      value={raw}
      onChange={(e) => {
        const s = e.target.value;
        setRaw(s);
        const n = Number(s);
        if (s.trim() !== '' && Number.isFinite(n)) onCommit(n);
      }}
      className={className}
    />
  );
}

export function ComposeNodeEditor({
  node,
  canDelete,
  onChange,
  onChangeType,
  onChangeFlavor,
  onClone,
  onDelete
}: Props) {
  const blocks = paramBlocks(node.calcType);
  const p = node.params;
  const set = (patch: Partial<NodeParams>) => onChange({ ...p, ...patch });
  const num = (key: keyof NodeParams, value: number) => (
    <NumberField
      value={value}
      onCommit={(n) => set({ [key]: n } as Partial<NodeParams>)}
      className='h-8'
    />
  );
  const sel = <T extends string>(key: keyof NodeParams, value: T, options: readonly T[]) => (
    <Select value={value} onValueChange={(v) => set({ [key]: v } as Partial<NodeParams>)}>
      <SelectTrigger className='h-8'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  function renderParam(key: ParamKey) {
    switch (key) {
      case 'kgrid':
        return (
          <div key='kgrid' className='col-span-2 space-y-1'>
            <Label className='text-xs'>k-grid</Label>
            <div className='flex gap-1'>
              {[0, 1, 2].map((i) => (
                <Input
                  key={i}
                  type='number'
                  min='1'
                  value={String(p.kgrid[i])}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (Number.isFinite(n) && n >= 1) {
                      const g = [...p.kgrid] as [number, number, number];
                      g[i] = n;
                      set({ kgrid: g });
                    }
                  }}
                  className='h-8 w-16'
                />
              ))}
            </div>
          </div>
        );
      case 'occupations':
        return (
          <div key='occupations' className='space-y-1'>
            <Label className='text-xs'>occupations</Label>
            <Select
              value={p.occupations}
              onValueChange={(v) => set({ occupations: v as NodeParams['occupations'] })}
            >
              <SelectTrigger className='h-8'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='fixed'>fixed</SelectItem>
                <SelectItem value='smearing'>smearing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      case 'smearing':
        return p.occupations === 'smearing' ? (
          <div key='smearing' className='space-y-1'>
            <Label className='text-xs'>smearing</Label>
            <Select value={p.smearing} onValueChange={(v) => set({ smearing: v as SmearingType })}>
              <SelectTrigger className='h-8'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMEARING.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null;
      case 'degauss':
        return p.occupations === 'smearing' ? (
          <div key='degauss' className='space-y-1'>
            <Label className='text-xs'>degauss (Ry)</Label>
            {num('degauss', p.degauss)}
          </div>
        ) : null;
      case 'convThr':
        return (
          <div key='convThr' className='space-y-1'>
            <Label className='text-xs'>conv_thr</Label>
            {num('convThr', p.convThr)}
          </div>
        );
      case 'mixingBeta':
        return (
          <div key='mixingBeta' className='space-y-1'>
            <Label className='text-xs'>mixing_beta</Label>
            {num('mixingBeta', p.mixingBeta)}
          </div>
        );
      case 'electronMaxstep':
        return (
          <div key='electronMaxstep' className='space-y-1'>
            <Label className='text-xs'>electron_maxstep (0 = default)</Label>
            {num('electronMaxstep', p.electronMaxstep)}
          </div>
        );
      case 'nbnd':
        return (
          <div key='nbnd' className='space-y-1'>
            <Label className='text-xs'>nbnd (0 = auto)</Label>
            {num('nbnd', p.nbnd)}
          </div>
        );
      case 'emin':
        return (
          <div key='emin' className='space-y-1'>
            <Label className='text-xs'>Emin (eV)</Label>
            {num('emin', p.emin)}
          </div>
        );
      case 'emax':
        return (
          <div key='emax' className='space-y-1'>
            <Label className='text-xs'>Emax (eV)</Label>
            {num('emax', p.emax)}
          </div>
        );
      case 'deltaE':
        return (
          <div key='deltaE' className='space-y-1'>
            <Label className='text-xs'>DeltaE (eV)</Label>
            {num('deltaE', p.deltaE)}
          </div>
        );
      case 'restartMode':
        return (
          <div key='restartMode' className='space-y-1'>
            <Label className='text-xs'>restart_mode</Label>
            {sel('restartMode', p.restartMode, RESTART)}
          </div>
        );
      case 'nstep':
        return (
          <div key='nstep' className='space-y-1'>
            <Label className='text-xs'>nstep (0 = default)</Label>
            {num('nstep', p.nstep)}
          </div>
        );
      case 'etotConvThr':
        return (
          <div key='etotConvThr' className='space-y-1'>
            <Label className='text-xs'>etot_conv_thr (0 = default)</Label>
            {num('etotConvThr', p.etotConvThr)}
          </div>
        );
      case 'forcConvThr':
        return (
          <div key='forcConvThr' className='space-y-1'>
            <Label className='text-xs'>forc_conv_thr (0 = default)</Label>
            {num('forcConvThr', p.forcConvThr)}
          </div>
        );
      case 'nspin':
        return (
          <div key='nspin' className='space-y-1'>
            <Label className='text-xs'>nspin</Label>
            <Select
              value={String(p.nspin)}
              onValueChange={(v) => set({ nspin: Number(v) as 1 | 2 })}
            >
              <SelectTrigger className='h-8'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='1'>1 (non-polarized)</SelectItem>
                <SelectItem value='2'>2 (LSDA)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      case 'mixingMode':
        return (
          <div key='mixingMode' className='space-y-1'>
            <Label className='text-xs'>mixing_mode</Label>
            {sel('mixingMode', p.mixingMode, MIXING_MODE)}
          </div>
        );
      case 'diagonalization':
        return (
          <div key='diagonalization' className='space-y-1'>
            <Label className='text-xs'>diagonalization</Label>
            {sel('diagonalization', p.diagonalization, DIAGONALIZATION)}
          </div>
        );
      case 'ionDynamics':
        return (
          <div key='ionDynamics' className='space-y-1'>
            <Label className='text-xs'>ion_dynamics</Label>
            {sel('ionDynamics', p.ionDynamics, ION_DYNAMICS)}
          </div>
        );
      case 'bfgsNdim':
        return (
          <div key='bfgsNdim' className='space-y-1'>
            <Label className='text-xs'>bfgs_ndim (0 = default)</Label>
            {num('bfgsNdim', p.bfgsNdim)}
          </div>
        );
      case 'cellDynamics':
        return (
          <div key='cellDynamics' className='space-y-1'>
            <Label className='text-xs'>cell_dynamics</Label>
            {sel('cellDynamics', p.cellDynamics, CELL_DYNAMICS)}
          </div>
        );
      case 'press':
        return (
          <div key='press' className='space-y-1'>
            <Label className='text-xs'>press (kbar)</Label>
            {num('press', p.press)}
          </div>
        );
      case 'cellDofree':
        return (
          <div key='cellDofree' className='space-y-1'>
            <Label className='text-xs'>cell_dofree</Label>
            {sel('cellDofree', p.cellDofree, CELL_DOFREE)}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <div className='flex items-center gap-2'>
        <span className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'>{node.id}</span>
        <Select value={node.calcType} onValueChange={(v) => onChangeType(v as DftCalcType)}>
          <SelectTrigger className='h-8 flex-1' aria-label='Execute'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALC_GROUPS.map((g) => (
              <SelectGroup key={g.exe}>
                <SelectLabel className='font-mono text-xs'>{g.exe}</SelectLabel>
                {g.types.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {ct}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button variant='ghost' size='icon' className='size-8' onClick={onClone} aria-label='Clone'>
          <IconCopy className='size-4' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className='text-destructive size-8'
          disabled={!canDelete}
          onClick={onDelete}
          aria-label='Delete'
        >
          <IconTrash className='size-4' />
        </Button>
      </div>
      <div className='text-muted-foreground flex items-center justify-between text-xs'>
        <span className='font-mono'>{EXE_OF[node.calcType]}</span>
        {node.dependsOn.length > 0 ? <span>← {node.dependsOn.join(', ')}</span> : null}
      </div>

      {FLAVORS[node.calcType] ? (
        <div className='space-y-1'>
          <Label className='text-xs'>Flavor</Label>
          <Select value={node.flavor ?? ''} onValueChange={onChangeFlavor}>
            <SelectTrigger className='h-8' aria-label='Flavor'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLAVORS[node.calcType]?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <p className='text-muted-foreground border-t pt-3 text-xs'>No editable parameters.</p>
      ) : (
        blocks.map((block) => (
          <div key={block.name} className='space-y-2 border-t pt-3'>
            <p className='text-muted-foreground font-mono text-xs font-medium'>{block.name}</p>
            <div className='grid grid-cols-2 gap-x-3 gap-y-3'>
              {block.keys.map((key) => renderParam(key))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
