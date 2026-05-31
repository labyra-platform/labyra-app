/**
 * Chandra 2 OCR adapter (self-hosted).
 *
 * Talks to YOUR Chandra server over HTTP (e.g. an HF Space / vLLM box running
 * `chandra-ocr`). Endpoint is fully configurable; this adapter is engine-glue
 * only and ships no model weights.
 *
 * License posture (see docs/adr/ADR-048):
 *   - chandra-ocr CODE = Apache-2.0 (unrestricted commercial use)
 *   - model WEIGHTS    = modified OpenRAIL-M: free while (prior-year gross
 *     revenue < $2M) AND (total funding raised < $2M) AND not offering an OCR
 *     service that competes with Datalab. Internal RAG ingest = OK at our stage.
 *   - Above the $2M gate: buy a Datalab commercial license OR switch OCR_ENGINE
 *     to a permissive engine (olmocr / docling). That swap is this file's reason
 *     to exist.
 *
 * Config:
 *   CHANDRA_OCR_URL        full POST endpoint of your server (required)
 *   CHANDRA_OCR_TOKEN      optional bearer token
 *   CHANDRA_COST_PER_1000  optional USD/1000 pages for cost attribution (default 0)
 *
 * @phase R257
 */
import 'server-only';
import type { OcrMode, OcrPage, OcrProvider, OcrResult } from './types';

interface ChandraApiPage {
  markdown?: string;
  text?: string;
  html?: string;
  page?: number;
  page_number?: number;
}

interface ChandraApiResponse {
  pages?: ChandraApiPage[];
  markdown?: string;
  language?: string;
}

/**
 * ── ALIGN THIS to your server's actual JSON shape. ──
 * This is the single place to touch when wiring your Chandra endpoint.
 * Default assumes: { pages: [{ markdown, html?, page? }], language? }.
 */
function parseChandraResponse(data: ChandraApiResponse): { pages: OcrPage[]; language?: string } {
  const rawPages = data.pages ?? [];
  if (rawPages.length > 0) {
    const pages: OcrPage[] = rawPages.map((p, idx) => {
      const text = p.markdown ?? p.text ?? '';
      return {
        pageNumber: p.page ?? p.page_number ?? idx + 1,
        text,
        html: p.html,
        hasTables: text.includes('|'),
        hasFigures: Boolean(p.html && p.html.includes('<img'))
      };
    });
    return { pages, language: data.language };
  }
  // Fallback: single-blob markdown response → one synthetic page
  const blob = data.markdown ?? '';
  return {
    pages: [{ pageNumber: 1, text: blob, hasTables: blob.includes('|') }],
    language: data.language
  };
}

export class ChandraOcrProvider implements OcrProvider {
  readonly id = 'chandra-ocr-2';
  readonly costPer1000Pages = Number(process.env.CHANDRA_COST_PER_1000 ?? 0);

  async processPdf(pdfBuffer: Buffer, _options?: { mode?: OcrMode }): Promise<OcrResult> {
    const url = process.env.CHANDRA_OCR_URL;
    if (!url) {
      throw new Error('CHANDRA_OCR_URL missing. Set it to your Chandra server endpoint.');
    }
    const startedAt = Date.now();

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }),
      'document.pdf'
    );

    const headers: Record<string, string> = {};
    const token = process.env.CHANDRA_OCR_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { method: 'POST', body: form, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Chandra OCR failed: ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as ChandraApiResponse;
    const { pages, language } = parseChandraResponse(data);

    const fullText = pages.map((p) => p.text).join('\n\n');
    const pageCount = pages.length;
    const latencyMs = Date.now() - startedAt;
    const costUsd = Number(((pageCount / 1000) * this.costPer1000Pages).toFixed(6));

    return {
      pages,
      pageCount,
      fullText,
      latencyMs,
      costUsd,
      provider: this.id,
      engineVersion: 'chandra-ocr-2',
      language,
      meta: { endpoint: url }
    };
  }

  health(): Promise<boolean> {
    return Promise.resolve(Boolean(process.env.CHANDRA_OCR_URL));
  }
}
