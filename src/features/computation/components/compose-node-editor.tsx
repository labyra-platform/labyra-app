/**
 * Composer node editor — renders the editable QE parameters for one pipeline
 * node, driven by editableKeys(calcType). Numeric fields are controlled so the
 * live JSON preview updates as you type.
 *
 * @phase R315-composer
 */
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { editableKeys, type ComposeNode, type NodeParams } from '../compose-model';

interface Props {
  node: ComposeNode;
  onChange: (params: NodeParams) => void;
}

export function ComposeNodeEditor({ node, onChange }: Props) {
  const keys = editableKeys(node.calcType);
  const p = node.params;
  const set = (patch: Partial<NodeParams>) => onChange({ ...p, ...patch });
  const num = (key: keyof NodeParams, value: number, step: string) => (
    <Input
      type='number'
      step={step}
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) set({ [key]: n } as Partial<NodeParams>);
      }}
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

      {keys.length === 0 ? (
        <p className='text-muted-foreground text-xs'>No editable parameters.</p>
      ) : (
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
              {num('degauss', p.degauss, '0.001')}
            </div>
          ) : null}
          {keys.includes('convThr') ? (
            <div className='space-y-1'>
              <Label className='text-xs'>conv_thr</Label>
              {num('convThr', p.convThr, 'any')}
            </div>
          ) : null}
          {keys.includes('emin') ? (
            <div className='space-y-1'>
              <Label className='text-xs'>Emin (eV)</Label>
              {num('emin', p.emin, '0.1')}
            </div>
          ) : null}
          {keys.includes('emax') ? (
            <div className='space-y-1'>
              <Label className='text-xs'>Emax (eV)</Label>
              {num('emax', p.emax, '0.1')}
            </div>
          ) : null}
          {keys.includes('deltaE') ? (
            <div className='space-y-1'>
              <Label className='text-xs'>DeltaE (eV)</Label>
              {num('deltaE', p.deltaE, '0.005')}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
