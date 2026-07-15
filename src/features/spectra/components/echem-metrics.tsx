'use client';

/**
 * EchemMetrics — key quantitative results for electrochemistry measurements
 * (Tafel / LSV / CV / EIS), rendered as labelled metric tiles. Reads directly
 * from the worker-parsed analysis (no recomputation).
 * @phase R212 (electrochemistry app support)
 */

import { Panel } from '@/components/ui-extra/panel';
import type {
  CVParsedData,
  EISParsedData,
  LSVParsedData,
  PECJVParsedData,
  PECMottSchottkyParsedData,
  TafelParsedData
} from '@/types/spectra-analysis-echem';

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className='space-y-0.5'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='text-lg font-semibold tabular-nums'>
        {value}
        {unit ? (
          <span className='ml-1 text-sm font-normal text-muted-foreground'>{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>{children}</div>
    </Panel>
  );
}

export function TafelMetrics({ parsed }: { parsed: TafelParsedData }) {
  const a = parsed.analysis;
  return (
    <Shell title='Tafel kinetics'>
      <Metric label='Tafel slope' value={fmt(a.tafel_slope_mV_per_dec, 1)} unit='mV/dec' />
      <Metric
        label='Exchange current j₀'
        value={fmt(a.exchange_current_density_j0, 4)}
        unit={a.j0_unit}
      />
      <Metric label='R²' value={fmt(a.r_squared, 4)} />
      <Metric
        label='Fit window (log j)'
        value={`${fmt(a.log_j_window[0], 2)} … ${fmt(a.log_j_window[1], 2)}`}
      />
      {a.mechanism_hint ? (
        <div className='col-span-2 space-y-0.5 sm:col-span-3'>
          <div className='text-xs text-muted-foreground'>Mechanism hint</div>
          <div className='text-sm'>{a.mechanism_hint}</div>
        </div>
      ) : null}
    </Shell>
  );
}

export function LSVMetrics({ parsed }: { parsed: LSVParsedData }) {
  const a = parsed.analysis;
  return (
    <Shell title='LSV activity'>
      {a.reaction ? <Metric label='Reaction' value={a.reaction.toUpperCase()} /> : null}
      <Metric label='η @ 10 mA/cm²' value={fmt(a.overpotential_at_10mA_cm2_V, 3)} unit='V' />
      <Metric
        label='Onset η @ 1 mA/cm²'
        value={fmt(a.onset_overpotential_at_1mA_cm2_V, 3)}
        unit='V'
      />
      {a.tafel ? (
        <Metric label='Tafel slope' value={fmt(a.tafel.tafel_slope_mV_per_dec, 1)} unit='mV/dec' />
      ) : null}
      <Metric label='iR corrected' value={parsed.conditions.ir_corrected ? 'Yes' : 'No'} />
    </Shell>
  );
}

export function CVMetrics({ parsed }: { parsed: CVParsedData }) {
  const a = parsed.analysis;
  return (
    <Shell title='CV redox'>
      <Metric label='Eₚₐ' value={fmt(a.Epa_V, 4)} unit='V' />
      <Metric label='Eₚ𝒸' value={fmt(a.Epc_V, 4)} unit='V' />
      <Metric label='ΔEₚ' value={fmt(a.dEp_mV, 1)} unit='mV' />
      <Metric label="E°'" value={fmt(a.E0_prime_V, 4)} unit='V' />
      <Metric label='|iₚₐ/iₚ𝒸|' value={fmt(a.peak_current_ratio, 2)} />
      <div className='col-span-2 space-y-0.5 sm:col-span-3'>
        <div className='text-xs text-muted-foreground'>Reversibility</div>
        <div className='text-sm'>{a.reversibility}</div>
      </div>
    </Shell>
  );
}

export function EISMetrics({ parsed }: { parsed: EISParsedData }) {
  const fit = parsed.circuit_fit;
  const params = fit.parameters ?? {};
  return (
    <Shell title='EIS — impedance'>
      <Metric label='Circuit' value={fit.circuit || '—'} />
      {fit.error ? (
        <div className='col-span-2 space-y-0.5 sm:col-span-3'>
          <div className='text-xs text-muted-foreground'>Fit</div>
          <div className='text-sm text-destructive'>{fit.error}</div>
        </div>
      ) : (
        <>
          {Object.entries(params).map(([k, v]) => (
            <Metric key={k} label={k} value={typeof v === 'number' ? fmt(v, 3) : String(v)} />
          ))}
          {fit.chi_square != null ? <Metric label='χ²' value={fmt(fit.chi_square, 5)} /> : null}
        </>
      )}
    </Shell>
  );
}

export function PECJVMetrics({ parsed }: { parsed: PECJVParsedData }) {
  const a = parsed.analysis;
  return (
    <Shell title='PEC J-V (photoelectrochemistry)'>
      <Metric label='Photocurrent onset' value={fmt(a.photocurrent_onset_V, 3)} unit='V' />
      <Metric
        label='j @ 1.23 V_RHE'
        value={fmt(a.photocurrent_at_1p23V_RHE, 3)}
        unit={a.current_density_unit}
      />
      {a.sth_percent != null ? (
        <Metric label='STH efficiency' value={fmt(a.sth_percent, 3)} unit='%' />
      ) : null}
      {a.abpe_percent != null ? (
        <Metric label='ABPE (biased)' value={fmt(a.abpe_percent, 3)} unit='%' />
      ) : null}
      <Metric
        label='Light power'
        value={fmt(parsed.conditions.light_power_mw_cm2, 0)}
        unit='mW/cm²'
      />
    </Shell>
  );
}

export function MottSchottkyMetrics({ parsed }: { parsed: PECMottSchottkyParsedData }) {
  const a = parsed.analysis;
  const density = a.donor_density_cm3 ?? a.acceptor_density_cm3;
  const densityLabel = a.carrier_type === 'p-type' ? 'Acceptor density N_A' : 'Donor density N_D';
  return (
    <Shell title='Mott-Schottky (semiconductor)'>
      <Metric label='Carrier type' value={a.carrier_type || '—'} />
      <Metric
        label={densityLabel}
        value={density != null ? `${density.toExponential(2)}` : '—'}
        unit={density != null ? 'cm⁻³' : undefined}
      />
      <Metric label='Flat-band (vs ref)' value={fmt(a.flat_band_V_vs_ref, 3)} unit='V' />
      {a.flat_band_V_vs_rhe != null ? (
        <Metric label='Flat-band (vs RHE)' value={fmt(a.flat_band_V_vs_rhe, 3)} unit='V' />
      ) : null}
      {a.depletion_width_nm != null ? (
        <Metric label='Depletion width' value={fmt(a.depletion_width_nm, 2)} unit='nm' />
      ) : null}
      <Metric label='Fit R²' value={fmt(a.fit_r2, 4)} />
      <Metric
        label='Fit window'
        value={`${fmt(a.fit_range_V[0], 2)} … ${fmt(a.fit_range_V[1], 2)}`}
        unit='V'
      />
    </Shell>
  );
}

/** Dispatch the right metrics block for an electrochemistry measurement. */
export function EchemMetrics({
  parsed
}: {
  parsed:
    | TafelParsedData
    | LSVParsedData
    | CVParsedData
    | EISParsedData
    | PECJVParsedData
    | PECMottSchottkyParsedData;
}) {
  switch (parsed.spectrum_type) {
    case 'tafel':
      return <TafelMetrics parsed={parsed} />;
    case 'lsv':
      return <LSVMetrics parsed={parsed} />;
    case 'cv':
      return <CVMetrics parsed={parsed} />;
    case 'eis':
      return <EISMetrics parsed={parsed} />;
    case 'pec_jv':
      return <PECJVMetrics parsed={parsed} />;
    case 'pec_mott_schottky':
      return <MottSchottkyMetrics parsed={parsed} />;
    default:
      return null;
  }
}
