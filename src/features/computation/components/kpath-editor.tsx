/**
 * KpathEditor — compact high-symmetry k-path editor for a `bands` node. Fetches
 * the lattice's BZ points + a default path from /api/dft/kpath (seekpath), then
 * lets the user reorder / add / remove points and set the step count per segment.
 * No 3D BZ diagram (kept deliberately compact); the path feeds K_POINTS {crystal_b}.
 *
 * @phase R339-kpath-editor
 */
'use client';

import { IconArrowDown, IconArrowUp, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
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
import type { BandsPathPoint } from '@/features/computation/bands-path';

type Coords = Record<string, [number, number, number]>;

function displayPoint(label: string): string {
  return label === 'GAMMA' ? 'Γ' : label.replace('_', '');
}

export function KpathEditor({
  structure,
  path,
  onChange
}: {
  structure: unknown;
  path: BandsPathPoint[] | undefined;
  onChange: (path: BandsPathPoint[]) => void;
}) {
  const [coords, setCoords] = useState<Coords>({});
  const [bravais, setBravais] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!structure) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/dft/kpath', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structure })
        });
        const data = (await res.json().catch(() => ({}))) as {
          point_coords?: Coords;
          path?: BandsPathPoint[];
          bravais?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Could not compute BZ path');
          return;
        }
        setCoords(data.point_coords ?? {});
        setBravais(data.bravais ?? null);
        // Seed the node's path from seekpath's default the first time (the node
        // starts without one; until then buildPwParams falls back to the HEX path).
        if ((!path || path.length === 0) && data.path && data.path.length > 0) {
          onChange(data.path);
        }
      } catch {
        if (!cancelled) setError('Could not compute BZ path');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure]);

  const rows = path ?? [];
  const labels = Object.keys(coords);

  function setLabel(i: number, label: string) {
    const c = coords[label];
    if (!c) return;
    onChange(rows.map((pt, idx) => (idx === i ? { ...pt, label, coords: c } : pt)));
  }
  function setSteps(i: number, npoints: number) {
    onChange(rows.map((pt, idx) => (idx === i ? { ...pt, npoints } : pt)));
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function add() {
    const label = labels[0];
    if (!label) return;
    onChange([...rows, { label, coords: coords[label], npoints: 20 }]);
  }

  return (
    <div className='space-y-2 rounded-lg border p-4'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>k-path</span>
        <span className='text-muted-foreground text-xs'>
          {loading ? (
            <IconLoader2 className='inline size-3.5 animate-spin' />
          ) : bravais ? (
            `Brillouin zone: ${bravais}`
          ) : null}
        </span>
      </div>

      {error ? (
        <p className='text-muted-foreground text-xs'>{error} — using the default hexagonal path.</p>
      ) : labels.length === 0 && !loading ? (
        <p className='text-muted-foreground text-xs'>Select a structure to edit the path.</p>
      ) : (
        <>
          <div className='space-y-1.5'>
            {rows.map((pt, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className='flex items-center gap-1.5'>
                <Select value={pt.label} onValueChange={(v) => setLabel(i, v)}>
                  <SelectTrigger className='h-8 flex-1' aria-label='k-point'>
                    <SelectValue>{displayPoint(pt.label)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {labels.map((l) => (
                      <SelectItem key={l} value={l}>
                        {displayPoint(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type='number'
                  min={1}
                  value={pt.npoints}
                  onChange={(e) => setSteps(i, Math.max(1, Number(e.target.value) || 1))}
                  className='h-8 w-20'
                  aria-label='steps'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label='Move up'
                >
                  <IconArrowUp className='size-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label='Move down'
                >
                  <IconArrowDown className='size-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='text-destructive size-8'
                  disabled={rows.length <= 2}
                  onClick={() => remove(i)}
                  aria-label='Remove'
                >
                  <IconTrash className='size-4' />
                </Button>
              </div>
            ))}
          </div>
          <div className='flex items-center justify-between pt-1'>
            <Button variant='outline' size='sm' onClick={add} disabled={labels.length === 0}>
              <IconPlus className='mr-1 size-4' />
              Add point
            </Button>
            <Label className='text-muted-foreground text-xs'>steps = points to next</Label>
          </div>
        </>
      )}
    </div>
  );
}
