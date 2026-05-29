/**
 * Translation Memory + Retrieval-Augmented Translation (ADR-045, Tier 4).
 *
 * Idea (Cai et al. 2021; in-context example selection, Zebaze 2024): keep the
 * source→target pairs the lab has already translated, and when translating a
 * new passage, retrieve the most similar past pairs and inject them as in-context
 * examples so terminology and phrasing stay consistent across a paper and across
 * the whole library. This complements Tier 2's static glossary with the lab's
 * own evolving usage.
 *
 * Storage: a dedicated Pinecone namespace (tm__<tenantId>) — see pinecone.ts.
 * Everything here is best-effort: on cold start (empty TM) or any error it
 * returns nothing / does nothing, and translation proceeds unaffected.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { getEmbeddingProvider } from '@/lib/ai/rag/embedding';
import { trackUsage } from '@/lib/ai/governance/quota';
import {
  type TmMetadata,
  type TmUpsertVector,
  tmQuery,
  tmUpsert
} from '@/lib/ai/rag/vector-store/pinecone';

const MIN_LEN = 40; // don't memorize trivially short snippets (titles, fragments)
const TOP_K = 3;
const MIN_SCORE = 0.78; // cosine; below this the "example" is more noise than help
const STORE_CAP = 280; // cap stored text length (metadata stays small)
const EMBED_CAP = 2000; // cap text sent to the embedder

export interface TmEntry {
  source: string;
  translation: string;
  score: number;
}

function tmId(source: string, lang: string): string {
  return createHash('sha256').update(`${lang}\u0000${source}`).digest('hex').slice(0, 40);
}

/** Retrieve similar past translations (same target language) for the passage. */
export async function tmRetrieve(tenantId: string, text: string, lang: string): Promise<TmEntry[]> {
  const q = text.trim();
  if (q.length < MIN_LEN) return [];
  try {
    const { embeddings, totalTokens, costUsd } = await getEmbeddingProvider().embed(
      [q.slice(0, EMBED_CAP)],
      'query'
    );
    void trackUsage(tenantId, 'embedTokens', totalTokens, costUsd).catch(() => {});
    const vec = embeddings[0];
    if (!vec) return [];
    const matches = await tmQuery(tenantId, vec, TOP_K, { lang });
    return matches
      .filter((m) => m.score >= MIN_SCORE)
      .map((m) => ({
        source: m.metadata.source,
        translation: m.metadata.translation,
        score: m.score
      }));
  } catch {
    return [];
  }
}

/** Store source→translation pairs for future retrieval (fire-and-forget). */
export async function tmStore(
  tenantId: string,
  pairs: { source: string; translation: string }[],
  lang: string
): Promise<void> {
  const valid = pairs.filter(
    (p) => p.source.trim().length >= MIN_LEN && p.translation.trim().length > 0
  );
  if (valid.length === 0) return;
  try {
    const { embeddings, totalTokens, costUsd } = await getEmbeddingProvider().embed(
      valid.map((p) => p.source.slice(0, EMBED_CAP)),
      'document'
    );
    void trackUsage(tenantId, 'embedTokens', totalTokens, costUsd).catch(() => {});
    const vectors: TmUpsertVector[] = [];
    for (let i = 0; i < valid.length; i++) {
      const values = embeddings[i];
      if (!Array.isArray(values)) continue;
      const p = valid[i];
      vectors.push({
        id: tmId(p.source, lang),
        values,
        metadata: {
          source: p.source.slice(0, STORE_CAP),
          translation: p.translation.slice(0, STORE_CAP),
          lang
        } as TmMetadata
      });
    }
    await tmUpsert(tenantId, vectors);
  } catch {
    // best-effort
  }
}

/** Build the prompt block from retrieved entries (empty string if none). */
export function tmBlock(entries: TmEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries
    .map(
      (e) =>
        `- "${e.source.replace(/\s+/g, ' ').slice(0, 160)}" → "${e.translation
          .replace(/\s+/g, ' ')
          .slice(0, 160)}"`
    )
    .join('\n');
  return `TRANSLATION MEMORY — you previously translated similar passages from this library as below. Reuse the SAME terminology and phrasing for consistency wherever the meaning matches (ignore any that aren't relevant; never copy unrelated content):\n${lines}`;
}
