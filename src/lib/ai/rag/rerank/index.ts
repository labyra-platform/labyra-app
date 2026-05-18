/**
 * Rerank provider factory.
 * @phase R160-ai-5d-1
 */
import 'server-only';
import type { RerankProvider } from './types';
import { VoyageRerankProvider } from './voyage';

let _provider: RerankProvider | null = null;

export function getRerankProvider(): RerankProvider {
  if (_provider) return _provider;
  _provider = new VoyageRerankProvider();
  return _provider;
}

export type { RerankedResult, RerankInput, RerankProvider, RerankResponse } from './types';
