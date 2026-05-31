/**
 * OCR provider interface — engine-agnostic abstraction over
 * Mistral / Chandra / olmOCR / Docling / etc.
 *
 * Engine selection + fallback live in ./index, ./router, ./registry.
 * Per-engine license posture: docs/adr/ADR-048-ocr-engine-agnostic.md
 *
 * @phase R160-ai-5a, extended R257
 */

export type OcrMode = 'realtime' | 'batch';

/** Known OCR engine identifiers (see registry). */
export type OcrEngineId = 'mistral' | 'chandra' | 'olmocr' | 'docling';

export interface OcrPage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Extracted text (Markdown for Mistral/Chandra, plain for others) */
  text: string;
  /** Optional HTML rendering of the page (tables/math) — Chandra/olmOCR may set */
  html?: string;
  /** Optional table/figure markers */
  hasFigures?: boolean;
  hasTables?: boolean;
  /** Per-page confidence 0..1, if the engine reports one */
  confidence?: number;
}

export interface OcrResult {
  pages: OcrPage[];
  /** Total pages processed */
  pageCount: number;
  /** Full document text concatenated */
  fullText: string;
  /** Processing time */
  latencyMs: number;
  /** Cost in USD (0 for self-hosted engines unless configured) */
  costUsd: number;
  /** Engine id that produced this result */
  provider: string;
  /** Engine model/version string, e.g. 'mistral-ocr-latest', 'chandra-ocr-2' */
  engineVersion?: string;
  /** Detected dominant language (ISO code), if the engine reports one */
  language?: string;
  /** Set when a fallback engine produced the result (= the engine tried first) */
  fallbackFrom?: string;
  /** Raw, non-load-bearing engine metadata for observability/debugging */
  meta?: Record<string, unknown>;
}

export interface OcrProvider {
  readonly id: string;
  /** Cost per 1000 pages (USD); 0 for self-hosted */
  readonly costPer1000Pages: number;
  /** Process a PDF buffer into structured OCR output */
  processPdf(pdfBuffer: Buffer, options?: { mode?: OcrMode }): Promise<OcrResult>;
  /** Optional readiness check (config present / endpoint reachable) */
  health?(): Promise<boolean>;
}
