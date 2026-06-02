/**
 * Methods context for manuscript generation (Characterization, server-side).
 *
 * The Methods section's "Characterization" subsection must name the REAL
 * instruments and acquisition parameters used — not invented equipment. For the
 * measurements a manuscript curates (`selectedMeasurementIds`), this reads each
 * one's spectrum metadata (instrument string, XRD anode/monochromator) and its
 * analysis (derived radiation/laser wavelengths) and produces:
 *   1. `characterization` — one structured fact line per measurement, injected
 *      into the Writer prompt so the Characterization paragraph is grounded in
 *      the lab's own setup (technique · instrument · radiation/excitation).
 *   2. `whitelist` — normalized acquisition numbers (XRD λ in Å) so genuine
 *      instrument settings are not mistaken for fabrications (R276).
 *
 * Scope: the equipment/characterization half of Methods. The procedure half
 * (synthesis steps, temperature/time/atmosphere) is owned by protocol instances
 * and is intentionally NOT covered here yet — see
 * labyra-workflow-node-graph-strategy.md §4/§7 (a future loadProcedureContext
 * will feed it once protocol instances exist).
 *
 * Instrument identity is taken verbatim from the spectrum's free-text
 * `instrument` field. Resolving it to the structured Equipment registry
 * (manufacturer/model) is deferred until measurements carry an `equipmentId`
 * link — until then there is no reliable, non-fuzzy join.
 *
 * Server-only: reads via the Firebase Admin SDK.
 *
 * @phase R-aiscience-methods-char
 */
import 'server-only';
import { getLatestAnalysis, getSpectrumMeta } from '@/lib/firestore/queries/spectra-analysis';
import type { SpectrumParsedData } from '@/types/spectra-analysis';
import type { SpectrumMetadata } from '@/types/spectra';
import { extractLabNumbers, labWhitelist, type MeasurementMetrics } from './number-registry';

export interface MethodsDataContext {
  /** One structured characterization fact line per measurement, for the prompt. */
  characterization: string[];
  /** Normalized acquisition numbers (λ, laser nm) to un-flag in grounding. */
  whitelist: Set<string>;
}

/** Readable label for an XRD monochromator code; null when none/absent. */
function monochromatorLabel(mono?: string): string | null {
  if (!mono || mono === 'none') return null;
  const map: Record<string, string> = {
    ni_filter: 'Ni filter',
    graphite: 'graphite monochromator',
    ge111: 'Ge(111) monochromator',
    johansson: 'Johansson monochromator',
    si220: 'Si(220) monochromator'
  };
  return map[mono] ?? mono;
}

/** Human technique name for a spectrum type. */
function techniqueName(type: string): string {
  const map: Record<string, string> = {
    xrd: 'X-ray diffraction (XRD)',
    raman: 'Raman spectroscopy',
    ftir: 'Fourier-transform infrared spectroscopy (FTIR)',
    uvvis: 'UV-Vis spectroscopy',
    uvvis_drs: 'UV-Vis diffuse reflectance spectroscopy (DRS)',
    cv: 'cyclic voltammetry (CV)',
    lsv: 'linear sweep voltammetry (LSV)',
    eis: 'electrochemical impedance spectroscopy (EIS)',
    tafel: 'Tafel analysis',
    pec_jv: 'photoelectrochemical J–V measurement',
    pec_mott_schottky: 'Mott–Schottky analysis'
  };
  return map[type] ?? type.toUpperCase();
}

/**
 * One structured characterization fact line, e.g.
 *   "X-ray diffraction (XRD) — instrument: Bruker D8; Cu Kα radiation; λ = 1.5406 Å"
 * Acquisition numbers come from the parsed analysis (when present); instrument
 * config from the spectrum metadata. Missing details are stated as such so the
 * Writer does not invent them.
 */
function characterizationFact(meta: SpectrumMetadata, parsed: SpectrumParsedData | null): string {
  const type = meta.spectrumType;
  const parts: string[] = [];
  const instrument = meta.instrument?.trim();
  if (instrument) parts.push(`instrument: ${instrument}`);

  if (type === 'xrd') {
    if (meta.anode) parts.push(`${meta.anode} Kα radiation`);
    if (
      parsed &&
      parsed.spectrum_type === 'xrd' &&
      typeof parsed.wavelength_angstrom === 'number'
    ) {
      parts.push(`λ = ${parsed.wavelength_angstrom} Å`);
    }
    const mono = monochromatorLabel(meta.monochromator);
    if (mono) parts.push(mono);
  }

  const name = techniqueName(type);
  return parts.length > 0
    ? `${name} — ${parts.join('; ')}`
    : `${name} — instrument/acquisition details not recorded`;
}

/** Acquisition numbers worth whitelisting (so grounding does not flag them). */
function acquisitionMetrics(parsed: SpectrumParsedData | null): Record<string, number> {
  const v: Record<string, number> = {};
  if (!parsed) return v;
  if (parsed.spectrum_type === 'xrd' && typeof parsed.wavelength_angstrom === 'number') {
    v.xrd_lambda_angstrom = parsed.wavelength_angstrom;
  }
  return v;
}

/**
 * Read the selected measurements' instrument metadata (+ derived acquisition
 * params) and assemble characterization fact lines + an acquisition-number
 * whitelist. Skips measurements whose spectrum doc no longer exists.
 */
export async function loadMethodsContext(
  tenantId: string,
  measurementIds: string[]
): Promise<MethodsDataContext> {
  const characterization: string[] = [];
  const metrics: MeasurementMetrics[] = [];

  for (const id of measurementIds) {
    const meta = await getSpectrumMeta(tenantId, id);
    if (!meta) continue;
    const analysis = await getLatestAnalysis(tenantId, id);
    const parsed = analysis ? analysis.parsed : null;

    characterization.push(characterizationFact(meta, parsed));

    const values = acquisitionMetrics(parsed);
    if (Object.keys(values).length > 0) metrics.push({ measurementId: id, values });
  }

  return { characterization, whitelist: labWhitelist(extractLabNumbers(metrics)) };
}
