/**
 * Voyage rerank-2.5 implementation via REST API.
 * @phase R160-ai-5d-1
 *
 * Voyage SDK had ESM bug (ai-5a notes). Using REST directly.
 * API docs: https://docs.voyageai.com/reference/reranker-api
 */
import 'server-only';
import type { RerankProvider, RerankInput, RerankResponse } from './types';

const VOYAGE_RERANK_ENDPOINT = 'https://api.voyageai.com/v1/rerank';

// Voyage rerank-2.5 pricing (2026-05): $0.05/M tokens
const COST_PER_M_TOKENS = 0.05;

interface VoyageRerankResult {
  index: number;
  relevance_score: number;
}

interface VoyageRerankApiResponse {
  data: VoyageRerankResult[];
  usage: { total_tokens: number };
}

export class VoyageRerankProvider implements RerankProvider {
  readonly id = 'voyage';
  readonly model = 'rerank-2.5';

  async rerank(input: RerankInput): Promise<RerankResponse> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

    if (input.documents.length === 0) {
      return { results: [], tokensUsed: 0, costUsd: 0 };
    }

    const body = {
      query: input.query,
      documents: input.documents,
      model: this.model,
      top_k: Math.min(input.topN, input.documents.length),
      truncation: true
    };

    const res = await fetch(VOYAGE_RERANK_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`voyage_rerank_failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as VoyageRerankApiResponse;

    const tokensUsed = json.usage?.total_tokens ?? 0;
    const costUsd = (tokensUsed / 1_000_000) * COST_PER_M_TOKENS;

    return {
      results: json.data.map((r) => ({
        index: r.index,
        relevanceScore: r.relevance_score
      })),
      tokensUsed,
      costUsd: Number(costUsd.toFixed(6))
    };
  }
}
