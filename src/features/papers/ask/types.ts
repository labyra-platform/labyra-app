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
  /** Perplexity-style follow-up questions the model proposed after the answer. */
  suggestedQuestions?: string[];
  /** Selection text the user attached to the question, if any. */
  selectionText?: string;
  createdAt: number;
}

/** After the answer, the model may emit this marker followed by 2-3 follow-up
 *  questions (one per line). Chosen not to collide with Markdown (unlike "---").
 *  The client strips it from the rendered answer and shows chips; the route
 *  strips it before verifying/persisting. */
export const FOLLOWUP_SENTINEL = '[[FOLLOWUP]]';

/** Split a completed answer into its prose and the follow-up questions. */
export function splitFollowups(text: string): { answer: string; questions: string[] } {
  const idx = text.indexOf(FOLLOWUP_SENTINEL);
  if (idx === -1) return { answer: text, questions: [] };
  const answer = text.slice(0, idx).trimEnd();
  const questions = text
    .slice(idx + FOLLOWUP_SENTINEL.length)
    .split('\n')
    .map((l) =>
      l
        .replace(/^[\s\-*\d.)\]]+/, '')
        .replace(/\[\[.*$/, '')
        .trim()
    )
    .filter((l) => l.length > 3 && l.endsWith('?'))
    .slice(0, 3);
  return { answer, questions };
}

/** For streaming display: hide the answer's follow-up block AND any half-streamed
 *  sentinel at the tail so the marker never flashes on screen. */
export function stripFollowupArtifact(text: string): string {
  const clean = splitFollowups(text).answer;
  for (let i = Math.min(FOLLOWUP_SENTINEL.length - 1, clean.length); i > 0; i--) {
    if (clean.endsWith(FOLLOWUP_SENTINEL.slice(0, i))) {
      return clean.slice(0, clean.length - i);
    }
  }
  return clean;
}

export interface AskRequestBody {
  question: string;
  /** Optional passage the user is asking about (Ctrl+drag → Ask AI). */
  selectionText?: string;
  /** UI locale ('en' | 'vi') — the model answers in this language by default. */
  locale?: string;
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
