/**
 * Rerank provider interface.
 * @phase R160-ai-5d-1
 */

export interface RerankInput {
  query: string;
  documents: string[];
  topN: number;
}

export interface RerankedResult {
  index: number; // original index in documents[]
  relevanceScore: number; // 0-1
}

export interface RerankResponse {
  results: RerankedResult[];
  tokensUsed: number;
  costUsd: number;
}

export interface RerankProvider {
  readonly id: string;
  readonly model: string;
  rerank(input: RerankInput): Promise<RerankResponse>;
}
