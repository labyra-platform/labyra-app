/**
 * Routing OCR provider — runs a primary engine and falls through to fallbacks
 * on failure. First success wins; records `fallbackFrom` when a non-primary
 * engine produced the result. @phase R257
 */
import 'server-only';
import { logger } from '@/lib/logger';
import type { OcrMode, OcrProvider, OcrResult } from './types';

export class RoutingOcrProvider implements OcrProvider {
  readonly id: string;
  readonly costPer1000Pages: number;
  private readonly chain: OcrProvider[];

  constructor(chain: OcrProvider[]) {
    const [primary] = chain;
    if (!primary) {
      throw new Error('RoutingOcrProvider requires at least one provider');
    }
    this.chain = chain;
    this.id = `routing(${chain.map((p) => p.id).join('>')})`;
    this.costPer1000Pages = primary.costPer1000Pages;
  }

  async processPdf(pdfBuffer: Buffer, options?: { mode?: OcrMode }): Promise<OcrResult> {
    const primaryId = this.chain[0]?.id ?? 'unknown';
    let lastError: unknown;
    let idx = 0;

    for (const provider of this.chain) {
      try {
        const result = await provider.processPdf(pdfBuffer, options);
        if (idx > 0) {
          logger.warn('ocr.fallback.success', {
            feature: 'ocr',
            provider: provider.id,
            fallbackFrom: primaryId
          });
          return { ...result, fallbackFrom: primaryId };
        }
        return result;
      } catch (error) {
        lastError = error;
        logger.error('ocr.provider.failed', {
          feature: 'ocr',
          provider: provider.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      idx += 1;
    }

    const tried = this.chain.map((p) => p.id).join(', ');
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All OCR providers failed (${tried}): ${detail}`);
  }

  async health(): Promise<boolean> {
    const [first] = this.chain;
    if (!first) return false;
    return first.health ? first.health() : true;
  }
}
