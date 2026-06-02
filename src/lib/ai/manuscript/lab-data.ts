/**
 * Lab-data context for manuscript generation (N3b — Trust core, server-side).
 *
 * For the measurements a manuscript curates (`selectedMeasurementIds`), this reads
 * each one's latest analysis and produces two things:
 *   1. `summaries` — a compact AI-summary line per measurement, injected into the
 *      Writer prompt so Results & Discussion references the lab's OWN findings
 *      (not just the cited literature).
 *   2. `whitelist` — normalized numbers from CURATED per-technique result fields
 *      (e.g. XRD Scherrer size / d-spacings, UV-Vis Tauc bandgap), so genuine
 *      measured values are no longer mistaken for fabrications (Gap1, R276).
 *
 * Only headline RESULT metrics are whitelisted — never raw signal arrays or
 * instrument config, which would over-whitelist and defeat grounding. Techniques
 * without an explicit case here still contribute their summary to the prompt;
 * their numbers stay flagged until a curated mapping is added (extend the switch).
 *
 * Server-only: reads analyses via the Firebase Admin SDK.
 *
 * @phase R-aiscience-N3b
 * @see labyra-ai-science-manuscript-strategy.md §5 (Gap1)
 */
import 'server-only';
import { getLatestAnalysis } from '@/lib/firestore/queries/spectra-analysis';
import type { SpectrumParsedData } from '@/types/spectra-analysis';
import { extractLabNumbers, labWhitelist, type MeasurementMetrics } from './number-registry';

export interface LabDataContext {
  /** One compact summary line per measurement, for the Writer prompt. */
  summaries: string[];
  /** Normalized lab numbers (curated result metrics) to un-flag in grounding. */
  whitelist: Set<string>;
}

/**
 * Curated headline result numbers for a single analysis, keyed by a stable name.
 * Discriminated on `parsed.spectrum_type`. Extend per technique as needed.
 */
function curatedMetrics(parsed: SpectrumParsedData): Record<string, number> {
  const v: Record<string, number> = {};
  switch (parsed.spectrum_type) {
    case 'xrd': {
      if (typeof parsed.scherrer_avg_nm === 'number') v.scherrer_avg_nm = parsed.scherrer_avg_nm;
      if (typeof parsed.crystallinity_percent === 'number') {
        v.crystallinity_percent = parsed.crystallinity_percent;
      }
      parsed.peaks.forEach((pk, i) => {
        if (typeof pk.d_spacing === 'number') v[`d_spacing_${i}`] = pk.d_spacing;
      });
      break;
    }
    case 'uvvis':
    case 'uvvis_drs': {
      if (parsed.tauc_bandgap) v.bandgap_ev = parsed.tauc_bandgap.bandgap_ev;
      break;
    }
    default:
      break;
  }
  return v;
}

/**
 * Read the selected measurements' analyses and assemble prompt summaries +
 * a curated lab-number whitelist. Skips measurements with no analysis yet.
 */
export async function loadLabDataContext(
  tenantId: string,
  measurementIds: string[]
): Promise<LabDataContext> {
  const summaries: string[] = [];
  const metrics: MeasurementMetrics[] = [];

  for (const id of measurementIds) {
    const analysis = await getLatestAnalysis(tenantId, id);
    if (!analysis) continue;

    const aiSummary = (analysis.ai as { summary?: unknown }).summary;
    if (typeof aiSummary === 'string' && aiSummary.trim()) {
      summaries.push(`${analysis.spectrumType.toUpperCase()}: ${aiSummary.trim()}`);
    }

    const values = curatedMetrics(analysis.parsed);
    if (Object.keys(values).length > 0) metrics.push({ measurementId: id, values });
  }

  return { summaries, whitelist: labWhitelist(extractLabNumbers(metrics)) };
}
