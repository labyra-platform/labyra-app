/**
 * Analysis: activity record for AI analysis runs on a Measurement.
 *
 * Stores the parsed spectrum + AI result + citation references. Separated
 * from Measurement so users can re-analyze with different AI models/params
 * without re-uploading the raw file.
 *
 * Document ID format: random UUID (high-volume activity)
 *
 * Lineage:
 *   Measurement ──> Analysis
 *   Analysis ──[cites]──> Reference[] (internal) + external citations (COD/MP)
 *
 * @phase R164-phase-1-types
 */

import type { ProvBase } from './prov-base';
import type {
  MultiCitationCandidate,
  SpectrumAIOutput,
  SpectrumParsedData
} from './spectra-analysis';

export interface Analysis extends ProvBase {
  schemaVersion: 1;

  // Lineage
  measurementId: string;
  // Sample inherits from Measurement.sampleId — denormalized for lineage queries
  sampleId?: string;

  // Analyzer metadata
  analyzerVersion: string; // e.g. "spectra-4b-1.5.0"
  modelTier?: string; // e.g. "haiku-tier1", "opus-tier3"
  modelName?: string; // e.g. "claude-sonnet-4-6"
  analysisDuration_ms?: number;
  costUsd?: number;

  // Results
  parsed: SpectrumParsedData; // worker output: peaks, curves, quick stats
  aiResult?: SpectrumAIOutput; // AI grounded interpretation

  // Citations (PROV-O wasDerivedFrom for the citation chain)
  citationReferenceIds: string[]; // internal Reference entity IDs
  citationCandidates?: MultiCitationCandidate[]; // full candidate list incl. external (COD/MP)

  // Reanalysis pointer (if this analysis supersedes a previous one)
  supersedes?: string; // previous Analysis ID
}
