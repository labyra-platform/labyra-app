/**
 * Sparse encoder factory.
 * @phase R160-ai-5d-2
 */
import 'server-only';
import { BM25Encoder } from './bm25';
import { getHybridTokenizer } from './hybrid-tokenizer';
import type { SparseEncoder } from './types';

export function createSparseEncoder(): SparseEncoder {
  return new BM25Encoder(getHybridTokenizer());
}

export { BM25Encoder } from './bm25';
export { getHybridTokenizer, HybridTokenizer } from './hybrid-tokenizer';
export type { BM25Params, SparseEncoder, SparseVector, Tokenizer } from './types';
