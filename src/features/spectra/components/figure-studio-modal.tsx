'use client';

/**
 * FigureStudioModal — full-screen figure editor.
 *
 * Left: accordion of controls (Axes / Color / Line / Peaks) editing a
 * FigureConfig. Right: live Plotly preview (reuses SpectrumChart, controlled).
 * Footer: quick export (Plotly SVG/PNG, client) + publication export (matplotlib
 * worker, exact journal specs). Preview is Plotly (fast); publication file comes
 * from the worker so it matches journal specs.
 *
 * @phase R206 (Figure Studio)
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ColorControl } from '@/features/spectra/components/color-control';
import {
  type FigureCapabilities,
  type FigureConfig,
  type LineStyle,
  type PeakLabelMode,
  setTrace
} from '@/features/spectra/figure-config';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { SpectrumParsedData } from '@/types/spectra-analysis';

const PUBLISHERS: Array<{ key: string; label: string }> = [
  { key: 'nature', label: 'Nature (89 mm)' },
  { key: 'acs', label: 'ACS (82.6 mm)' },
  { key: 'elsevier', label: 'Elsevier (90 mm)' },
  { key: 'rsc', label: 'RSC (83 mm)' }
];

function peakXValues(parsed: SpectrumParsedData): Array<Record<string, number>> {
  if (!('peaks' in parsed) || !parsed.peaks) return [];
  return parsed.peaks as unknown as Array<Record<string, number>>;
}

interface FigureStudioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsed: SpectrumParsedData;
  measurementId?: string;
  config: FigureConfig;
  onConfigChange: (next: FigureConfig) => void;
  /** which controls the chart supports; defaults to single-curve spectrum. */
  capabilities?: FigureCapabilities;
  /**
   * Render the chart for the given config. Any controlled chart works (single
   * curve, two-axis DRS/TGA, Tauc) — the modal doesn't know the technique.
   */
  renderChart: (config: FigureConfig) => React.ReactNode;
}

