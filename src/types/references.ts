/**
 * Reference: cite-able peak data from paper/database/manual entry.
 *
 * Replaces the R162 `reference_cards` collection. Adds:
 *   - paperId: optional link to Paper entity (for DOI verification)
 *   - ProvBase fields (lifecycle, audit)
 *   - Versioning (sub-collection `versions/` per ADR-016)
 *
 * Document ID format: `ref_<slug>` (human-readable, e.g. `ref_smith2014_mos2`)
 *
 * Discriminated union by spectrumType — same shape as R163 ReferenceCard but
 * lives in `references` collection with PROV-O fields.
 *
 * @phase R164-phase-1-types
 */

import type { ProvBase } from './prov-base';
import type {
  FTIRReferenceCardPeak,
  RamanReferenceCardPeak,
  ReferenceCardPeak,
  SpectrumTypeRefCard,
  UVVisReferenceCardPeak
} from './spectra';

export type { SpectrumTypeRefCard };

interface ReferenceBase extends ProvBase {
  schemaVersion: 1;

  // Identity
  cardNumber: string;
  phaseName: string;
  formula?: string;

  // Source (extends previous 'manual' | 'cod' | 'mp' with 'paper' option)
  source: 'manual' | 'cod' | 'mp' | 'paper';
  sourceUrl?: string;

  // R164: DOI verification via linked Paper entity
  paperId?: string; // pap_xxx — link to Paper.doi (verified, no hallucination)

  // Versioning (incremented on every edit)
  currentVersion: number;

  notes?: string;
}

export interface XRDReference extends ReferenceBase {
  spectrumType: 'xrd';
  spaceGroup?: string;
  anode?: string;
  peaks: ReferenceCardPeak[];
}

export interface FTIRReference extends ReferenceBase {
  spectrumType: 'ftir';
  mode?: 'transmittance' | 'absorbance';
  peaks: FTIRReferenceCardPeak[];
}

export interface RamanReference extends ReferenceBase {
  spectrumType: 'raman';
  laserWavelength?: number;
  peaks: RamanReferenceCardPeak[];
}

export interface UVVisReference extends ReferenceBase {
  spectrumType: 'uvvis';
  solvent?: string;
  peaks: UVVisReferenceCardPeak[];
}

export type Reference = XRDReference | FTIRReference | RamanReference | UVVisReference;

/**
 * Frozen snapshot of a Reference at a given version. Stored in sub-collection
 * `tenants/{tid}/references/{refId}/versions/{vId}`.
 *
 * Version ID format: `v<seq>_<timestamp>` (e.g. `v3_1747244400000`)
 */
export interface ReferenceVersion {
  id: string;
  version: number;
  content: Reference;
  changedBy: string;
  changedAt: number;
  changeNote?: string;
}
