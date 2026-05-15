/**
 * Contextual enrichment — Haiku 4.5 with prompt cache.
 *
 * Pattern from Anthropic Contextual Retrieval:
 *   For each chunk, generate 50-100 token summary placing chunk in document context.
 *   This summary is PREPENDED to chunk text before embedding (improves retrieval ~35%).
 *
 * Cost optimization: full document Markdown cached in system prompt (1h TTL).
 * Each chunk request only pays for chunk tokens + summary output.
 *
 * @phase R160-ai-5b-2
 */
// R165-phase-1-oxlint: oxlint cleanup
import 'server-only';
import { selectProvider } from '@/lib/ai/providers';
import { incrementPaperCost, throwIfCancelled } from './state';
import { trackUsage } from '@/lib/ai/governance/quota';
import type { Chunk } from './chunking';

interface EnrichStepInput {
  tenantId: string;
  paperId: string;
  fullDocumentMd: string;
  chunks: Chunk[];
  signal: AbortSignal;
}

export interface EnrichedChunk extends Chunk {
  contextualText: string;
}

const ENRICH_SYSTEM = `<document>
{{DOCUMENT}}
</document>

Here is a chunk we want to situate within the whole document.
Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

export async function runEnrichStep(input: EnrichStepInput): Promise<EnrichedChunk[]> {
  const { tenantId, paperId, fullDocumentMd, chunks, signal } = input;

  // Hotfix-4: skip enrichment by default (cost ~$0.10/paper not justified pre-PMF)
  // Set ENABLE_ENRICHMENT=true in .env.local to re-enable (35% retrieval boost)
  const enrichmentEnabled = process.env.ENABLE_ENRICHMENT === 'true';
  if (!enrichmentEnabled) {
    // eslint-disable-next-line no-console -- structured logging for audit
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'enrichment_skipped',
        paperId,
        reason: 'ENABLE_ENRICHMENT=false (cost optimization)',
        chunks: chunks.length
      })
    );
    return chunks.map((chunk) => ({
      ...chunk,
      contextualText: chunk.text // raw text = contextual when no enrichment
    }));
  }

  // Use Haiku tier (cheap, prompt cached)
  const haikuConfig = {
    model: 'claude-haiku-4-5-20251001',
    region: 'us-east-1' as const
  };

  // Build system prompt with cached document
  const systemText = ENRICH_SYSTEM.replace('{{DOCUMENT}}', fullDocumentMd);

  const { provider } = selectProvider(2); // T2 = Anthropic (T1 Gemini doesn't support Haiku)
  const enriched: EnrichedChunk[] = [];

  for (const chunk of chunks) {
    throwIfCancelled(signal);

    try {
      const { text, usage } = await provider.complete({
        model: haikuConfig.model,
        maxTokens: 150,
        temperature: 0.3,
        system: [
          {
            text: systemText,
            cache: true,
            cacheTtl: '1h'
          }
        ],
        messages: [
          {
            role: 'user',
            content: `<chunk>\n${chunk.text}\n</chunk>`
          }
        ]
      });

      const context = text.trim();
      const contextualText = `[${context}]\n\n${chunk.text}`;

      enriched.push({
        ...chunk,
        contextualText
      });

      // Track cost (Haiku: $1/M input, $5/M output approximated)
      await incrementPaperCost(tenantId, paperId, 'enrichment', usage.usd);
      await trackUsage(
        tenantId,
        'reasoningTokens',
        usage.inputTokens + usage.outputTokens,
        usage.usd
      );
    } catch (err) {
      // Hotfix-3: only log first failure to avoid spam
      if (chunk.chunkIdx === 0) {
        console.error(
          JSON.stringify({
            level: 'warn',
            event: 'enrichment_failed_using_raw',
            paperId,
            firstFailure: true,
            error: err instanceof Error ? err.message : String(err)
          })
        );
      }
      enriched.push({
        ...chunk,
        contextualText: chunk.text
      });
    }
  }

  return enriched;
}
