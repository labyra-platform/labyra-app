/**
 * BM25 encoder — wraps wink-nlp BM25Vectorizer.
 * @phase R160-ai-5d-2
 *
 * IMPORTANT: BM25 is "single-fit" — fit once on the entire corpus, then encode.
 * Cannot incrementally add documents (would need re-fit).
 * Our strategy: daily batch re-fit + cold start re-fit.
 */
import 'server-only';
import type { SparseEncoder, SparseVector, BM25Params, Tokenizer } from './types';

// wink BM25Vectorizer is CommonJS — dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _BM25Vectorizer: any | null = null;

async function loadBM25() {
  if (_BM25Vectorizer) return _BM25Vectorizer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('wink-nlp/utilities/bm25-vectorizer.js' as any)) as any;
  _BM25Vectorizer = mod.default ?? mod;
  return _BM25Vectorizer;
}

export class BM25Encoder implements SparseEncoder {
  readonly id = 'wink-bm25';
  private tokenizer: Tokenizer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private vectorizer: any = null;
  private params: BM25Params | null = null;
  /** vocab: term → index */
  private vocab: Map<string, number> = new Map();

  constructor(tokenizer: Tokenizer) {
    this.tokenizer = tokenizer;
  }

  isFitted(): boolean {
    return this.params !== null && this.vectorizer !== null;
  }

  async fit(corpus: string[]): Promise<void> {
    const BM25Vectorizer = await loadBM25();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bm25: any = BM25Vectorizer();

    let totalLen = 0;
    for (const doc of corpus) {
      const tokens = this.tokenizer.tokenize(doc);
      if (tokens.length === 0) continue;
      bm25.learn(tokens);
      totalLen += tokens.length;
    }

    this.vectorizer = bm25;

    // Build vocab from BM25 internal terms (via bowOf on combined corpus)
    // wink BM25 doesn't expose vocab directly; we maintain ours via consistent indexing.
    const allTokens = new Set<string>();
    for (const doc of corpus) {
      for (const t of this.tokenizer.tokenize(doc)) {
        allTokens.add(t);
      }
    }
    this.vocab = new Map();
    let idx = 0;
    for (const t of Array.from(allTokens).sort()) {
      this.vocab.set(t, idx++);
    }

    this.params = {
      schemaVersion: 1,
      totalDocs: corpus.length,
      avgDocLen: corpus.length > 0 ? totalLen / corpus.length : 0,
      vocabSize: this.vocab.size,
      fittedAt: Date.now(),
      tokenizerId: this.tokenizer.id
    };
  }

  encode(text: string): SparseVector {
    if (!this.isFitted()) {
      throw new Error('BM25Encoder not fitted yet');
    }
    const tokens = this.tokenizer.tokenize(text);
    if (tokens.length === 0) return { indices: [], values: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bow = (this.vectorizer as any).bowOf(tokens) as Record<string, number>;
    const indices: number[] = [];
    const values: number[] = [];
    for (const [term, weight] of Object.entries(bow)) {
      const i = this.vocab.get(term);
      if (i !== undefined) {
        indices.push(i);
        values.push(weight);
      }
    }
    return { indices, values };
  }

  score(query: string, documents: string[]): number[] {
    if (!this.isFitted()) {
      throw new Error('BM25Encoder not fitted yet');
    }
    const queryTokens = this.tokenizer.tokenize(query);
    if (queryTokens.length === 0) return documents.map(() => 0);

    const queryVec = this.encode(query);
    const queryMap = new Map<number, number>();
    for (let i = 0; i < queryVec.indices.length; i++) {
      queryMap.set(queryVec.indices[i], queryVec.values[i]);
    }

    return documents.map((doc) => {
      const docVec = this.encode(doc);
      let dot = 0;
      for (let i = 0; i < docVec.indices.length; i++) {
        const qWeight = queryMap.get(docVec.indices[i]);
        if (qWeight !== undefined) {
          dot += qWeight * docVec.values[i];
        }
      }
      return dot;
    });
  }

  getParams(): BM25Params | null {
    return this.params;
  }

  /** Export vocab for persistence (sorted list — index = position) */
  getVocab(): string[] {
    const arr = Array.from<string>({ length: this.vocab.size });
    for (const [term, idx] of this.vocab.entries()) {
      arr[idx] = term;
    }
    return arr;
  }

  /** Restore from persisted state (skip fit, useful for cold-start with saved params) */
  async restore(vocab: string[], params: BM25Params, corpus: string[]): Promise<void> {
    // wink BM25 doesn't support state import — must refit, but we can validate vocab matches
    await this.fit(corpus);
    if (this.params) {
      this.params.fittedAt = params.fittedAt;
    }
  }
}
