/**
 * Figure Registry — the single source of truth mapping a measurement's
 * spectrum_type to the figure(s) it produces, each with its trace descriptors,
 * editable capabilities, default axis convention, and a render function.
 *
 * This is the glue layer that lets the Figure Studio (and the analysis section)
 * stay technique-agnostic: they ask the registry "what figures does this parsed
 * measurement have, and how do I edit/render each one" — never branching on the
 * technique themselves. Adding a new chart = adding one entry here; the section
 * and modal don't change.
 *
 * Design rules:
 *  - Type-safe: each builder narrows the parsed union to its own type.
 *  - Co-located: descriptors live with their chart; this file imports them.
 *  - Multi-figure: a type may yield several figures (e.g. DRS → DRS + Tauc).
 *  - No Studio leak: charts only receive a FigureConfig; they don't know the
 *    Studio exists. The registry is the seam.
 *
 * @phase R208 (R5.5b — Figure Registry)
 */

import type { ReactNode } from 'react';

import { DRSChart, getDrsTraceDescriptors } from '@/features/spectra/components/drs-chart';
import {
  CVChart,
  EISChart,
  getCvTraceDescriptors,
  getEisTraceDescriptors,
  getLsvTraceDescriptors,
  getTafelTraceDescriptors,
  LSVChart,
  PECJVChart,
  getPecJvTraceDescriptors
} from '@/features/spectra/components/spectrum-chart-echem';
import { TafelChart } from '@/features/spectra/components/tafel-chart';
import {
  DSCChart,
  getDscTraceDescriptors,
  getOcpTraceDescriptors,
  getTgaTraceDescriptors,
  OCPChart,
  TGAChart
} from '@/features/spectra/components/spectrum-chart-ext';
import {
  getSpectrumTraceDescriptors,
  type ReferenceCardOverlay,
  SpectrumChart
} from '@/features/spectra/components/spectrum-chart';
import { getTaucTraceDescriptors, TaucChart } from '@/features/spectra/components/tauc-chart';
import type {
  FigureCapabilities,
  FigureConfig,
  TraceDescriptor
} from '@/features/spectra/figure-config';
import type { SpectrumParsedData } from '@/types/spectra-analysis';

/** Everything the Studio + section need to edit and render one figure. */
export interface FigureDefinition {
  /** stable key, unique within a measurement (e.g. 'main', 'tauc', 'drs') */
  key: string;
  /** human label for the "Edit figure" affordance + config storage */
  label: string;
  /** the lines this figure has, so the Studio can build per-trace controls */
  descriptors: TraceDescriptor[];
  /** which Studio controls apply (peaks, secondary axis) */
  capabilities: FigureCapabilities;
  /** default reversed X axis (FTIR) */
  defaultReverseX: boolean;
  /** render the chart for a given (controlled) config */
  render: (config: FigureConfig) => ReactNode;
}

/** Extra render-time context the registry needs but the parsed data lacks. */
export interface FigureRenderContext {
  /** XRD reference-card overlays (only consumed by the XRD figure) */
  referenceCards?: ReferenceCardOverlay[];
}

const SINGLE_CURVE: FigureCapabilities = { peaks: true, secondaryAxis: false };
const TAUC_CAPS: FigureCapabilities = { peaks: false, secondaryAxis: false };
const DRS_CAPS: FigureCapabilities = { peaks: false, secondaryAxis: true };

/**
 * Build the list of figure definitions for a parsed measurement. The order is
 * the on-page order. Returns [] for types without an interactive figure yet
 * (tga/dsc/ocp register here in a later round).
 */
