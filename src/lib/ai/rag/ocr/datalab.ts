/**
 * Datalab hosted API adapter (Marker endpoint) — async POST + poll.
 *
 * This is Datalab's PAID managed service (https://www.datalab.to/api/v1/marker),
 * NOT self-hosted weights. Therefore the Chandra OpenRAIL **$2M gate does NOT
 * apply** here — you pay per page for a cloud service (like Mistral OCR). Billing:
 * per-page credits, see https://www.datalab.to/app/plans. (Self-hosting the open
 * Chandra weights instead → chandra.ts; that path is free but carries the $2M
 * license gate. Choosing between them is exactly what this layer is for — ADR-048.)
 *
 * Flow: POST /api/v1/marker (multipart) → { request_id, request_check_url }
 *       → poll GET request_check_url until status === 'complete'
 *       → { markdown, page_count, status, success, ... }
 *
 * Config:
 *   DATALAB_API_KEY        required — your key (https://www.datalab.to/app/keys)
 *   DATALAB_USE_LLM        'true' → higher accuracy but small hallucination risk + slower (default false)
 *   DATALAB_LANGS          optional comma-separated OCR languages, e.g. "English,Vietnamese"
 *   DATALAB_COST_PER_1000  optional USD/1000 pages for cost attribution (default 0)
 *   DATALAB_MARKER_URL     optional endpoint override (default https://www.datalab.to/api/v1/marker)
 *
 * @phase R258
 */
import 'server-only';
import { logger } from '@/lib/logger';
import type { OcrFigure, OcrMode, OcrPage, OcrProvider, OcrResult } from './types';

const DEFAULT_MARKER_URL = 'https://www.datalab.to/api/v1/marker';
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 180; // ~6 min ceiling

interface MarkerSubmitResponse {
  success?: boolean;
  error?: string | null;
  request_id?: string;
  request_check_url?: string;
}

interface MarkerResultResponse {
  status?: string; // 'processing' | 'complete'
  success?: boolean;
  error?: string | null;
  output_format?: string;
  markdown?: string;
  page_count?: number;
  /** Datalab Marker returns extracted figures as { filename: base64 }. */
  images?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Marker paginated delimiter (verified): `\n\n{PAGE_NUMBER}` + 48 dashes + `\n\n`,
 * with PAGE_NUMBER 0-indexed. If no markers found (format change), the whole blob
 * becomes one page so OCR still works (coarse page attribution).
 */
function splitPaginatedMarkdown(md: string): OcrPage[] {
  const re = /\{(\d+)\}-{48}/g;
  const markers: { num: number; index: number; len: number }[] = [];
  let m = re.exec(md);
  while (m) {
    markers.push({ num: Number(m[1]), index: m.index, len: m[0].length });
    m = re.exec(md);
  }
  if (markers.length === 0) {
    const text = md.trim();
    return [{ pageNumber: 1, text, hasTables: text.includes('|') }];
  }
  const pages: OcrPage[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const cur = markers[i];
    const next = markers[i + 1];
    const start = cur.index + cur.len;
    const end = next ? next.index : md.length;
    const text = md.slice(start, end).trim();
    pages.push({ pageNumber: cur.num + 1, text, hasTables: text.includes('|') });
  }
  return pages;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class DatalabOcrProvider implements OcrProvider {
  readonly id = 'datalab-marker';
  readonly costPer1000Pages = Number(process.env.DATALAB_COST_PER_1000 ?? 0);

  async processPdf(pdfBuffer: Buffer, _options?: { mode?: OcrMode }): Promise<OcrResult> {
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey) {
      throw new Error('DATALAB_API_KEY missing. Set it (https://www.datalab.to/app/keys).');
    }
    const url = process.env.DATALAB_MARKER_URL ?? DEFAULT_MARKER_URL;
    const headers: Record<string, string> = { 'X-Api-Key': apiKey };
    const startedAt = Date.now();

    // 1. Submit (async; returns request_check_url)
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }),
      'document.pdf'
    );
    form.append('output_format', 'markdown');
    form.append('paginate', 'true');
    if (process.env.DATALAB_USE_LLM === 'true') form.append('use_llm', 'true');
    const langs = process.env.DATALAB_LANGS;
    if (langs) form.append('langs', langs);

    const submitRes = await fetch(url, { method: 'POST', body: form, headers });
    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => '');
      throw new Error(
        `Datalab submit failed: ${submitRes.status} ${submitRes.statusText} ${body.slice(0, 300)}`
      );
    }
    const submit = (await submitRes.json()) as MarkerSubmitResponse;
    if (!submit.success || !submit.request_check_url) {
      throw new Error(`Datalab submit error: ${submit.error ?? 'no request_check_url returned'}`);
    }

    // 2. Poll until complete
    const checkUrl = submit.request_check_url;
    let result: MarkerResultResponse | null = null;
    for (let i = 0; i < MAX_POLLS; i += 1) {
      await sleep(POLL_INTERVAL_MS);
      const pollRes = await fetch(checkUrl, { method: 'GET', headers });
      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => '');
        throw new Error(
          `Datalab poll failed: ${pollRes.status} ${pollRes.statusText} ${body.slice(0, 200)}`
        );
      }
      const data = (await pollRes.json()) as MarkerResultResponse;
      if (data.status === 'complete') {
        result = data;
        break;
      }
    }

    if (!result) {
      throw new Error(`Datalab timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
    }
    if (!result.success) {
      throw new Error(`Datalab conversion failed: ${result.error ?? 'unknown error'}`);
    }

    // 3. Map → OcrResult
    const markdown = result.markdown ?? '';
    const pages = splitPaginatedMarkdown(markdown);
    const apiPageCount = typeof result.page_count === 'number' ? result.page_count : pages.length;
    const fullText = pages.map((p) => p.text).join('\n\n');
    const latencyMs = Date.now() - startedAt;
    const costUsd = Number(((apiPageCount / 1000) * this.costPer1000Pages).toFixed(6));

    // Extracted figures — best-effort; never let image parsing break OCR.
    let figures: OcrFigure[] | undefined;
    try {
      const imgs = result.images;
      if (imgs && typeof imgs === 'object' && Object.keys(imgs).length > 0) {
        const pageOf = new Map<string, number>();
        for (const pg of pages) {
          for (const m of pg.text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
            const ref = m[1].trim();
            if (!pageOf.has(ref)) pageOf.set(ref, pg.pageNumber);
          }
        }
        figures = Object.entries(imgs).map(([name, dataBase64]) => ({
          name,
          page: pageOf.get(name) ?? 0,
          mimeType: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg',
          dataBase64
        }));
      }
    } catch {
      figures = undefined;
    }

    logger.info('ocr.datalab.complete', {
      feature: 'ocr',
      provider: this.id,
      pageCount: apiPageCount,
      latencyMs,
      costUsd
    });

    return {
      pages,
      pageCount: apiPageCount,
      fullText,
      latencyMs,
      costUsd,
      provider: this.id,
      engineVersion: 'datalab-marker',
      figures,
      meta: { endpoint: url, requestId: submit.request_id }
    };
  }

  health(): Promise<boolean> {
    return Promise.resolve(Boolean(process.env.DATALAB_API_KEY));
  }
}
