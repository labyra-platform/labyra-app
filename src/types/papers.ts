/**
 * Paper processing types.
 * @phase R160-ai-5b-1
 * @see docs/ai/ai-5b-pipeline.md
 */

// R177-1e: documentType for book/article/thesis classification (Python
// worker R177-1d detects this from page-1 OCR signals; routes resolution
// path: article→Crossref+OpenAlex, book→Google Books API).
export type DocumentType = 'article' | 'book' | 'thesis' | 'unknown';

// R166-ai6a-3b-fix: added 'extracting_citations' for ai-6 pipeline step 6
export type PaperStatus =
  | 'queued'
  | 'ocr'
  | 'chunking'
  | 'enriching'
  | 'embedding'
  | 'indexing'
  | 'extracting_citations'
  | 'indexed'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

/** Terminal states — processing has stopped */
export const TERMINAL_STATUSES: ReadonlySet<PaperStatus> = new Set([
  'indexed',
  'failed',
  'cancelled'
]);

/** States where cancellation is meaningful */
export const CANCELLABLE_STATUSES: ReadonlySet<PaperStatus> = new Set([
  'queued',
  'ocr',
  'chunking',
  'enriching',
  'embedding',
  'indexing'
]);

export interface PaperCostBreakdown {
  ocr: number;
  enrichment: number;
  embedding: number;
  total: number;
}

// R164-phase-1-types: Paper now extends ProvBase (PROV-O architecture per ADR-016).
// Existing fields preserved; schemaVersion bumped 1 → 2.
import type { ProvBase } from './prov-base';

export interface Paper extends ProvBase {
  schemaVersion: 2;
  /**
   * ADR-034 TEAM-3a: research group that owns this paper for KB isolation.
   * 'lab-shared' = visible to all groups in the tenant. A real groupId scopes
   * it to that group. Read-path filtering lands in TEAM-4; Pinecone metadata
   * filter in TEAM-5.
   */
  groupId: string;
  // Versioning (immutable scientific records per ADR-016)
  currentVersion: number;
  // Original fields kept for backward compat:

  // Identity (id + tenantId + createdBy etc. inherited from ProvBase)
  version: number; // schema field, NOT to confuse with currentVersion (R164 versioning)

  // Source
  source: 'upload' | 'doi-import' | 'crossref';
  storagePath: string;
  contentHash: string;
  fileSize: number;
  // @deprecated Use createdBy/createdAt from ProvBase. Kept for R164 transition.
  uploadedBy: string;
  uploadedAt: number;

  // Metadata (filled during processing)
  title: string;
  authors: string[];
  year: number;
  doi: string;
  /** R237cc: false when the DOI didn't resolve at Crossref/OpenAlex (likely an
   * OCR error). undefined for papers processed before this check existed. */
  doiVerified?: boolean;
  /** R282: 'manual' = user-corrected (worker preserves it across reprocess). */
  doiSource?: 'manual' | 'extracted';
  abstract: string;
  pageCount: number;

  /**
   * Link to the paper's Supplementary Information (R237bv). User-provided
   * (the only reliable source — publishers rarely deposit SI relations to
   * Crossref). May be auto-filled best-effort from Crossref relation later.
   */
  siUrl?: string;

  // R177-1e: documentType + book/non-article fields.
  // documentType defaults 'unknown' for legacy papers (pre-R177-1d).
  // Book fields (isbn, publisher, bookSubtitle, bookPageCount,
  // bookSourceId, bookResolvedAt) populated only when documentType='book'
  // via Google Books API resolution.
  documentType: DocumentType;

  // R178-3: domain classification (taxonomy v1) — @r178-3-hotfix1-applied
  /** Primary domain slug (one of 25 PRIMARY_DOMAINS). '' if not yet classified. */
  domain?: string;
  /** 0-4 subtopic slugs from SUBTOPIC_DOMAINS. */
  subtopics?: string[];
  /** Self-assessed Gemini confidence. */
  domainConfidence?: 'high' | 'medium' | 'low';
  /** Epoch ms when classification written. */
  domainClassifiedAt?: number;
  /** e.g., gemini-3-flash-preview — for audit + targeted reclassify. */
  domainModelVersion?: string;
  /** e.g., v1.0 — bump when prompt changes. */
  domainPromptVersion?: string;
  /** e.g., v1 — bump when taxonomy slugs change. */
  domainTaxonomyVersion?: string;

  // R237bz: OpenAlex authoritative classification (Domain→Field→Subfield→Topic).
  // Set from primary_topic when the paper has a DOI (free lookup). Primary
  // classification (badge + filter); Gemini taxonomy above is kept for
  // materials-specific subtopics. '' / undefined when no DOI or not in OpenAlex.
  /** Top-level domain, e.g. "Physical Sciences". */
  openalexDomain?: string;
  /** Field, e.g. "Materials Science". */
  openalexField?: string;
  /** Subfield, e.g. "Electronic, Optical and Magnetic Materials". */
  openalexSubfield?: string;
  /** Primary topic display name. */
  openalexTopic?: string;
  /** primary_topic.score (0–1) — model confidence. */
  openalexTopicScore?: number;
  /** OpenAlex topic id URL, e.g. "https://openalex.org/T10024". */
  openalexTopicId?: string;

  // R179-2: journal metadata via Crossref/OpenAlex — @r179-2-applied
  /** Full journal name (Crossref container-title). '' if unresolved. */
  journal?: string;
  /** Abbreviated journal name (Crossref short-container-title). */
  journalShort?: string;
  /** 0-2 ISSN strings (print + electronic). */
  journalIssn?: string[];
  /** 'crossref' | 'openalex' | '' if both failed. */
  journalSourceId?: 'crossref' | 'openalex' | '';
  /** Epoch ms when Step 1e completed. */
  journalResolvedAt?: number;
  isbn: string;
  publisher: string;
  bookSubtitle?: string;
  bookPageCount?: number;
  bookSourceId?: string;
  bookResolvedAt?: number;

  // State machine
  status: PaperStatus;
  statusUpdatedAt: number;
  error: string;
  cancelRequestedAt: number;
  retryCount: number;
  maxRetries: number;

  // Progressive counts
  chunkCount: number;
  enrichedChunkCount: number;
  embeddedChunkCount: number;
  indexedChunkCount: number;

  // Cost
  costUsd: PaperCostBreakdown;

  // Timing
  processingStartedAt: number;
  processingCompletedAt: number;
  totalLatencyMs: number;
}

export interface PaperChunkDoc {
  schemaVersion: 1;
  id: string;
  paperId: string;
  chunkIdx: number;
  text: string;
  contextualText: string;
  pages: number[];
  section: string;
  tokens: number;
}

export interface MonthlyUsage {
  schemaVersion: 1;
  tenantId: string;
  yearMonth: string; // 'YYYY-MM'
  papersCount: number;
  embedTokens: number;
  reasoningTokens: number;
  storageBytes: number;
  costUsd: number;
  updatedAt: number;
}

export type UsageAction = 'paper' | 'embedTokens' | 'reasoningTokens' | 'storage';

// R164-phase-1-types: Paper version snapshot (sub-collection)
export interface PaperVersion {
  id: string;
  version: number;
  content: Paper;
  changedBy: string;
  changedAt: number;
  changeNote?: string;
}
