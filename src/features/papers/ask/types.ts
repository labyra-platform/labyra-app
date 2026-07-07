/**
 * Ask AI — types shared by the API route and the side panel.
 *
 * @phase R237am Ask AI Q&A inside a single paper
 */
import type { NumericVerification } from '@/lib/ai/verify/numeric-claims';

/** A grounded source surfaced under an assistant answer. */
export interface AskCitation {
  /** 1-based index used in the answer text like "[1]". */
  idx: number;
  /** Paper chunk identifier = `${paperId}-${chunkIdx}` (worker convention). */
  chunkId: string;
  /** chunkIdx in the paper (0-based). */
  chunkIdx: number;
  /** First page the chunk falls on — what the citation button jumps to. */
  page: number;
  /** Section heading the chunk came from, if any. */
  section: string;
  /** Short snippet of the chunk's text shown on hover / under the answer. */
  snippet: string;
  /** Rerank score (0-1) — drives the trust chip. */
  score: number;
}

export interface AskMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Only present on assistant messages. */
  citations?: AskCitation[];
  /** Avg rerank score across citations — used for trust chip + L9 escalation. */
  trustScore?: number;
  /** True when retrieval found nothing relevant (we refused to hallucinate). */
  noAnswer?: boolean;
  verification?: NumericVerification;
  /** Selection text the user attached to the question, if any. */
  selectionText?: string;
  createdAt: number;
}

export interface AskRequestBody {
  question: string;
  /** Optional passage the user is asking about (Ctrl+drag → Ask AI). */
  selectionText?: string;
}

/** Trailing JSON frame appended to the answer stream so the client can render
 *  citation chips + the trust score without a second round-trip. The frame is
 *  preceded by a unique sentinel so the client can split it off the text. */
export const ASK_META_SENTINEL = '\u0001<<ASK_META>>\u0001';
export interface AskStreamMeta {
  citations: AskCitation[];
  trustScore: number;
  noAnswer: boolean;
  /** Tier-1 numeric claim verification (R416). Absent when no numbers were checked. */
  verification?: NumericVerification;
}
