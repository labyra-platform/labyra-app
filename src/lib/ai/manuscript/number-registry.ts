/**
 * Manuscript number registry (Gap1 — Trust core).
 *
 * Numbers a manuscript may state come from exactly two places: the lab's own
 * measurements, or the cited literature. This module builds the set of allowed
 * numbers (a whitelist) from both, tags lab numbers with their measurement for
 * provenance, and lets the pipeline drop "unverified number" warnings that are
 * actually backed by lab data — so legitimate measured values are never
 * mistaken for fabrications.
 *
 * Pure (no I/O). Reuses the grounding number tokenizer/normalizer so lab
 * numbers key identically to the literature whitelist.
 *
 * @phase R-aiscience-2 (Gap1)
 * @see labyra-ai-science-manuscript-strategy.md §5
 */
import type { NumberEntry } from '@/features/manuscript/types';
import { buildNumberWhitelist, normalizeNumber } from '@/lib/ai/grounding/extract-numbers';

/** A scientific result number from a lab measurement, ready to whitelist. */
export interface LabNumber {
  /** Normalized number string — keys identically to the grounding whitelist. */
  norm: string;
  /** Raw numeric value. */
  value: number;
  measurementId: string;
}

/**
 * Per-measurement scientific RESULT metrics — named, curated values only
 * (e.g. { bandgap_eV: 2.6, d_spacing_A: 3.84 }), never raw signal arrays or
 * config, which would over-whitelist and defeat grounding.
 */
export interface MeasurementMetrics {
  measurementId: string;
  values: Record<string, number | string>;
}

/** Turn curated measurement metrics into whitelist-ready, tagged lab numbers. */
export function extractLabNumbers(metrics: MeasurementMetrics[]): LabNumber[] {
  const out: LabNumber[] = [];
  for (const m of metrics) {
    for (const raw of Object.values(m.values)) {
      const value = typeof raw === 'number' ? raw : Number.parseFloat(raw);
      if (!Number.isFinite(value)) continue;
      out.push({ norm: normalizeNumber(value), value, measurementId: m.measurementId });
    }
  }
  return out;
}

export interface NumberRegistry {
  /** Allowed normalized number strings: lab ∪ literature ∪ always-allowed. */
  whitelist: Set<string>;
  /** Provenance entries (lab numbers tagged to their measurement). */
  entries: NumberEntry[];
}

/**
 * Build the manuscript number registry: literature numbers (from the curated
 * collection's chunk texts, via the grounding whitelist) ∪ lab data numbers
 * (tagged to their measurement).
 */
export function buildNumberRegistry(
  labNumbers: LabNumber[],
  literatureChunkTexts: string[]
): NumberRegistry {
  const whitelist = buildNumberWhitelist(literatureChunkTexts);
  const entries: NumberEntry[] = [];
  const seen = new Set<string>();
  for (const ln of labNumbers) {
    whitelist.add(ln.norm);
    const key = `${ln.measurementId}:${ln.norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ value: ln.norm, source: { kind: 'lab', measurementId: ln.measurementId } });
  }
  return { whitelist, entries };
}

/** Normalized number strings derived only from lab measurements. */
export function labWhitelist(labNumbers: LabNumber[]): Set<string> {
  return new Set(labNumbers.map((n) => n.norm));
}

/**
 * Drop "unverified" numbers that are accounted for by lab data — real measured
 * values, not fabrications. Numbers absent from the lab whitelist are kept
 * (they remain flagged by the upstream literature grounding).
 */
export function dropLabVerified<T extends { value: number }>(
  unverified: T[],
  labWhitelistSet: Set<string>
): T[] {
  if (labWhitelistSet.size === 0) return unverified;
  return unverified.filter((n) => !labWhitelistSet.has(normalizeNumber(n.value)));
}
