/**
 * OCR provider interface — abstraction over Mistral / Chandra / Textract / etc.
 * @phase R160-ai-5a
 */

export interface OcrPage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Extracted text (Markdown for Mistral, plain for others) */
  text: string;
  /** Optional table/figure markers */
  hasFigures?: boolean;
  hasTables?: boolean;
}

export interface OcrResult {
  pages: OcrPage[];
  /** Total pages processed */
  pageCount: number;
  /** Full document text concatenated */
  fullText: string;
  /** Processing time */
  latencyMs: number;
  /** Cost in USD */
  costUsd: number;
  /** Provider used */
  provider: string;
}

export interface OcrProvider {
  readonly id: string;
  /** Cost per 1000 pages (USD) */
  readonly costPer1000Pages: number;
  /** Process a PDF buffer */
  processPdf(pdfBuffer: Buffer, options?: { mode?: 'realtime' | 'batch' }): Promise<OcrResult>;
}
