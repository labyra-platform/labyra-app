/**
 * Voyage AI embedding client — REST implementation.
 * @phase R160-ai-5a
 * Note: SDK voyageai@0.2.1 has ESM directory import bug; using REST instead.
 */
import 'server-only';

const VOYAGE_API_BASE = 'https://api.voyageai.com/v1';

export const VOYAGE_EMBED_MODEL = 'voyage-3-large';
export const VOYAGE_EMBED_DIM = 1024;
export const VOYAGE_RERANK_MODEL = 'rerank-2.5';

function getApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key?.startsWith('pa-')) {
    throw new Error('VOYAGE_API_KEY missing or malformed (expected pa-...). Set in .env.local');
  }
  return key;
}

interface VoyageEmbedResult {
  embeddings: number[][];
  totalTokens: number;
}

interface EmbedApiResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  usage?: { total_tokens?: number };
}

export async function voyageEmbed(
  texts: string[],
  inputType: 'document' | 'query'
): Promise<VoyageEmbedResult> {
  if (texts.length === 0) return { embeddings: [], totalTokens: 0 };

  const res = await fetch(`${VOYAGE_API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_EMBED_MODEL,
      input_type: inputType
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Voyage embed failed: ${res.status} ${errText.slice(0, 300)}`);
  }

  const data: EmbedApiResponse = await res.json();
  const embeddings = (data.data ?? [])
    .map((d) => d.embedding ?? [])
    .filter((e): e is number[] => e.length > 0);
  const totalTokens = data.usage?.total_tokens ?? 0;
  return { embeddings, totalTokens };
}

interface VoyageRerankResult {
  rankedIndices: number[];
  scores: number[];
  totalTokens: number;
}

interface RerankApiResponse {
  data?: Array<{ index?: number; relevance_score?: number }>;
  usage?: { total_tokens?: number };
}

export async function voyageRerank(
  query: string,
  documents: string[],
  topK?: number
): Promise<VoyageRerankResult> {
  if (documents.length === 0) return { rankedIndices: [], scores: [], totalTokens: 0 };

  const body: Record<string, unknown> = {
    query,
    documents,
    model: VOYAGE_RERANK_MODEL
  };
  if (topK !== undefined) body.top_k = topK;

  const res = await fetch(`${VOYAGE_API_BASE}/rerank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Voyage rerank failed: ${res.status} ${errText.slice(0, 300)}`);
  }

  const data: RerankApiResponse = await res.json();
  const rankedIndices: number[] = [];
  const scores: number[] = [];
  for (const item of data.data ?? []) {
    if (typeof item.index === 'number' && typeof item.relevance_score === 'number') {
      rankedIndices.push(item.index);
      scores.push(item.relevance_score);
    }
  }
  const totalTokens = data.usage?.total_tokens ?? 0;
  return { rankedIndices, scores, totalTokens };
}

/** voyage-3-large: $0.18 / 1M tokens */
export function voyageEmbedCostUsd(totalTokens: number): number {
  return Number(((totalTokens / 1_000_000) * 0.18).toFixed(6));
}

/** rerank-2.5: $0.05 / 1M tokens */
export function voyageRerankCostUsd(totalTokens: number): number {
  return Number(((totalTokens / 1_000_000) * 0.05).toFixed(6));
}
