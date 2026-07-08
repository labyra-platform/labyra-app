'use client';

/**
 * HER free-energy analysis (ΔG_H* via CHE). The user supplies three DFT total
 * energies — clean slab, slab + adsorbed H, and gas-phase H₂ — and gets ΔG(H*)
 * plus the H⁺+e⁻ → H* → ½H₂ free-energy step diagram. Path:
 * /[locale]/dashboard/computation/analysis.
 */
import { IconDownload, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  computeHer,
  DEFAULT_H_CORRECTION_EV,
  herDiagramLevels,
  RY_TO_EV
} from '@/features/computation/her';
import { cn } from '@/lib/utils';

const W = 620;
const H = 340;
const PAD = { top: 32, right: 28, bottom: 44, left: 56 };

function EnergyField({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className='space-y-1'>
      <Label className='text-xs font-medium'>{label}</Label>
      <Input
        type='number'
        inputMode='decimal'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='0.0000'
        className='h-8 font-mono text-sm tabular-nums'
      />
      <p className='text-[11px] text-muted-foreground'>{hint}</p>
    </div>
  );
}

export function DftHerAnalysisView() {
  const [unit, setUnit] = useState<'Ry' | 'eV'>('Ry');
  const [eSlab, setESlab] = useState('');
  const [eSlabH, setESlabH] = useState('');
  const [eH2, setEH2] = useState('');
  const [nH, setNH] = useState('1');
  const [corr, setCorr] = useState(String(DEFAULT_H_CORRECTION_EV));
  const svgRef = useRef<SVGSVGElement>(null);

  const result = useMemo(
    () =>
      computeHer({
        eSlab: Number.parseFloat(eSlab),
        eSlabH: Number.parseFloat(eSlabH),
        eH2: Number.parseFloat(eH2),
        nH: Number.parseFloat(nH),
        unit,
        correction: Number.parseFloat(corr)
      }),
    [eSlab, eSlabH, eH2, nH, unit, corr]
  );

  const levels = result ? herDiagramLevels(result.deltaGH) : herDiagramLevels(0);
  const gs = levels.map((l) => l.g);
  const gMin = Math.min(0, ...gs);
  const gMax = Math.max(0, ...gs);
  const span = Math.max(gMax - gMin, 0.4);
  const yPad = span * 0.25;
  const lo = gMin - yPad;
  const hi = gMax + yPad;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const yOf = (g: number) => PAD.top + ((hi - g) / (hi - lo)) * plotH;
  const zeroY = yOf(0);

  // Three plateaus across the width, each a short horizontal segment.
  const seg = plotW / 3;
  const platW = seg * 0.55;
  const plateaus = levels.map((l, i) => {
    const cx = PAD.left + seg * (i + 0.5);
    return { x1: cx - platW / 2, x2: cx + platW / 2, y: yOf(l.g), label: l.label, g: l.g };
  });
  const connectors = plateaus.slice(0, -1).map((p, i) => {
    const n = plateaus[i + 1];
    return { x1: p.x2, y1: p.y, x2: n?.x1 ?? p.x2, y2: n?.y ?? p.y };
  });

  const downloadSvg = () => {
    const el = svgRef.current;
    if (!el) return;
    const blob = new Blob([new XMLSerializer().serializeToString(el)], {
      type: 'image/svg+xml'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'her-free-energy-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const bindingText: Record<string, string> = {
    optimal: 'Hấp phụ H gần lý tưởng — hoạt tính HER cao (ΔG ≈ 0).',
    weak: 'ΔG(H*) > 0: hấp phụ H quá yếu — bước Volmer/Heyrovsky bị hạn chế.',
    strong: 'ΔG(H*) < 0: hấp phụ H quá mạnh — bước giải hấp (Tafel/Heyrovsky) bị hạn chế.'
  };

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-lg font-semibold'>Phân tích HER — ΔG(H*)</h1>
        <p className='text-sm text-muted-foreground'>
          Điện cực hydro tính toán (CHE). Nhập năng lượng tổng DFT của slab sạch, slab + H hấp phụ,
          và phân tử H₂ để tính ΔG(H*) và sơ đồ năng lượng tự do H⁺+e⁻ → H* → ½H₂.
        </p>
      </div>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]'>
        {/* Inputs */}
        <div className='space-y-3 rounded-lg border p-4'>
          <div className='flex items-center justify-between'>
            <Label className='text-xs font-medium'>Đơn vị năng lượng</Label>
            <div className='inline-flex overflow-hidden rounded-md border text-xs'>
              {(['Ry', 'eV'] as const).map((u) => (
                <button
                  key={u}
                  type='button'
                  onClick={() => setUnit(u)}
                  className={cn(
                    'px-2.5 py-1 transition-colors',
                    unit === u
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <EnergyField
            label={`E(slab sạch) [${unit}]`}
            hint='Năng lượng tổng slab bề mặt sạch (relax xong).'
            value={eSlab}
            onChange={setESlab}
          />
          <EnergyField
            label={`E(slab + nH) [${unit}]`}
            hint='Năng lượng tổng slab có n nguyên tử H hấp phụ.'
            value={eSlabH}
            onChange={setESlabH}
          />
          <EnergyField
            label={`E(H₂) [${unit}]`}
            hint='Năng lượng phân tử H₂ pha khí (cùng ecutwfc).'
            value={eH2}
            onChange={setEH2}
          />
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label className='text-xs font-medium'>n(H)</Label>
              <Input
                type='number'
                inputMode='numeric'
                min={1}
                value={nH}
                onChange={(e) => setNH(e.target.value)}
                className='h-8 font-mono text-sm tabular-nums'
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-xs font-medium'>ΔZPE−TΔS [eV]</Label>
              <Input
                type='number'
                inputMode='decimal'
                step={0.01}
                value={corr}
                onChange={(e) => setCorr(e.target.value)}
                className='h-8 font-mono text-sm tabular-nums'
              />
            </div>
          </div>
          <p className='flex items-start gap-1.5 text-[11px] text-muted-foreground'>
            <IconInfoCircle className='mt-px size-3.5 shrink-0' />
            <span>
              Hằng số hiệu chỉnh ~0.24 eV cho H* (Nørskov 2005) — phụ thuộc hệ, chỉnh theo tính toán
              tần số của bạn. 1 Ry = {RY_TO_EV.toFixed(4)} eV.
            </span>
          </p>
        </div>

        {/* Result + diagram */}
        <div className='space-y-3 rounded-lg border p-4'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <div className='text-xs text-muted-foreground'>ΔG(H*) trên mỗi H</div>
              {result ? (
                <div
                  className={cn(
                    'font-mono text-3xl font-semibold tabular-nums',
                    result.nearIdeal ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                  )}
                >
                  {result.deltaGH >= 0 ? '+' : ''}
                  {result.deltaGH.toFixed(3)} <span className='text-lg'>eV</span>
                </div>
              ) : (
                <div className='font-mono text-3xl font-semibold text-muted-foreground'>—</div>
              )}
              {result && (
                <div className='mt-0.5 text-xs text-muted-foreground'>
                  ΔE(H*) = {result.deltaEH.toFixed(3)} eV · +{Number.parseFloat(corr).toFixed(2)} eV
                  hiệu chỉnh
                </div>
              )}
            </div>
            <button
              type='button'
              onClick={downloadSvg}
              disabled={!result}
              className='inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40'
            >
              <IconDownload className='size-3.5' />
              SVG
            </button>
          </div>

          {result && (
            <div
              className={cn(
                'rounded-md px-3 py-2 text-xs',
                result.binding === 'optimal'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
              )}
            >
              {bindingText[result.binding]}
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            xmlns='http://www.w3.org/2000/svg'
            className='w-full'
            role='img'
            aria-label='Sơ đồ năng lượng tự do HER'
          >
            <rect width={W} height={H} fill='white' />
            {/* y axis */}
            <line
              x1={PAD.left}
              y1={PAD.top}
              x2={PAD.left}
              y2={H - PAD.bottom}
              stroke='currentColor'
              strokeOpacity={0.25}
            />
            {/* zero reference */}
            <line
              x1={PAD.left}
              y1={zeroY}
              x2={W - PAD.right}
              y2={zeroY}
              stroke='currentColor'
              strokeOpacity={0.2}
              strokeDasharray='4 4'
            />
            <text x={PAD.left - 8} y={zeroY + 3} textAnchor='end' fontSize={10} fill='currentColor'>
              0
            </text>
            <text
              x={14}
              y={PAD.top + plotH / 2}
              fontSize={11}
              fill='currentColor'
              transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
              textAnchor='middle'
            >
              ΔG (eV)
            </text>
            {/* connectors */}
            {connectors.map((c, i) => (
              <line
                key={`c-${i}`}
                x1={c.x1}
                y1={c.y1}
                x2={c.x2}
                y2={c.y2}
                stroke='hsl(217 91% 60%)'
                strokeOpacity={0.45}
                strokeDasharray='3 3'
              />
            ))}
            {/* plateaus */}
            {plateaus.map((p, i) => (
              <g key={`p-${i}`}>
                <line
                  x1={p.x1}
                  y1={p.y}
                  x2={p.x2}
                  y2={p.y}
                  stroke='hsl(217 91% 55%)'
                  strokeWidth={3}
                  strokeLinecap='round'
                />
                <text
                  x={(p.x1 + p.x2) / 2}
                  y={H - PAD.bottom + 16}
                  textAnchor='middle'
                  fontSize={11}
                  fill='currentColor'
                >
                  {p.label}
                </text>
                {i === 1 && result && (
                  <text
                    x={(p.x1 + p.x2) / 2}
                    y={p.y + (p.g >= 0 ? -8 : 16)}
                    textAnchor='middle'
                    fontSize={11}
                    fontWeight={600}
                    fill='hsl(217 91% 45%)'
                  >
                    {result.deltaGH >= 0 ? '+' : ''}
                    {result.deltaGH.toFixed(2)}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className='rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground'>
        <p className='mb-1 font-medium text-foreground'>Phương pháp</p>
        <p>
          ΔE(H*) = [E(slab+nH) − E(slab)]/n − ½ E(H₂); ΔG(H*) = ΔE(H*) + (ΔZPE − TΔS). Tại U = 0 V
          vs RHE (pH 0), CHE đặt μ(H⁺)+μ(e⁻) = ½μ(H₂) nên hai đầu sơ đồ đều bằng 0 và ΔG(H*) quyết
          định hoạt tính: |ΔG(H*)| càng gần 0 càng tốt. Dùng cùng ecutwfc/k-grid cho cả ba tính
          toán; H₂ nên đặt trong ô đủ lớn (≥10 Å chân không) và tính spin-đúng.
        </p>
      </div>
    </div>
  );
}
