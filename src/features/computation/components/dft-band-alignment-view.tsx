'use client';

/**
 * Band alignment tool. Enter each material's VBM/CBM (eV vs a common reference,
 * e.g. vacuum) and get the offsets, the junction type, and a band diagram — the
 * key PEC descriptor for a WO₃/WS₂-type Type-II heterojunction.
 */
import { IconDatabaseImport } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { computeBandAlignment } from '@/features/computation/band-alignment';
import type { DftEnergyOption } from '@/features/computation/components/dft-analysis-view';
import { cn } from '@/lib/utils';

const W = 620;
const H = 360;
const PAD = { top: 24, right: 90, bottom: 28, left: 52 };

function num(v: string): number {
  return Number.parseFloat(v);
}

function MaterialInputs({
  title,
  name,
  vbm,
  cbm,
  onName,
  onVbm,
  onCbm,
  workflows,
  onPickBands
}: {
  title: string;
  name: string;
  vbm: string;
  cbm: string;
  onName: (v: string) => void;
  onVbm: (v: string) => void;
  onCbm: (v: string) => void;
  workflows: DftEnergyOption[];
  onPickBands: (vbm: number, cbm: number) => void;
}) {
  const withBands = workflows.filter((w) => w.vbmEv != null && w.cbmEv != null);
  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <div className='flex items-center gap-1.5'>
        <Input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={title}
          className='h-8 flex-1 text-sm font-medium'
        />
        {withBands.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                className='size-8 shrink-0'
                title='Điền VBM/CBM từ workflow đã tính'
                aria-label='Điền VBM/CBM từ workflow'
              >
                <IconDatabaseImport className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='max-h-64 overflow-y-auto'>
              {withBands.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => onPickBands(w.vbmEv as number, w.cbmEv as number)}
                  className='gap-3 text-xs'
                >
                  <span className='truncate'>{w.name}</span>
                  <span className='ml-auto font-mono tabular-nums text-muted-foreground'>
                    {(w.vbmEv as number).toFixed(2)} / {(w.cbmEv as number).toFixed(2)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div className='space-y-1'>
          <Label className='text-[11px]'>VBM [eV]</Label>
          <Input
            type='number'
            inputMode='decimal'
            value={vbm}
            onChange={(e) => onVbm(e.target.value)}
            placeholder='-7.50'
            className='h-8 font-mono text-sm tabular-nums'
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-[11px]'>CBM [eV]</Label>
          <Input
            type='number'
            inputMode='decimal'
            value={cbm}
            onChange={(e) => onCbm(e.target.value)}
            placeholder='-4.80'
            className='h-8 font-mono text-sm tabular-nums'
          />
        </div>
      </div>
    </div>
  );
}

export function DftBandAlignmentView({ workflows = [] }: { workflows?: DftEnergyOption[] }) {
  const [nameA, setNameA] = useState('WO₃');
  const [vbmA, setVbmA] = useState('');
  const [cbmA, setCbmA] = useState('');
  const [nameB, setNameB] = useState('WS₂');
  const [vbmB, setVbmB] = useState('');
  const [cbmB, setCbmB] = useState('');

  const result = useMemo(
    () =>
      computeBandAlignment(
        { name: nameA, vbm: num(vbmA), cbm: num(cbmA) },
        { name: nameB, vbm: num(vbmB), cbm: num(cbmB) }
      ),
    [nameA, vbmA, cbmA, nameB, vbmB, cbmB]
  );

  const mats = result
    ? [
        { name: nameA || 'A', vbm: num(vbmA), cbm: num(cbmA) },
        { name: nameB || 'B', vbm: num(vbmB), cbm: num(cbmB) }
      ]
    : [];

  const eLo = result ? Math.min(mats[0]!.vbm, mats[1]!.vbm) - 0.8 : 0;
  const eHi = result ? Math.max(mats[0]!.cbm, mats[1]!.cbm) + 0.8 : 1;
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const yOf = (e: number) => PAD.top + ((eHi - e) / (eHi - eLo)) * plotH;
  const colW = plotW * 0.3;
  const colX = [PAD.left + plotW * 0.08, PAD.left + plotW * 0.55];

  const typeText: Record<string, string> = {
    I: 'Loại I (straddling) — cả electron và lỗ trống dồn về cùng một vật liệu.',
    II: 'Loại II (staggered) — electron và lỗ trống tách sang hai vật liệu → thuận lợi tách điện tích (PEC).',
    III: 'Loại III (broken gap) — vùng cấm không chồng lấn.'
  };

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-lg font-semibold'>Căn chỉnh vùng năng lượng (band alignment)</h1>
        <p className='text-sm text-muted-foreground'>
          Nhập VBM/CBM (eV, cùng mốc tham chiếu — vd chân không) của hai vật liệu để xác định độ
          lệch vùng, loại dị thể (I/II/III) và sơ đồ căn chỉnh.
        </p>
      </div>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]'>
        <div className='space-y-3'>
          <MaterialInputs
            title='Vật liệu A'
            name={nameA}
            vbm={vbmA}
            cbm={cbmA}
            onName={setNameA}
            onVbm={setVbmA}
            onCbm={setCbmA}
            workflows={workflows}
            onPickBands={(v, c) => {
              setVbmA(String(v));
              setCbmA(String(c));
            }}
          />
          <MaterialInputs
            title='Vật liệu B'
            name={nameB}
            vbm={vbmB}
            cbm={cbmB}
            onName={setNameB}
            onVbm={setVbmB}
            onCbm={setCbmB}
            workflows={workflows}
            onPickBands={(v, c) => {
              setVbmB(String(v));
              setCbmB(String(c));
            }}
          />
          {result && (
            <div className='space-y-2 rounded-lg border p-3 text-sm'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>Loại dị thể</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    result.type === 'II'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'bg-muted text-foreground'
                  )}
                >
                  Type {result.type}
                </span>
              </div>
              <div className='grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums'>
                <span className='text-muted-foreground'>ΔE_v</span>
                <span className='text-right'>{result.deltaEv.toFixed(2)} eV</span>
                <span className='text-muted-foreground'>ΔE_c</span>
                <span className='text-right'>{result.deltaEc.toFixed(2)} eV</span>
                <span className='text-muted-foreground'>E_g({nameA || 'A'})</span>
                <span className='text-right'>{result.gapA.toFixed(2)} eV</span>
                <span className='text-muted-foreground'>E_g({nameB || 'B'})</span>
                <span className='text-right'>{result.gapB.toFixed(2)} eV</span>
              </div>
            </div>
          )}
        </div>

        <div className='rounded-lg border p-4'>
          {result && (
            <p
              className={cn(
                'mb-2 rounded-md px-3 py-2 text-xs',
                result.type === 'II'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'bg-muted/50 text-muted-foreground'
              )}
            >
              {typeText[result.type]}
            </p>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} xmlns='http://www.w3.org/2000/svg' className='w-full'>
            <rect width={W} height={H} fill='white' />
            <line
              x1={PAD.left}
              y1={PAD.top}
              x2={PAD.left}
              y2={H - PAD.bottom}
              stroke='currentColor'
              strokeOpacity={0.25}
            />
            <text
              x={14}
              y={PAD.top + plotH / 2}
              fontSize={11}
              fill='currentColor'
              transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
              textAnchor='middle'
            >
              E (eV)
            </text>
            {result &&
              mats.map((m, i) => {
                const x = colX[i]!;
                const vY = yOf(m.vbm);
                const cY = yOf(m.cbm);
                return (
                  <g key={i}>
                    {/* valence band (fills below VBM) */}
                    <rect
                      x={x}
                      y={vY}
                      width={colW}
                      height={H - PAD.bottom - vY}
                      fill='hsl(217 91% 60%)'
                      fillOpacity={0.28}
                    />
                    {/* conduction band (fills above CBM) */}
                    <rect
                      x={x}
                      y={PAD.top}
                      width={colW}
                      height={cY - PAD.top}
                      fill='hsl(217 91% 60%)'
                      fillOpacity={0.14}
                    />
                    {/* edges */}
                    <line
                      x1={x}
                      y1={vY}
                      x2={x + colW}
                      y2={vY}
                      stroke='hsl(217 91% 45%)'
                      strokeWidth={2}
                    />
                    <line
                      x1={x}
                      y1={cY}
                      x2={x + colW}
                      y2={cY}
                      stroke='hsl(217 91% 45%)'
                      strokeWidth={2}
                    />
                    <text
                      x={x + colW / 2}
                      y={H - PAD.bottom + 16}
                      textAnchor='middle'
                      fontSize={11}
                      fill='currentColor'
                    >
                      {m.name}
                    </text>
                    <text
                      x={x + colW + 4}
                      y={vY + 3}
                      fontSize={9.5}
                      fill='currentColor'
                      fillOpacity={0.8}
                    >
                      {m.vbm.toFixed(2)}
                    </text>
                    <text
                      x={x + colW + 4}
                      y={cY + 3}
                      fontSize={9.5}
                      fill='currentColor'
                      fillOpacity={0.8}
                    >
                      {m.cbm.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            {/* offset connectors */}
            {result && (
              <g>
                <line
                  x1={colX[0]! + colW}
                  y1={yOf(mats[0]!.vbm)}
                  x2={colX[1]!}
                  y2={yOf(mats[1]!.vbm)}
                  stroke='hsl(38 92% 50%)'
                  strokeDasharray='3 3'
                  strokeOpacity={0.7}
                />
                <line
                  x1={colX[0]! + colW}
                  y1={yOf(mats[0]!.cbm)}
                  x2={colX[1]!}
                  y2={yOf(mats[1]!.cbm)}
                  stroke='hsl(38 92% 50%)'
                  strokeDasharray='3 3'
                  strokeOpacity={0.7}
                />
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
