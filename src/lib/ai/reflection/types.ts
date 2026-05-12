/**
 * Reflection layer types — T3 self-critic with sufficiency check.
 * @phase R160-ai-4
 */
import type { AiCostBreakdown } from '@/types/ai';

export interface ReflectionCritique {
  sufficient: boolean;
  /** Specific issues found (empty array if sufficient) */
  issues: string[];
  /** Brief overall assessment */
  summary: string;
  cost: AiCostBreakdown;
  latencyMs: number;
}

export interface ReflectionRound {
  /** Round number, 1-indexed */
  round: number;
  /** Assistant response text in this round */
  response: string;
  /** Critique of the response (next round revises based on this) */
  critique: ReflectionCritique;
  /** Cost of generating the response (not including critique) */
  responseCost: AiCostBreakdown;
  /** Time to generate response (not including critique) */
  responseLatencyMs: number;
}

export interface ReflectionResult {
  /** All rounds attempted; last round's response is the final answer */
  rounds: ReflectionRound[];
  /** Total iterations (= rounds.length) */
  iterations: number;
  /** Whether reflection ended via sufficiency check vs max iterations */
  stoppedReason: 'sufficient' | 'max_iterations' | 'error';
  /** Final response text (= rounds[last].response) */
  finalResponse: string;
  /** Aggregated cost across all rounds + critiques */
  totalCost: AiCostBreakdown;
  /** Total time including all rounds */
  totalLatencyMs: number;
}
