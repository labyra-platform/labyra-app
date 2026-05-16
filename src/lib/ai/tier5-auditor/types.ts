/**
 * T5 Auditor types — peer-review audit of T3/T4 responses.
 * @phase R173-5
 */
import type { AiCostBreakdown } from '@/types/ai';

export type ClaimType = 'numerical' | 'citation' | 'mechanism' | 'definition';

export type Verdict = 'supported' | 'partially_supported' | 'unsupported' | 'contradicted';

export interface ExtractedClaim {
  /** Original text of the claim */
  text: string;
  /** Claim type (heuristic classification) */
  type: ClaimType;
  /** Line number in source response */
  line: number;
}

export interface AuditFinding {
  claim: string;
  type: ClaimType;
  verdict: Verdict;
  /** 0-1 confidence in the verdict itself */
  confidence: number;
  /** Chunk IDs that informed the verdict */
  evidenceChunkIds: string[];
  /** Brief reasoning (<30 words) */
  reasoning: string;
}

export interface AuditResult {
  /** Doc ID under tenants/{tid}/aiAudits/{auditId} */
  auditId: string;
  /** Source message being audited */
  sourceMessageId: string;
  /** Source conversation */
  sourceConversationId: string;
  /** Individual claim findings */
  findings: AuditFinding[];
  /** Weighted overall confidence 0-1 */
  overallConfidence: number;
  /** Number of supported vs unsupported claims */
  supportedCount: number;
  unsupportedCount: number;
  contradictedCount: number;
  /** Total cost */
  totalCost: AiCostBreakdown;
  /** Evaluator model used */
  evaluatorModel: string;
  /** Timestamp ms */
  evaluatedAt: number;
  /** Duration ms */
  durationMs: number;
}

export interface AuditorOptions {
  tenantId: string;
  conversationId: string;
  messageId: string;
  /** Original response text to audit */
  responseText: string;
  /** RAG chunks used in original response (from aiProvenance) */
  ragChunks?: Array<{ paperId: string; chunkId: string; text?: string }>;
  /** Stream callback */
  onClaimEvaluated?: (finding: AuditFinding) => void;
}
