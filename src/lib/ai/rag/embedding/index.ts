/**
 * Embedding provider abstraction.
 * Currently: Voyage AI only. Future: easy to add OpenAI/Cohere by implementing interface.
 * @phase R160-ai-5a
 */
import 'server-only';
import {
  VOYAGE_EMBED_DIM,
  voyageEmbed,
  voyageEmbedCostUsd,
  voyageRerank,
  voyageRerankCostUsd
} from './voyage';

export const EMBEDDING_DIMENSION = VOYAGE_EMBED_DIM;

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimension: number;
  embed(
    texts: string[],
    inputType: 'document' | 'query'
  ): Promise<{
    embeddings: number[][];
    totalTokens: number;
    costUsd: number;
  }>;
  rerank(
    query: string,
    documents: string[],
    topK?: number
  ): Promise<{
    rankedIndices: number[];
    scores: number[];
    totalTokens: number;
    costUsd: number;
  }>;
}

class VoyageProvider implements EmbeddingProvider {
  readonly id = 'voyage';
  readonly dimension = VOYAGE_EMBED_DIM;

  async embed(texts: string[], inputType: 'document' | 'query') {
    const result = await voyageEmbed(texts, inputType);
    return {
      ...result,
      costUsd: voyageEmbedCostUsd(result.totalTokens)
    };
  }

  async rerank(query: string, documents: string[], topK?: number) {
    const result = await voyageRerank(query, documents, topK);
    return {
      ...result,
      costUsd: voyageRerankCostUsd(result.totalTokens)
    };
  }
}

let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (_provider) return _provider;
  _provider = new VoyageProvider();
  return _provider;
}
