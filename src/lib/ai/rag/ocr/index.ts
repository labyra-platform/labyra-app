/**
 * OCR provider abstraction.
 * Currently: Mistral OCR 3 active. Future providers (Chandra, Textract) implement OcrProvider.
 * @phase R160-ai-5a
 */
import 'server-only';
import { MistralOcrProvider } from './mistral';
import type { OcrProvider } from './types';

let _provider: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (_provider) return _provider;
  _provider = new MistralOcrProvider();
  return _provider;
}

export type { OcrPage, OcrProvider, OcrResult } from './types';
