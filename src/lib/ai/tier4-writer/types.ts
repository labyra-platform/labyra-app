/**
 * T4 Writer types — paper section drafting orchestrator.
 * @phase R173-4
 */
import type { AiCostBreakdown } from '@/types/ai';

export type SectionType = 'methods' | 'results' | 'discussion' | 'introduction' | 'auto';

export interface WriterCitation {
  /** Paper ID from RAG search */
  paperId: string;
  /** Chunk IDs used for context */
  chunkIds: string[];
  /** Citation key as inserted in draft (e.g., 'smith2024') */
  citationKey: string;
}

export interface WriterResult {
  /** Final drafted text */
  draft: string;
  /** Detected/specified section type */
  /** Final resolved section (never 'auto') */
  section: Exclude<SectionType, 'auto'>;
  /** Citations used in draft */
  citations: WriterCitation[];
  /** Total cost breakdown */
  totalCost: AiCostBreakdown;
  /** Duration in ms */
  durationMs: number;
  /** Number of source papers consulted */
  sourceCount: number;
}

export interface WriterOptions {
  userMessage: string;
  tenantId: string;
  /** Optional explicit section type; if 'auto', classifier decides */
  sectionType?: SectionType;
  /** Stream callback for live UX */
  onTextDelta?: (delta: string) => void;
  /** Called when search phase completes */
  onSearchComplete?: (paperCount: number) => void;
}
