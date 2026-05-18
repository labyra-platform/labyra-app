/**
 * Mistral OCR 3 implementation.
 * @phase R160-ai-5a
 *
 * Pricing (2026): $1 per 1000 pages (batch), ~$2/1000 (realtime)
 * Accuracy: 96.6% on tables, native LaTeX, Markdown output
 */
import 'server-only';
import { Mistral } from '@mistralai/mistralai';
import type { OcrPage, OcrProvider, OcrResult } from './types';

let _client: Mistral | null = null;

function getClient(): Mistral {
  if (_client) return _client;
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY missing. Set in .env.local');
  }
  _client = new Mistral({ apiKey });
  return _client;
}

export class MistralOcrProvider implements OcrProvider {
  readonly id = 'mistral-ocr-3';
  readonly costPer1000Pages = 1; // USD batch

  async processPdf(pdfBuffer: Buffer): Promise<OcrResult> {
    const startedAt = Date.now();
    const client = getClient();

    // Upload PDF to Mistral
    const uploaded = await client.files.upload({
      file: {
        fileName: 'document.pdf',
        content: pdfBuffer
      },
      purpose: 'ocr'
    });

    const fileId = uploaded.id;

    // Get signed URL for OCR processing
    const signedUrl = await client.files.getSignedUrl({ fileId });

    // Process with OCR
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ocrResponse = await (client as any).ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: signedUrl.url
      }
    });

    // Parse pages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages: OcrPage[] = (ocrResponse.pages ?? []).map((p: any, idx: number) => ({
      pageNumber: p.index !== undefined ? p.index + 1 : idx + 1,
      text: p.markdown ?? '',
      hasFigures: (p.images ?? []).length > 0,
      hasTables: (p.markdown ?? '').includes('|')
    }));

    const fullText = pages.map((p) => p.text).join('\n\n');
    const pageCount = pages.length;
    const latencyMs = Date.now() - startedAt;
    const costUsd = Number(((pageCount / 1000) * this.costPer1000Pages).toFixed(6));

    // Cleanup uploaded file
    try {
      await client.files.delete({ fileId });
    } catch {
      // Best-effort cleanup
    }

    return {
      pages,
      pageCount,
      fullText,
      latencyMs,
      costUsd,
      provider: this.id
    };
  }
}
