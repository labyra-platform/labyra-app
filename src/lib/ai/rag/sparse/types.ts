/**
 * Sparse vector + BM25 types.
 * @phase R160-ai-5d-2
 */

export interface SparseVector {
  /** Token indices (vocab position) */
  indices: number[];
  /** Token weights (BM25 score per term) */
  values: number[];
}

export interface BM25Params {
  schemaVersion: 1;
  /** Total documents fit on */
  totalDocs: number;
  /** Average document length (tokens) */
  avgDocLen: number;
  /** Number of unique tokens in vocab */
  vocabSize: number;
  /** Last fit timestamp */
  fittedAt: number;
  /** Tokenizer ID used during fit (must match query tokenizer) */
  tokenizerId: string;
}

export interface BM25TermScore {
  /** Token string */
  term: string;
  /** Inverse document frequency */
  idf: number;
}

export interface Tokenizer {
  readonly id: string;
  tokenize(text: string): string[];
}

export interface SparseEncoder {
  readonly id: string;
  isFitted(): boolean;
  fit(corpus: string[]): Promise<void>;
  encode(text: string): SparseVector;
  /** Score documents against query (BM25 style) */
  score(query: string, documents: string[]): number[];
  getParams(): BM25Params | null;
}