/** A numeric input that maps "" → null (auto) and a number otherwise. */
function NumberOrAuto({
  value,
  onChange,
  placeholder
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  return (
    <Input
      type='number'
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className='h-8 text-xs'
    />
  );
}

export function FigureStudioModal({
  open,
  onOpenChange,
  parsed,
  measurementId,
  config,
  onConfigChange,
  capabilities = { peaks: true, secondaryAxis: false },
  renderChart
}: FigureStudioModalProps) {
  const gdRef = useRef<HTMLElement | null>(null);
  const [publisher, setPublisher] = useState('nature');
  const [busy, setBusy] = useState<'svg' | 'png' | 'pub' | null>(null);
  const canLabelGroups = parsed.spectrum_type === 'ftir';

  const set = <K extends keyof FigureConfig>(key: K, value: FigureConfig[K]) =>
    onConfigChange({ ...config, [key]: value });

  const filenameBase = `spectrum_${parsed.spectrum_type}`;

  const quickDownload = async (format: 'svg' | 'png') => {
    const gd = gdRef.current;
    if (!gd) return;
    setBusy(format);
    try {
      // Pre-built bundle (the one react-plotly.js uses) — avoids the glslify
      // WebGL dep that breaks the Turbopack client build.
      // @ts-expect-error -- plotly.js/dist/plotly has no type declarations
      const mod = (await import('plotly.js/dist/plotly')) as {
        default: {
          downloadImage: (
            gd: HTMLElement,
            opts: { format: string; filename: string; width?: number; height?: number }
          ) => Promise<string>;
        };
      };
      const px = format === 'png' ? { width: 2400, height: 1488 } : { width: 1000, height: 620 };
      await mod.default.downloadImage(gd, { format, filename: filenameBase, ...px });
    } finally {
      setBusy(null);
    }
  };

  const publicationDownload = async () => {
    if (!measurementId || !('spectrum_curve' in parsed) || !parsed.spectrum_curve?.x) return;
    const curve = parsed.spectrum_curve;
    setBusy('pub');
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`/api/measurements/${measurementId}/render-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          spectrum_type: parsed.spectrum_type,
          curve: { x: curve.x, y: curve.y },
          peaks: config.showPeaks ? peakXValues(parsed) : [],
          show_peaks: config.showPeaks,
          line_color: config.traces[0]?.color ?? '#1f4e9c',
          title: config.figureTitle,
          publisher,
          column: 'single',
          fmt: 'pdf'
        })
      });
      if (!res.ok) {
        toast.error('Publication export failed', {
          description: `${res.status}: ${(await res.text()).slice(0, 120)}`
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}_${publisher}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Publication export error', { description: String(err).slice(0, 120) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex h-[90vh] w-[95vw] max-w-[1800px] flex-col gap-0 p-0 sm:max-w-[95vw]'>
        <DialogHeader className='border-b px-5 py-3'>
          <DialogTitle className='flex items-center justify-between'>
            <span>Figure Studio</span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => onConfigChange({ ...config })}
              className='mr-8 text-xs text-muted-foreground'
            >
              Reset
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className='grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[380px_1fr]'>
          {/* ── Control panel (accordion) ── */}
          <div className='overflow-y-auto border-r p-4'>
            <Accordion type='multiple' defaultValue={['axes', 'series']} className='w-full'>
              <AccordionItem value='axes'>
                <AccordionTrigger className='text-sm'>Axes &amp; labels</AccordionTrigger>
                <AccordionContent className='space-y-3 pt-1'>
                  <div className='space-y-1'>
                    <Label className='text-muted-foreground text-xs'>Figure title</Label>
                    <Input
                      value={config.figureTitle ?? ''}
                      placeholder='(default)'
                      onChange={(e) => set('figureTitle', e.target.value || null)}
                      className='h-8 text-xs'
                    />
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <div className='space-y-1'>
                      <Label className='text-muted-foreground text-xs'>X title</Label>
                      <Input
                        value={config.xTitle ?? ''}
                        placeholder='(default)'
                        onChange={(e) => set('xTitle', e.target.value || null)}
                        className='h-8 text-xs'
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-muted-foreground text-xs'>Y title</Label>
                      <Input
                        value={config.yTitle ?? ''}
                        placeholder='(default)'
                        onChange={(e) => set('yTitle', e.target.value || null)}
                        className='h-8 text-xs'
                      />
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <div className='space-y-1'>
                      <Label className='text-muted-foreground text-xs'>X min / max</Label>
                      <div className='flex gap-1'>
                        <NumberOrAuto
                          value={config.xMin}
                          onChange={(v) => set('xMin', v)}
                          placeholder='auto'
                        />
                        <NumberOrAuto
                          value={config.xMax}
                          onChange={(v) => set('xMax', v)}
                          placeholder='auto'
                        />
                      </div>
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-muted-foreground text-xs'>Y min / max</Label>
                      <div className='flex gap-1'>
                        <NumberOrAuto
                          value={config.yMin}
                          onChange={(v) => set('yMin', v)}
                          placeholder='auto'
                        />
                        <NumberOrAuto
                          value={config.yMax}
                          onChange={(v) => set('yMax', v)}
                          placeholder='auto'
                        />
                      </div>
                    </div>
                  </div>
                  {capabilities.secondaryAxis && (
                    <div className='grid grid-cols-2 gap-2'>
                      <div className='space-y-1'>
                        <Label className='text-muted-foreground text-xs'>Y2 title (right)</Label>
                        <Input
                          value={config.y2Title ?? ''}
                          placeholder='(default)'
                          onChange={(e) => set('y2Title', e.target.value || null)}
                          className='h-8 text-xs'
                        />
                      </div>
                      <div className='space-y-1'>
                        <Label className='text-muted-foreground text-xs'>Y2 min / max</Label>
                        <div className='flex gap-1'>
                          <NumberOrAuto
                            value={config.y2Min}
                            onChange={(v) => set('y2Min', v)}
                            placeholder='auto'
                          />
                          <NumberOrAuto
                            value={config.y2Max}
                            onChange={(v) => set('y2Max', v)}
                            placeholder='auto'
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className='flex items-center justify-between pt-1'>
                    <Label htmlFor='rev-x' className='text-muted-foreground text-xs'>
                      Reverse X axis
                    </Label>
                    <Switch
                      id='rev-x'
                      checked={config.reverseX}
                      onCheckedChange={(v) => set('reverseX', v)}
                    />
                  </div>
                  <div className='flex items-center justify-between'>
                    <Label htmlFor='grid' className='text-muted-foreground text-xs'>
                      Grid
                    </Label>
                    <Switch
                      id='grid'
                      checked={config.showGrid}
                      onCheckedChange={(v) => set('showGrid', v)}
                    />
                  </div>
                  <div className='flex items-center justify-between'>
                    <Label htmlFor='legend' className='text-muted-foreground text-xs'>
                      Legend
                    </Label>
                    <Switch
                      id='legend'
                      checked={config.showLegend}
                      onCheckedChange={(v) => set('showLegend', v)}
                    />
                  </div>
                  <div className='flex items-center justify-between'>
                    <Label htmlFor='frame' className='text-muted-foreground text-xs'>
                      Closed frame (top/right)
                    </Label>
                    <Switch
                      id='frame'
                      checked={config.closedFrame}
                      onCheckedChange={(v) => set('closedFrame', v)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value='series'>
                <AccordionTrigger className='text-sm'>
                  {config.traces.length > 1
                    ? `Series & colors (${config.traces.length})`
                    : 'Color & line'}
                </AccordionTrigger>
                <AccordionContent className='space-y-4 pt-1'>
                  {config.traces.map((tr, i) => (
                    <div
                      key={tr.id}
                      className={
                        config.traces.length > 1 ? 'space-y-3 rounded-md border p-3' : 'space-y-3'
                      }
                    >
                      {config.traces.length > 1 && (
                        <div className='flex items-center justify-between'>
                          <span className='text-xs font-medium'>{tr.label}</span>
                          <Switch
                            checked={tr.visible}
                            onCheckedChange={(v) =>
                              onConfigChange(setTrace(config, tr.id, { visible: v }))
                            }
                          />
                        </div>
                      )}
                      <ColorControl
                        value={tr.color}
                        onChange={(c) => onConfigChange(setTrace(config, tr.id, { color: c }))}
                      />
                      <div className='space-y-1.5'>
                        <Label className='text-muted-foreground text-xs'>
                          Width ({tr.lineWidth.toFixed(1)})
                        </Label>
                        <Slider
                          min={0.5}
                          max={3}
                          step={0.5}
                          value={[tr.lineWidth]}
                          onValueChange={(v) =>
                            onConfigChange(setTrace(config, tr.id, { lineWidth: v[0] ?? 1.5 }))
                          }
                        />
                      </div>
                      <div className='space-y-1.5'>
                        <Label className='text-muted-foreground text-xs'>Style</Label>
                        <ToggleGroup
                          type='single'
                          value={tr.lineStyle}
                          onValueChange={(v) =>
                            v &&
                            onConfigChange(setTrace(config, tr.id, { lineStyle: v as LineStyle }))
                          }
                          className='justify-start'
                        >
                          <ToggleGroupItem value='solid' size='sm'>
                            Solid
                          </ToggleGroupItem>
                          <ToggleGroupItem value='dash' size='sm'>
                            Dash
                          </ToggleGroupItem>
                          <ToggleGroupItem value='dot' size='sm'>
                            Dot
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                      {i < config.traces.length - 1 && config.traces.length > 1 && null}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>

              {capabilities.peaks && (
                <AccordionItem value='peaks'>
                  <AccordionTrigger className='text-sm'>Peaks</AccordionTrigger>
                  <AccordionContent className='space-y-3 pt-1'>
                    <div className='flex items-center justify-between'>
                      <Label htmlFor='peaks-on' className='text-muted-foreground text-xs'>
                        Peak markers
                      </Label>
                      <Switch
                        id='peaks-on'
                        checked={config.showPeaks}
                        onCheckedChange={(v) => set('showPeaks', v)}
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label className='text-muted-foreground text-xs'>Peak labels</Label>
                      <ToggleGroup
                        type='single'
                        value={config.peakLabel}
                        onValueChange={(v) => v && set('peakLabel', v as PeakLabelMode)}
                        className='flex-wrap justify-start'
                      >
                        <ToggleGroupItem value='none' size='sm'>
                          Off
                        </ToggleGroupItem>
                        <ToggleGroupItem value='number' size='sm'>
                          1, 2, 3
                        </ToggleGroupItem>
                        <ToggleGroupItem value='value' size='sm'>
                          Value
                        </ToggleGroupItem>
                        {canLabelGroups && (
                          <ToggleGroupItem value='group' size='sm'>
                            Groups
                          </ToggleGroupItem>
                        )}
                      </ToggleGroup>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </div>

          {/* ── Live preview ── */}
          <div className='flex min-w-0 flex-col overflow-hidden p-4'>
            <span className='pb-2 text-xs text-muted-foreground'>
              Live preview (interactive). Publication file is rendered to exact journal specs on
              export.
            </span>
            <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
              <ChartPreview gdRef={gdRef} deps={config}>
                {renderChart(config)}
              </ChartPreview>
            </div>
          </div>
        </div>

        {/* ── Footer: export ── */}
        <div className='flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3'>
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-xs'>Quick:</span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={busy !== null}
              onClick={() => quickDownload('svg')}
            >
              {busy === 'svg' ? '…' : 'SVG'}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={busy !== null}
              onClick={() => quickDownload('png')}
            >
              {busy === 'png' ? '…' : 'PNG'}
            </Button>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground text-xs'>Publication PDF:</span>
            <Select value={publisher} onValueChange={setPublisher}>
              <SelectTrigger className='h-8 w-44 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUBLISHERS.map((p) => (
                  <SelectItem key={p.key} value={p.key} className='text-xs'>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type='button'
              size='sm'
              disabled={!measurementId || busy !== null}
              onClick={publicationDownload}
            >
              {busy === 'pub' ? 'Rendering…' : 'Export PDF'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Captures the Plotly graph div (rendered by whatever chart is passed as
 * children) so the export buttons can call Plotly.downloadImage on it. Polls
 * briefly because the dynamic <Plot> mounts asynchronously.
 */
function ChartPreview({
  children,
  gdRef,
  deps
}: {
  children: React.ReactNode;
  gdRef: React.RefObject<HTMLElement | null>;
  deps: FigureConfig;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      const el = containerRef.current?.querySelector('.js-plotly-plot');
      if (el) {
        gdRef.current = el as HTMLElement;
        clearInterval(id);
      } else if (++tries > 40) {
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [gdRef, deps]);

  return (
    <div ref={containerRef} className='h-full'>
      {children}
    </div>
  );
}
