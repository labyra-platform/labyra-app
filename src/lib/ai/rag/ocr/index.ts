/**
 * OCR provider entrypoint — engine-agnostic.
 *
 * Engine is chosen by env (default: mistral, preserving prior behaviour):
 *   OCR_ENGINE    mistral | chandra | olmocr | docling
 *   OCR_FALLBACK  comma-separated engine ids tried in order if primary throws
 *                 (e.g. OCR_FALLBACK=mistral)
 *
 * Per-engine license posture: docs/adr/ADR-048-ocr-engine-agnostic.md
 * @phase R160-ai-5a, R257 (registry + routing)
 */
import 'server-only';
import { logger } from '@/lib/logger';
import { resolveOcrEngine } from './registry';
import { RoutingOcrProvider } from './router';
import type { OcrProvider } from './types';

let _provider: OcrProvider | null = null;

function buildProvider(): OcrProvider {
  // R260: warn-level (survives prod; info is stripped by removeConsole) so the
  // active OCR engine + runtime env are observable in production without guesswork.
  logger.warn('ocr.engine.config', {
    feature: 'ocr',
    requested: process.env.OCR_ENGINE?.trim() || '(unset->mistral)',
    fallbackRaw: process.env.OCR_FALLBACK?.trim() || '(none)',
    datalabKeyPresent: Boolean(process.env.DATALAB_API_KEY),
    mistralKeyPresent: Boolean(process.env.MISTRAL_API_KEY)
  });

  const primary = resolveOcrEngine(process.env.OCR_ENGINE);

  const fallbackIds = (process.env.OCR_FALLBACK ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  logger.warn('ocr.engine.selected', {
    feature: 'ocr',
    selected: primary.id,
    fallback: fallbackIds.join(',') || '(none)'
  });

  if (fallbackIds.length === 0) return primary;

  const chain: OcrProvider[] = [primary, ...fallbackIds.map((id) => resolveOcrEngine(id))];
  return new RoutingOcrProvider(chain);
}

export function getOcrProvider(): OcrProvider {
  if (_provider) return _provider;
  _provider = buildProvider();
  return _provider;
}

export { OCR_ENGINES, resolveOcrEngine } from './registry';
export type { OcrEngineInfo } from './registry';
export type { OcrEngineId, OcrMode, OcrPage, OcrProvider, OcrResult } from './types';