export function getFigureDefinitions(
  parsed: SpectrumParsedData,
  ctx: FigureRenderContext = {}
): FigureDefinition[] {
  switch (parsed.spectrum_type) {
    case 'xrd':
      return [
        {
          key: 'main',
          label: 'XRD pattern',
          descriptors: getSpectrumTraceDescriptors(parsed),
          capabilities: SINGLE_CURVE,
          defaultReverseX: false,
          render: (config) => (
            <SpectrumChart parsed={parsed} config={config} referenceCards={ctx.referenceCards} />
          )
        }
      ];

    case 'raman':
    case 'ftir':
    case 'uvvis': {
      const defs: FigureDefinition[] = [
        {
          key: 'main',
          label:
            parsed.spectrum_type === 'ftir'
              ? 'FTIR spectrum'
              : parsed.spectrum_type === 'raman'
                ? 'Raman spectrum'
                : 'UV-Vis spectrum',
          descriptors: getSpectrumTraceDescriptors(parsed),
          capabilities: SINGLE_CURVE,
          defaultReverseX: parsed.spectrum_type === 'ftir',
          render: (config) => <SpectrumChart parsed={parsed} config={config} />
        }
      ];
      // UV-Vis additionally produces a Tauc plot when a bandgap was fitted.
      if (parsed.spectrum_type === 'uvvis' && parsed.tauc_bandgap) {
        const uv = parsed;
        defs.push({
          key: 'tauc',
          label: 'Tauc plot',
          descriptors: getTaucTraceDescriptors(),
          capabilities: TAUC_CAPS,
          defaultReverseX: false,
          render: (config) => (
            <TaucChart
              curve={uv.tauc_curve}
              bandgap={uv.tauc_bandgap}
              yLabel='(αhν)^n (a.u.)'
              title={`Tauc Plot — ${uv.tauc_bandgap?.transition ?? ''}`}
              config={config}
            />
          )
        });
      }
      return defs;
    }

    case 'uvvis_drs': {
      const drs = parsed;
      const defs: FigureDefinition[] = [
        {
          key: 'drs',
          label: 'DRS — Reflectance & F(R)',
          descriptors: getDrsTraceDescriptors(),
          capabilities: DRS_CAPS,
          defaultReverseX: false,
          render: (config) => (
            <DRSChart
              reflectance={drs.reflectance_curve}
              km={drs.km_curve}
              reflectanceMode={drs.reflectance_mode}
              config={config}
            />
          )
        }
      ];
      if (drs.tauc_bandgap) {
        defs.push({
          key: 'tauc',
          label: 'Tauc on Kubelka-Munk',
          descriptors: getTaucTraceDescriptors(),
          capabilities: TAUC_CAPS,
          defaultReverseX: false,
          render: (config) => (
            <TaucChart
              curve={drs.tauc_curve}
              bandgap={drs.tauc_bandgap}
              yLabel='(F(R)hν)^n (a.u.)'
              title={`Tauc on Kubelka-Munk — ${drs.tauc_bandgap?.transition ?? ''}`}
              config={config}
            />
          )
        });
      }
      return defs;
    }

    case 'tga':
      return [
        {
          key: 'main',
          label: 'TGA / DTG',
          descriptors: getTgaTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: true },
          defaultReverseX: false,
          render: (config) => <TGAChart parsed={parsed} config={config} />
        }
      ];

    case 'dsc':
      return [
        {
          key: 'main',
          label: 'DSC thermogram',
          descriptors: getDscTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => <DSCChart parsed={parsed} config={config} />
        }
      ];

    case 'ocp':
      return [
        {
          key: 'main',
          label: 'OCP — Open-Circuit Potential',
          descriptors: getOcpTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => <OCPChart parsed={parsed} config={config} />
        }
      ];

    case 'tafel':
      return [
        {
          key: 'main',
          label: 'Tafel plot',
          descriptors: getTafelTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => (
            <TafelChart
              curve={parsed.tafel_curve}
              autoSlope={parsed.analysis.tafel_slope_mV_per_dec}
              config={config}
            />
          )
        }
      ];

    case 'lsv': {
      const defs: FigureDefinition[] = [
        {
          key: 'main',
          label: 'LSV',
          descriptors: getLsvTraceDescriptors(parsed),
          capabilities: { peaks: false, secondaryAxis: parsed.rhe_curve != null },
          defaultReverseX: false,
          render: (config) => <LSVChart parsed={parsed} config={config} />
        }
      ];
      // From an LSV with RHE+reaction, the worker also returns the Tafel curve —
      // surface it as a second figure with the same Range Selector fit.
      if (parsed.tafel_curve) {
        defs.push({
          key: 'tafel',
          label: 'Tafel plot (from LSV)',
          descriptors: getTafelTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => (
            <TafelChart
              curve={parsed.tafel_curve}
              autoSlope={parsed.analysis.tafel?.tafel_slope_mV_per_dec ?? null}
              config={config}
            />
          )
        });
      }
      return defs;
    }

    case 'cv':
      return [
        {
          key: 'main',
          label: 'Cyclic voltammogram',
          descriptors: getCvTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => <CVChart parsed={parsed} config={config} />
        }
      ];

    case 'eis':
      return [
        {
          key: 'main',
          label: 'Nyquist plot',
          descriptors: getEisTraceDescriptors(),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => <EISChart parsed={parsed} config={config} />
        }
      ];

    case 'pec_jv':
      return [
        {
          key: 'main',
          label: 'PEC J-V',
          descriptors: getPecJvTraceDescriptors(parsed),
          capabilities: { peaks: false, secondaryAxis: false },
          defaultReverseX: false,
          render: (config) => <PECJVChart parsed={parsed} config={config} />
        }
      ];

    default:
      return [];
  }
}
