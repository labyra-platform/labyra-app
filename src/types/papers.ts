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

export interface Paper {
  schemaVersion: 1;

  // Identity
  id: string;
  tenantId: string;
  version: number;

  // Source
  source: 'upload' | 'doi-import' | 'crossref';
  storagePath: string;
  contentHash: string;
  fileSize: number;
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
