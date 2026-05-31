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
import { resolveOcrEngine } from './registry';
import { RoutingOcrProvider } from './router';
import type { OcrProvider } from './types';

let _provider: OcrProvider | null = null;

function buildProvider(): OcrProvider {
  const primary = resolveOcrEngine(process.env.OCR_ENGINE);

  const fallbackIds = (process.env.OCR_FALLBACK ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

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
