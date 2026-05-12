/**
 * Rerank provider factory.
 * @phase R160-ai-5d-1
 */
import 'server-only';
import { VoyageRerankProvider } from './voyage';
import type { RerankProvider } from './types';

let _provider: RerankProvider | null = null;

export function getRerankProvider(): RerankProvider {
  if (_provider) return _provider;
  _provider = new VoyageRerankProvider();
  return _provider;
}

export type { RerankProvider, RerankInput, RerankResponse, RerankedResult } from './types';
