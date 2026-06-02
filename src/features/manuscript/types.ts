/**
 * Manuscript data model — AI Science (grounded manuscript generation).
 *
 * Firestore: tenants/{tid}/manuscripts/{id}. The manuscript IS the source of
 * truth; LaTeX/Word are renders (citeproc/BibTeX), not stored separately.
 *
 * Reuses existing types: WriterCitation (T4 Writer) and AuditFinding (T5
 * Auditor) so a section's provenance and inline Claim Confidence are the same
 * shapes the rest of the AI stack already produces.
 *
 * @phase R-aiscience-1
 * @see labyra-ai-science-manuscript-strategy.md §6
 */
import type { SectionType, WriterCitation, WriterGrounding } from '@/lib/ai/tier4-writer/types';
import type { AuditFinding } from '@/lib/ai/tier5-auditor/types';
import type { ProvBase } from '@/types/prov-base';

/**
 * IMRaD section kinds for a manuscript. Note Results & Discussion is a single
 * manuscript section (journal convention); the pipeline maps it onto the finer
 * T4 SectionType ('results' / 'discussion') when generating.
 */
export type ManuscriptSectionType =
  | 'abstract'
  | 'introduction'
  | 'materials'
  | 'methods'
  | 'results_discussion'
  | 'conclusion';

/** HITL lifecycle of one section. `locked` is excluded from bulk regeneration. */
export type ManuscriptSectionStatus = 'planned' | 'generating' | 'draft' | 'reviewed' | 'locked';

export type ManuscriptStatus = 'drafting' | 'reviewing' | 'exported';

/** Key term kept consistent across sections (coherence). e.g. "h-WO₃". */
export interface GlossaryTerm {
  term: string;
  definition?: string;
}

/** Provenance of a number permitted in the draft (Gap1). */
export type NumberSource =
  | { kind: 'lab'; measurementId: string }
  | { kind: 'literature'; paperKey: string };

export interface NumberEntry {
  value: string;
  source: NumberSource;
}

export interface ManuscriptSection {
  type: ManuscriptSectionType;
  order: number;
  content: string;
  /** HITL gate — user advances the section through these states. */
  status: ManuscriptSectionStatus;
  /** Papers cited in this section (paperId + chunkIds + key). */
  citations: WriterCitation[];
  /** Measurements used (provenance for numbers/figures). */
  linkedMeasurementIds: string[];
  /** Inline Claim Confidence (T5 Auditor verdicts), if audited. */
  claimFindings?: AuditFinding[];
  /** Tier that generated the draft (4 = T4 Writer). */
  generatedByTier: number;
  reviewNote?: string;
  /** Bumped on regenerate; prior content can be snapshotted. */
  sectionVersion: number;
}

/** A section's slot in a journal layout. */
export interface SectionSpec {
  type: ManuscriptSectionType;
  wordLimit?: number;
}

/**
 * Journal preset — IMRaD by default, or a journal-specific layout. A template
 * is just a profile; differences are sections / wordLimit / citation style.
 */
export interface JournalProfile {
  id: string;
  name: string; // "Nature", "ACS Energy Lett", "Custom"
  cslStyleId: string; // citeproc citation style id
  sections: SectionSpec[];
  latexDocClass?: string; // "achemso", "revtex", ...
}

/** Firestore: tenants/{tid}/manuscripts/{id}. */
export interface Manuscript extends ProvBase {
  // ProvBase supplies: id, tenantId, schemaVersion, createdBy, createdAt,
  // updatedBy?, updatedAt?, lifecycleStatus, ...
  title: string;
  journalProfileId: string;
  /** Curated papers source (collection-scoped RAG). */
  collectionId: string;
  /** Curated data source chosen up front (provenance + number registry). */
  selectedMeasurementIds: string[];
  sections: ManuscriptSection[];
  /** Consistent terminology across sections (coherence). */
  glossary: GlossaryTerm[];
  /** Numbers permitted in the draft, with provenance (Gap1). */
  numberRegistry: NumberEntry[];
  status: ManuscriptStatus;
  /** Snapshot counter bumped on each large generation. */
  version: number;
}

/** POST body for the section-generation route (client sends its manuscript state). */
export interface GenerateSectionRequest {
  manuscript: Manuscript;
  sectionType: ManuscriptSectionType;
  instruction?: string;
}

/** Final result streamed back when a section finishes generating. */
export interface SectionDraftResult {
  section: Exclude<SectionType, 'auto'>;
  draft: string;
  citations: WriterCitation[];
  grounding: WriterGrounding;
}
