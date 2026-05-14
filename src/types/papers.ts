/**
 * Paper processing types.
 * @phase R160-ai-5b-1
 * @see docs/ai/ai-5b-pipeline.md
 */

export type PaperStatus =
  | 'queued'
  | 'ocr'
  | 'chunking'
  | 'enriching'
  | 'embedding'
  | 'indexing'
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
  abstract: string;
  pageCount: number;

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
