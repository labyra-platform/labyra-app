/**
 * Composer node editor — renders the editable QE parameters for one pipeline
 * node. Basic params come from editableKeys(calcType); an "Advanced" reveal
 * exposes nbnd / smearing type / mixing_beta / electron_maxstep for pw.x nodes
 * (all verified against the worker pw.in.j2 template). Numeric fields are
 * controlled so the live JSON preview updates as you type.
 *
 * @phase R315-composer
 */
'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  advancedKeys,
  editableKeys,
  type ComposeNode,
  type NodeParams,
  type SmearingType
} from '../compose-model';

interface Props {
  node: ComposeNode;
  onChange: (params: NodeParams) => void;
}

const SMEARING: SmearingType[] = [
  'gaussian',
  'methfessel-paxton',
  'marzari-vanderbilt',
  'fermi-dirac'
];

/**
 * Numeric field backed by a raw string so scientific notation (e.g. "1e-8") and
 * partial decimals ("0.") type cleanly. A controlled type="number" input can't do
 * this: the browser returns "" for an in-progress "1e", collapsing the value to 0.
 * The model is only updated once the text parses to a finite number.
 */
function NumberField({
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

export function ComposeNodeEditor({ node, onChange }: Props) {
  const [adv, setAdv] = useState(false);
  const keys = editableKeys(node.calcType);
  const advKeys = advancedKeys(node.calcType);
  const p = node.params;
  const set = (patch: Partial<NodeParams>) => onChange({ ...p, ...patch });
  const num = (key: keyof NodeParams, value: number) => (
    <NumberField
      value={value}
      onCommit={(n) => set({ [key]: n } as Partial<NodeParams>)}
      className='h-8'
    />
  );

  return (
    <div className='rounded-md border p-3'>
      <div className='mb-2 flex items-center gap-2'>
        <span className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'>{node.id}</span>
        <span className='text-sm font-medium'>{node.calcType}</span>
        {node.dependsOn.length > 0 ? (
          <span className='text-muted-foreground text-xs'>← {node.dependsOn.join(', ')}</span>
        ) : null}
      </div>

      {keys.length === 0 && advKeys.length === 0 ? (
        <p className='text-muted-foreground text-xs'>No editable parameters.</p>
      ) : (
        <>
          {keys.length > 0 ? (
            <div className='grid grid-cols-2 gap-x-3 gap-y-2'>
              {keys.includes('kgrid') ? (
                <div className='col-span-2 space-y-1'>
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
              ) : null}

              {keys.includes('occupations') ? (
                <div className='space-y-1'>
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
              ) : null}

              {keys.includes('degauss') ? (
                <div className='space-y-1'>
                  <Label className='text-xs'>degauss (Ry)</Label>
                  {num('degauss', p.degauss)}
                </div>
              ) : null}
              {keys.includes('convThr') ? (
                <div className='space-y-1'>
                  <Label className='text-xs'>conv_thr</Label>
                  {num('convThr', p.convThr)}
                </div>
              ) : null}
              {keys.includes('emin') ? (
                <div className='space-y-1'>
                  <Label className='text-xs'>Emin (eV)</Label>
                  {num('emin', p.emin)}
                </div>
              ) : null}
              {keys.includes('emax') ? (
                <div className='space-y-1'>
                  <Label className='text-xs'>Emax (eV)</Label>
                  {num('emax', p.emax)}
                </div>
              ) : null}
              {keys.includes('deltaE') ? (
                <div className='space-y-1'>
                  <Label className='text-xs'>DeltaE (eV)</Label>
                  {num('deltaE', p.deltaE)}
                </div>
              ) : null}
            </div>
          ) : null}

          {advKeys.length > 0 ? (
            <div className='mt-2'>
              <button
                type='button'
                onClick={() => setAdv((v) => !v)}
                className='text-muted-foreground text-xs hover:underline'
              >
                {adv ? '− Advanced' : '+ Advanced'}
              </button>
              {adv ? (
                <div className='mt-2 grid grid-cols-2 gap-x-3 gap-y-2'>
                  <div className='space-y-1'>
                    <Label className='text-xs'>nbnd (0 = auto)</Label>
                    {num('nbnd', p.nbnd)}
                  </div>
                  {p.occupations === 'smearing' ? (
                    <div className='space-y-1'>
                      <Label className='text-xs'>smearing</Label>
                      <Select
                        value={p.smearing}
                        onValueChange={(v) => set({ smearing: v as SmearingType })}
                      >
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
                  ) : null}
                  <div className='space-y-1'>
                    <Label className='text-xs'>mixing_beta</Label>
                    {num('mixingBeta', p.mixingBeta)}
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-xs'>electron_maxstep (0 = default)</Label>
                    {num('electronMaxstep', p.electronMaxstep)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
