/**
 * Embedding step — Voyage batch embed.
 * @phase R160-ai-5b-2
 */
import 'server-only';
import { trackUsage } from '@/lib/ai/governance/quota';
import { getEmbeddingProvider } from '@/lib/ai/rag/embedding';
import type { EnrichedChunk } from './enrich-step';
import { incrementPaperCost, throwIfCancelled } from './state';

const EMBED_BATCH_SIZE = 128;

export interface EmbeddedChunk extends EnrichedChunk {
  embedding: number[];
}

interface EmbedStepInput {
  tenantId: string;
  chunks: EnrichedChunk[];
  paperId: string;
  signal: AbortSignal;
}

export async function runEmbedStep(input: EmbedStepInput): Promise<EmbeddedChunk[]> {
  const { tenantId, paperId, chunks, signal } = input;
  const provider = getEmbeddingProvider();
  const result: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    throwIfCancelled(signal);

    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) => c.contextualText);

    const { embeddings, totalTokens, costUsd } = await provider.embed(texts, 'document');

    if (embeddings.length !== batch.length) {
      throw new Error(
        `embedding_count_mismatch: expected ${batch.length}, got ${embeddings.length}`
      );
    }

    for (let j = 0; j < batch.length; j++) {
      result.push({
        ...batch[j],
        embedding: embeddings[j]
      });
    }

    await incrementPaperCost(tenantId, paperId, 'embedding', costUsd);
    await trackUsage(tenantId, 'embedTokens', totalTokens, costUsd);
  }

  return result;
}
