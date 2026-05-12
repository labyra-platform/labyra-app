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
export { HybridTokenizer, getHybridTokenizer } from './hybrid-tokenizer';
export type { SparseEncoder, SparseVector, BM25Params, Tokenizer } from './types';
